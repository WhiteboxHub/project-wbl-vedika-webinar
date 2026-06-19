import { PeerState, type JoinGrant } from '@webinar/shared';
import { SignalingClient } from '../signaling';
import { getSignalServerUrl } from '../classroom-session';
import { PeerManager, type WebRtcOutbound } from './PeerManager';
import { RtcLogger } from './RtcLogger';

export interface RoomManagerOptions {
  grant: JoinGrant;
  isHost: boolean;
  onStateChange?: (state: PeerState) => void;
  onRemoteStream?: (stream: MediaStream, fromParticipantId: string) => void;
  onSignalChat?: SignalingClient['onChat'];
  onSessionEnded?: () => void;
}

/**
 * Client-side orchestrator: signal WebSocket + peer connections.
 * Host: one PeerManager per attendee (initiator). Attendee: one PeerManager to host (answerer).
 */
export class RoomManager {
  private readonly log: RtcLogger;
  private readonly signal: SignalingClient;
  private readonly peers = new Map<string, PeerManager>();
  private aggregateState: PeerState = PeerState.IDLE;
  private screenStream: MediaStream | null = null;

  constructor(private readonly opts: RoomManagerOptions) {
    const { grant } = opts;
    this.log = new RtcLogger('RoomManager', grant.roomId, grant.participantId);
    this.signal = new SignalingClient(getSignalServerUrl());
    this.wireSignal();
  }

  private wireSignal(): void {
    const { grant, isHost } = this.opts;

    this.signal.onConnected = () => {
      this.setAggregateState(PeerState.SIGNAL_CONNECTED);
      this.signal.joinRoom(
        grant.roomId,
        grant.signalToken,
        grant.displayName,
        grant.role,
      );
    };

    this.signal.onDisconnected = () => {
      if (this.aggregateState !== PeerState.FAILED) {
        this.setAggregateState(PeerState.RECONNECTING);
      }
    };

    this.signal.onSessionEnded = () => {
      this.opts.onSessionEnded?.();
      this.leave();
    };

    this.signal.onParticipantJoined = (userId, userName, role) => {
      if (!isHost || userId === grant.participantId) return;
      if (role === 'host') return;
      this.log.info('attendee_joined', { userId, userName });
      void this.createHostPeerFor(userId);
    };

    this.signal.onParticipantLeft = (userId) => {
      const peer = this.peers.get(userId);
      if (peer) {
        peer.close();
        this.peers.delete(userId);
      }
    };

    // WebRTC signaling relay
    this.signal.onWebRtcOffer = (payload) => void this.handleOffer(payload);
    this.signal.onWebRtcAnswer = (payload) => void this.handleAnswer(payload);
    this.signal.onWebRtcIce = (payload) => void this.handleIce(payload);
    this.signal.onWebRtcRestart = (payload) => void this.handleRestart(payload);

    if (this.opts.onSignalChat) {
      this.signal.onChat = this.opts.onSignalChat;
    }
  }

  private setAggregateState(state: PeerState) {
    this.aggregateState = state;
    this.opts.onStateChange?.(state);
  }

  private sendWebRtc(msg: WebRtcOutbound): void {
    const epoch = this.peers.get(msg.targetParticipantId)?.getEpoch() ?? 1;
    const base = {
      fromParticipantId: this.opts.grant.participantId,
      targetParticipantId: msg.targetParticipantId,
      connectionEpoch: epoch,
    };

    if (msg.type === 'offer') {
      this.signal.sendWebRtcOffer({ ...base, sdp: msg.sdp });
    } else if (msg.type === 'answer') {
      this.signal.sendWebRtcAnswer({ ...base, sdp: msg.sdp });
    } else if (msg.type === 'ice') {
      this.signal.sendWebRtcIce({ ...base, candidate: msg.candidate });
    } else if (msg.type === 'restart') {
      this.signal.sendWebRtcRestart({ ...base });
    }
  }

  private createPeer(remoteId: string, isInitiator: boolean): PeerManager {
    const peer = new PeerManager({
      participantId: this.opts.grant.participantId,
      roomId: this.opts.grant.roomId,
      remoteParticipantId: remoteId,
      iceServers: this.opts.grant.iceServers,
      isInitiator,
      onStateChange: (s) => {
        if (s === PeerState.CONNECTED) this.setAggregateState(PeerState.CONNECTED);
      },
      onRemoteStream: (stream) => this.opts.onRemoteStream?.(stream, remoteId),
      onSendSignal: (m) => this.sendWebRtc(m),
    });
    this.peers.set(remoteId, peer);
    return peer;
  }

  /** Host: create peer connection to a specific attendee */
  async connectToAttendee(attendeeId: string): Promise<void> {
    await this.createHostPeerFor(attendeeId);
  }

  private async createHostPeerFor(attendeeId: string): Promise<void> {
    if (this.peers.has(attendeeId)) return;
    const peer = this.createPeer(attendeeId, true);
    await peer.connect(this.screenStream ?? undefined);
  }

  private async handleOffer(payload: {
    fromParticipantId: string;
    sdp: RTCSessionDescriptionInit;
    connectionEpoch: number;
  }): Promise<void> {
    if (this.opts.isHost) return;
    let peer = this.peers.get(payload.fromParticipantId);
    if (!peer) {
      peer = this.createPeer(payload.fromParticipantId, false);
      await peer.connect();
    }
    await peer.handleOffer(payload.sdp, payload.connectionEpoch);
  }

  private async handleAnswer(payload: {
    fromParticipantId: string;
    sdp: RTCSessionDescriptionInit;
    connectionEpoch: number;
  }): Promise<void> {
    const peer = this.peers.get(payload.fromParticipantId);
    await peer?.handleAnswer(payload.sdp, payload.connectionEpoch);
  }

  private async handleIce(payload: {
    fromParticipantId: string;
    candidate: RTCIceCandidateInit;
    connectionEpoch: number;
  }): Promise<void> {
    const peer = this.peers.get(payload.fromParticipantId);
    await peer?.handleIce(payload.candidate, payload.connectionEpoch);
  }

  private handleRestart(payload: {
    fromParticipantId: string;
    connectionEpoch: number;
  }): void {
    const peer = this.peers.get(payload.fromParticipantId);
    if (peer) {
      peer.noteRemoteRestart(payload.connectionEpoch);
    } else {
      this.log.warn('restart_unknown_peer', { from: payload.fromParticipantId });
    }
  }

  async join(): Promise<void> {
    this.setAggregateState(PeerState.JOINING);
    this.signal.connect();
  }

  async publishScreenShare(): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: true,
      });
      this.screenStream = stream;
      stream.getVideoTracks()[0]?.addEventListener('ended', () => this.stopScreenShare());

      if (this.opts.isHost) {
        for (const peer of this.peers.values()) {
          await peer.replaceTracks(stream);
        }
      }
      return true;
    } catch {
      return false;
    }
  }

  stopScreenShare(): void {
    this.screenStream?.getTracks().forEach(t => t.stop());
    this.screenStream = null;
  }

  getSignalClient(): SignalingClient { return this.signal; }
  getState(): PeerState { return this.aggregateState; }

  leave(): void {
    for (const peer of this.peers.values()) peer.close();
    this.peers.clear();
    this.stopScreenShare();
    this.signal.leaveRoom();
    this.signal.disconnect();
    this.setAggregateState(PeerState.IDLE);
  }
}
