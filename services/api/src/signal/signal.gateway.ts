import { Logger } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer, OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { SignalService } from './signal.service';
import { PresenceService } from './presence.service';
import { ChatService } from './chat.service';
import { PollService } from './poll.service';
import { QAService } from './qa.service';
import { ReactionService } from './reaction.service';
import { GraceService } from './grace.service';
import { HandsService } from '../hands/hands.service';
import { ParticipantRole, SessionRole, canModerateSession, normalizeSessionRole } from '@webinar/shared';

function canModerate(role: string): boolean {
  return canModerateSession(normalizeSessionRole(role));
}

function canPresent(role: string): boolean {
  const r = normalizeSessionRole(role);
  return canModerateSession(r) || r === SessionRole.PRESENTER;
}

interface Msg {
  event: string;
  data?: Record<string, unknown>;
}

const wsParticipant = new WeakMap<WebSocket, string>();

@WebSocketGateway({ path: '/signal' })
export class SignalGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  private readonly logger = new Logger(SignalGateway.name);

  constructor(
    private readonly signal: SignalService,
    private readonly presence: PresenceService,
    private readonly chat: ChatService,
    private readonly poll: PollService,
    private readonly qa: QAService,
    private readonly reaction: ReactionService,
    private readonly grace: GraceService,
    private readonly hands: HandsService,
  ) {}

  afterInit() {
    this.logger.log('Signal Gateway ready at ws://.../signal');
  }

  handleConnection(ws: WebSocket, _req: IncomingMessage) {
    ws.on('message', async (raw: Buffer | string) => {
      let msg: Msg;
      try { msg = JSON.parse(raw.toString()) as Msg; }
      catch { this.signal.sendDirect(ws, 'error', { message: 'Invalid JSON' }); return; }

      const participantId = wsParticipant.get(ws);
      try { await this.route(ws, msg, participantId); }
      catch (err: any) {
        this.logger.error(`[${msg.event}] ${err.message}`);
        this.signal.sendDirect(ws, 'error', { message: err.message || 'Internal error' });
      }
    });
  }

  async handleDisconnect(ws: WebSocket) {
    const participantId = wsParticipant.get(ws);
    if (!participantId) return;
    const client = this.signal.getClient(participantId);
    if (!client) return;

    await this.grace.enterGrace(participantId, client.roomId);
    this.signal.removeClient(participantId);
    await this.presence.removePresence(participantId, client.roomId);

    setTimeout(async () => {
      const stillInGrace = await this.grace.isInGrace(participantId);
      if (stillInGrace) {
        this.signal.broadcast(client.roomId, 'participant-left', {
          userId: participantId,
          userName: client.userName,
        });
      }
    }, 60_000);
  }

  private pid(participantId?: string): string | undefined {
    return participantId;
  }

  private async route(ws: WebSocket, msg: Msg, participantId?: string) {
    const d = msg.data ?? {};

    switch (msg.event) {

      case 'join-room': {
        const token = d.token as string;
        const roomId = d.roomId as string;
        if (!token || !roomId) {
          this.signal.sendDirect(ws, 'error', { message: 'token and roomId required' });
          return;
        }

        const payload = this.signal.validateToken(token);
        if (!payload) {
          this.signal.sendDirect(ws, 'error', { message: 'Invalid or expired token' });
          return;
        }

        const userName = (d.userName as string) || payload.displayName || payload.sub;
        const role = (d.role as string) || payload.role || 'attendee';

        await this.grace.clearGraceIfPresent(payload.sub);

        let client;
        try {
          client = this.signal.registerClient(ws, payload, roomId, userName, role);
        } catch (err: any) {
          this.signal.sendDirect(ws, 'error', { message: err.message });
          return;
        }

        wsParticipant.set(ws, payload.sub);

        await this.presence.setPresence(payload.sub, {
          userName,
          online: true,
          roomId,
          role: role as ParticipantRole,
          connectionQuality: 'excellent',
          lastSeen: Date.now(),
        });

        const [history, presenceList, activePoll, raisedHands, audioRequests] = await Promise.all([
          this.chat.getHistory(roomId),
          this.presence.getRoomPresence(roomId),
          this.poll.getActivePoll(roomId),
          this.hands.getRaisedHands(roomId),
          this.hands.getAudioRequests(roomId),
        ]);

        this.signal.sendDirect(ws, 'room-state', {
          history,
          presence: presenceList,
          activePoll,
          raisedHands,
          audioRequests,
          connectionEpoch: client.connectionEpoch,
        });
        this.signal.broadcast(roomId, 'participant-joined', {
          userId: payload.sub,
          userName,
          role,
        }, payload.sub);
        break;
      }

      case 'leave-room': {
        if (!participantId) return;
        const client = this.signal.removeClient(participantId);
        if (client) {
          await this.presence.removePresence(participantId, client.roomId);
          this.signal.broadcast(client.roomId, 'participant-left', {
            userId: participantId,
            userName: client.userName,
          });
        }
        break;
      }

      case 'ping': {
        this.signal.sendDirect(ws, 'pong', {
          ts: d.ts,
          serverTs: Date.now(),
        });
        if (participantId) await this.presence.heartbeat(participantId);
        break;
      }

      case 'heartbeat': {
        if (participantId) await this.presence.heartbeat(participantId);
        break;
      }

      // ── WebRTC signaling relay ─────────────────────────────────────────────
      case 'webrtc-offer':
      case 'webrtc-answer':
      case 'webrtc-ice':
      case 'webrtc-restart': {
        if (!participantId) return;
        const targetId = d.targetParticipantId as string;
        if (!targetId) return;
        this.signal.relayWebRtc(participantId, targetId, msg.event, d);
        break;
      }

      case 'chat': {
        if (!participantId) return;
        const client = this.signal.getClient(participantId);
        if (!client) return;
        const message = ((d.message as string) || '').trim();
        if (!message) return;
        const saved = await this.chat.save(client.roomId, participantId, client.userName, message);
        this.signal.broadcast(client.roomId, 'chat', {
          id: saved.id, userId: participantId, userName: client.userName, message, timestamp: saved.createdAt,
        });
        break;
      }

      case 'raise-hand': {
        if (!participantId) return;
        const c = this.signal.getClient(participantId);
        if (!c) return;
        const entry = await this.hands.raiseHand(c.roomId, participantId, c.userName);
        this.signal.broadcast(c.roomId, 'hand-raised', { ...entry, raised: true });
        break;
      }

      case 'lower-hand': {
        if (!participantId) return;
        const c = this.signal.getClient(participantId);
        if (!c) return;
        await this.hands.lowerHand(c.roomId, participantId);
        this.signal.broadcast(c.roomId, 'hand-raised', { userId: participantId, userName: c.userName, raised: false });
        break;
      }

      case 'request-audio': {
        if (!participantId) return;
        const c = this.signal.getClient(participantId);
        if (!c) return;
        const req = await this.hands.requestAudio(c.roomId, participantId, c.userName);
        this.signal.getRoomClients(c.roomId).forEach((rc) => {
          if (canModerate(rc.role)) {
            this.signal.sendTo(rc.participantId, 'audio-requested', req);
          }
        });
        this.signal.sendDirect(ws, 'audio-request-pending', req);
        break;
      }

      case 'approve-audio': {
        if (!participantId) return;
        const c = this.signal.getClient(participantId);
        if (!c || !canModerate(c.role)) {
          this.signal.sendDirect(ws, 'error', { message: 'Not authorized' });
          return;
        }
        const targetId = d.userId as string;
        const req = await this.hands.approveAudio(c.roomId, targetId);
        if (req) {
          this.signal.broadcast(c.roomId, 'audio-approved', { userId: targetId });
          this.signal.sendTo(targetId, 'audio-approved', { userId: targetId, canPublishAudio: true });
        }
        break;
      }

      case 'deny-audio': {
        if (!participantId) return;
        const c = this.signal.getClient(participantId);
        if (!c || !canModerate(c.role)) {
          this.signal.sendDirect(ws, 'error', { message: 'Not authorized' });
          return;
        }
        const targetId = d.userId as string;
        await this.hands.denyAudio(c.roomId, targetId);
        this.signal.sendTo(targetId, 'audio-denied', { userId: targetId });
        break;
      }

      case 'reaction': {
        if (!participantId) return;
        const c = this.signal.getClient(participantId);
        if (!c) return;
        const type = d.type as string;
        if (!this.reaction.isValid(type)) {
          this.signal.sendDirect(ws, 'error', { message: 'Invalid reaction type' });
          return;
        }
        if (this.reaction.isRateLimited(participantId)) return;
        this.reaction.record(participantId);
        this.signal.broadcast(c.roomId, 'reaction', {
          userId: participantId, userName: c.userName, type, timestamp: Date.now(),
        });
        break;
      }

      case 'poll-create': {
        if (!participantId) return;
        const c = this.signal.getClient(participantId);
        if (!c || !canPresent(c.role)) {
          this.signal.sendDirect(ws, 'error', { message: 'Only organizer/presenter can create polls' });
          return;
        }
        const p = await this.poll.createPoll(c.roomId, d.question as string, d.options as string[]);
        this.signal.broadcast(c.roomId, 'poll-created', p);
        break;
      }

      case 'poll-vote': {
        if (!participantId) return;
        const c = this.signal.getClient(participantId);
        if (!c) return;
        const result = await this.poll.submitVote(d.pollId as string, d.optionId as string, participantId);
        this.signal.broadcast(c.roomId, 'poll-result', result);
        break;
      }

      case 'poll-close': {
        if (!participantId) return;
        const c = this.signal.getClient(participantId);
        if (!c || !canModerate(c.role)) {
          this.signal.sendDirect(ws, 'error', { message: 'Only organizer/co-organizer can close polls' });
          return;
        }
        await this.poll.closePoll(d.pollId as string);
        this.signal.broadcast(c.roomId, 'poll-closed', { pollId: d.pollId });
        break;
      }

      case 'question-submit': {
        if (!participantId) return;
        const c = this.signal.getClient(participantId);
        if (!c) return;
        const q = await this.qa.submit(c.roomId, participantId, c.userName, d.text as string);
        this.signal.getRoomClients(c.roomId).forEach((rc) => {
          if (canModerate(rc.role)) {
            this.signal.sendTo(rc.participantId, 'question-pending', q);
          }
        });
        this.signal.sendDirect(ws, 'question-submitted', { id: q.id, status: q.status });
        break;
      }

      case 'question-approve': {
        if (!participantId) return;
        const c = this.signal.getClient(participantId);
        if (!c || !canModerate(c.role)) {
          this.signal.sendDirect(ws, 'error', { message: 'Not authorized' });
          return;
        }
        const q = await this.qa.approve(d.questionId as string);
        this.signal.broadcast(c.roomId, 'question-approved', q);
        break;
      }

      case 'question-reject': {
        if (!participantId) return;
        const c = this.signal.getClient(participantId);
        if (!c || !canModerate(c.role)) {
          this.signal.sendDirect(ws, 'error', { message: 'Not authorized' });
          return;
        }
        const q = await this.qa.reject(d.questionId as string);
        this.signal.sendTo(q.userId, 'question-rejected', { id: q.id });
        break;
      }

      case 'question-answer': {
        if (!participantId) return;
        const c = this.signal.getClient(participantId);
        if (!c || !canPresent(c.role)) {
          this.signal.sendDirect(ws, 'error', { message: 'Not authorized' });
          return;
        }
        const q = await this.qa.answer(d.questionId as string, d.answer as string);
        this.signal.broadcast(c.roomId, 'question-answered', q);
        break;
      }

      case 'question-upvote': {
        if (!participantId) return;
        const c = this.signal.getClient(participantId);
        if (!c) return;
        const q = await this.qa.upvote(d.questionId as string, participantId);
        this.signal.broadcast(c.roomId, 'question-upvoted', { id: q.id, upvotes: q.upvotes });
        break;
      }

      case 'admit-participant': {
        if (!participantId) return;
        const c = this.signal.getClient(participantId);
        if (!c || !canModerate(c.role)) {
          this.signal.sendDirect(ws, 'error', { message: 'Only organizer can admit' });
          return;
        }
        const targetId = d.userId as string;
        this.signal.sendTo(targetId, 'participant-admitted', { roomId: c.roomId, admittedBy: c.userName });
        this.signal.broadcast(c.roomId, 'participant-admitted', { userId: targetId });
        break;
      }

      /**
       * force-mute — host/co-organizer mutes or un-mutes an attendee.
       * Payload: { userId: string; muted: boolean }
       * Used by the native WebRTC path; LiveKit path uses mutePublishedTrack REST.
       */
      case 'force-mute': {
        if (!participantId) return;
        const c = this.signal.getClient(participantId);
        if (!c || !canModerate(c.role)) {
          this.signal.sendDirect(ws, 'error', { message: 'Not authorised to force-mute' });
          return;
        }
        const targetId = d.userId as string;
        const muted = (d.muted as boolean) ?? true;
        if (!targetId) return;
        // Tell the target to mute/unmute their local audio track.
        this.signal.sendTo(targetId, 'force-muted', { userId: targetId, muted });
        // Broadcast so every participant's People panel reflects the new state.
        this.signal.broadcast(c.roomId, 'participant-muted', { userId: targetId, muted });
        break;
      }

      /**
       * recording-status — host broadcasts whether recording is active.
       * Payload: { isRecording: boolean }
       * Lets attendees display the REC indicator without polling the REST API.
       */
      case 'recording-status': {
        if (!participantId) return;
        const c = this.signal.getClient(participantId);
        if (!c || !canModerate(c.role)) return;
        this.signal.broadcast(c.roomId, 'recording-status', d, participantId);
        break;
      }

      default:
        this.logger.debug(`Unknown event: ${msg.event}`);
    }
  }
}
