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
import { ParticipantRole } from '@webinar/shared';

interface Msg {
  event: string;
  data?: Record<string, unknown>;
}

// WeakMap: ws → userId (survives disconnect)
const wsUser = new WeakMap<WebSocket, string>();

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
  ) {}

  afterInit() {
    this.logger.log('Signal Gateway ready at ws://.../signal');
  }

  handleConnection(ws: WebSocket, _req: IncomingMessage) {
    ws.on('message', async (raw: Buffer | string) => {
      let msg: Msg;
      try { msg = JSON.parse(raw.toString()) as Msg; }
      catch { this.signal.sendDirect(ws, 'error', { message: 'Invalid JSON' }); return; }

      const userId = wsUser.get(ws);
      try { await this.route(ws, msg, userId); }
      catch (err: any) {
        this.logger.error(`[${msg.event}] ${err.message}`);
        this.signal.sendDirect(ws, 'error', { message: err.message || 'Internal error' });
      }
    });
  }

  handleDisconnect(ws: WebSocket) {
    const userId = wsUser.get(ws);
    if (!userId) return;
    const client = this.signal.removeClient(userId);
    if (client) {
      this.presence.removePresence(userId, client.roomId).catch(() => {});
      this.signal.broadcast(client.roomId, 'participant-left', { userId, userName: client.userName });
    }
  }

  private async route(ws: WebSocket, msg: Msg, userId?: string) {
    const d = msg.data ?? {};

    switch (msg.event) {

      // ── Auth & Room join ────────────────────────────────────────────────────
      case 'join-room': {
        const token = d.token as string;
        const roomId = d.roomId as string;
        if (!token || !roomId) { this.signal.sendDirect(ws, 'error', { message: 'token and roomId required' }); return; }

        const payload = this.signal.validateToken(token);
        if (!payload) { this.signal.sendDirect(ws, 'error', { message: 'Invalid or expired token' }); return; }

        const uid = payload.sub;
        const userName = (d.userName as string) || payload.email?.split('@')[0] || uid;
        const role = (d.role as string) || 'attendee';

        wsUser.set(ws, uid);
        this.signal.addClient({ ws, userId: uid, userName, roomId, role });

        await this.presence.setPresence(uid, {
          userName, online: true, roomId, role: role as ParticipantRole,
          connectionQuality: 'excellent', lastSeen: Date.now(),
        });

        const [history, presenceList, activePoll] = await Promise.all([
          this.chat.getHistory(roomId),
          this.presence.getRoomPresence(roomId),
          this.poll.getActivePoll(roomId),
        ]);

        this.signal.sendDirect(ws, 'room-state', { history, presence: presenceList, activePoll });
        this.signal.broadcast(roomId, 'participant-joined', { userId: uid, userName, role }, uid);
        break;
      }

      case 'leave-room': {
        if (!userId) return;
        const client = this.signal.removeClient(userId);
        if (client) {
          await this.presence.removePresence(userId, client.roomId);
          this.signal.broadcast(client.roomId, 'participant-left', { userId, userName: client.userName });
        }
        break;
      }

      case 'heartbeat': {
        if (userId) await this.presence.heartbeat(userId);
        break;
      }

      // ── Chat ────────────────────────────────────────────────────────────────
      case 'chat': {
        if (!userId) return;
        const client = this.signal.getClient(userId);
        if (!client) return;
        const message = ((d.message as string) || '').trim();
        if (!message) return;
        const saved = await this.chat.save(client.roomId, userId, client.userName, message);
        this.signal.broadcast(client.roomId, 'chat', {
          id: saved.id, userId, userName: client.userName, message, timestamp: saved.createdAt,
        });
        break;
      }

      // ── Hand raise ──────────────────────────────────────────────────────────
      case 'raise-hand': {
        if (!userId) return;
        const c = this.signal.getClient(userId);
        if (!c) return;
        this.signal.broadcast(c.roomId, 'hand-raised', { userId, userName: c.userName, raised: true });
        break;
      }

      case 'lower-hand': {
        if (!userId) return;
        const c = this.signal.getClient(userId);
        if (!c) return;
        this.signal.broadcast(c.roomId, 'hand-raised', { userId, userName: c.userName, raised: false });
        break;
      }

      // ── Reactions ───────────────────────────────────────────────────────────
      case 'reaction': {
        if (!userId) return;
        const c = this.signal.getClient(userId);
        if (!c) return;
        const type = d.type as string;
        if (!this.reaction.isValid(type)) { this.signal.sendDirect(ws, 'error', { message: 'Invalid reaction type' }); return; }
        if (this.reaction.isRateLimited(userId)) return;
        this.reaction.record(userId);
        this.signal.broadcast(c.roomId, 'reaction', { userId, userName: c.userName, type, timestamp: Date.now() });
        break;
      }

      // ── Polls ───────────────────────────────────────────────────────────────
      case 'poll-create': {
        if (!userId) return;
        const c = this.signal.getClient(userId);
        if (!c || !['host', 'presenter'].includes(c.role)) {
          this.signal.sendDirect(ws, 'error', { message: 'Only host/presenter can create polls' }); return;
        }
        const p = await this.poll.createPoll(c.roomId, d.question as string, d.options as string[]);
        this.signal.broadcast(c.roomId, 'poll-created', p);
        break;
      }

      case 'poll-vote': {
        if (!userId) return;
        const c = this.signal.getClient(userId);
        if (!c) return;
        const result = await this.poll.submitVote(d.pollId as string, d.optionId as string, userId);
        this.signal.broadcast(c.roomId, 'poll-result', result);
        break;
      }

      case 'poll-close': {
        if (!userId) return;
        const c = this.signal.getClient(userId);
        if (!c || c.role !== 'host') { this.signal.sendDirect(ws, 'error', { message: 'Only host can close polls' }); return; }
        await this.poll.closePoll(d.pollId as string);
        this.signal.broadcast(c.roomId, 'poll-closed', { pollId: d.pollId });
        break;
      }

      // ── Q&A ─────────────────────────────────────────────────────────────────
      case 'question-submit': {
        if (!userId) return;
        const c = this.signal.getClient(userId);
        if (!c) return;
        const q = await this.qa.submit(c.roomId, userId, c.userName, d.text as string);
        // Notify moderators and host
        this.signal.getRoomClients(c.roomId).forEach((rc) => {
          if (['host', 'moderator'].includes(rc.role)) {
            this.signal.sendTo(rc.userId, 'question-pending', q);
          }
        });
        this.signal.sendDirect(ws, 'question-submitted', { id: q.id, status: q.status });
        break;
      }

      case 'question-approve': {
        if (!userId) return;
        const c = this.signal.getClient(userId);
        if (!c || !['host', 'moderator'].includes(c.role)) { this.signal.sendDirect(ws, 'error', { message: 'Not authorized' }); return; }
        const q = await this.qa.approve(d.questionId as string);
        this.signal.broadcast(c.roomId, 'question-approved', q);
        break;
      }

      case 'question-reject': {
        if (!userId) return;
        const c = this.signal.getClient(userId);
        if (!c || !['host', 'moderator'].includes(c.role)) { this.signal.sendDirect(ws, 'error', { message: 'Not authorized' }); return; }
        const q = await this.qa.reject(d.questionId as string);
        this.signal.sendTo(q.userId, 'question-rejected', { id: q.id });
        break;
      }

      case 'question-answer': {
        if (!userId) return;
        const c = this.signal.getClient(userId);
        if (!c || !['host', 'presenter'].includes(c.role)) { this.signal.sendDirect(ws, 'error', { message: 'Not authorized' }); return; }
        const q = await this.qa.answer(d.questionId as string, d.answer as string);
        this.signal.broadcast(c.roomId, 'question-answered', q);
        break;
      }

      case 'question-upvote': {
        if (!userId) return;
        const c = this.signal.getClient(userId);
        if (!c) return;
        const q = await this.qa.upvote(d.questionId as string, userId);
        this.signal.broadcast(c.roomId, 'question-upvoted', { id: q.id, upvotes: q.upvotes });
        break;
      }

      // ── Waiting room admit ──────────────────────────────────────────────────
      case 'admit-participant': {
        if (!userId) return;
        const c = this.signal.getClient(userId);
        if (!c || c.role !== 'host') { this.signal.sendDirect(ws, 'error', { message: 'Only host can admit' }); return; }
        const targetId = d.userId as string;
        this.signal.sendTo(targetId, 'participant-admitted', { roomId: c.roomId, admittedBy: c.userName });
        this.signal.broadcast(c.roomId, 'participant-admitted', { userId: targetId });
        break;
      }

      default:
        this.logger.debug(`Unknown event: ${msg.event}`);
    }
  }
}
