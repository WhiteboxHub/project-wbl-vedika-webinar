import { PeerState, type JoinGrant } from '@webinar/shared';
import { SignalingClient } from '../signaling';
import { getSignalServerUrl } from '../classroom-session';
import { PeerManager, type WebRtcOutbound } from './PeerManager';
import { RtcLogger } from './RtcLogger';
import { AUDIO_CAPTURE_CONSTRAINTS } from './audio-constraints';

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
  private audioStream: MediaStream | null = null;
  private audioMuted = false;
  private audioRecoveryInFlight = false;
  private deviceChangeHandler: (() => void) | null = null;
  private visibilityHandler: (() => void) | null = null;
  private hasJoinedOnce = false;

  constructor(private readonly opts: RoomManagerOptions) {
    const { grant } = opts;
    this.log = new RtcLogger('RoomManager', grant.roomId, grant.participantId);
    this.signal = new SignalingClient(getSignalServerUrl());
    this.wireSignal();
    this.bindDeviceAndVisibilityHandlers();
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
      if (this.hasJoinedOnce) {
        this.log.info('signal_reconnected', {});
        void this.republishLocalMedia();
      }
      this.hasJoinedOnce = true;
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

  private bindDeviceAndVisibilityHandlers(): void {
    this.deviceChangeHandler = () => {
      if (this.audioStream) void this.recoverAudio('devicechange');
    };
    this.visibilityHandler = () => {
      if (document.visibilityState === 'visible') void this.republishLocalMedia();
    };
    navigator.mediaDevices?.addEventListener('devicechange', this.deviceChangeHandler);
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  private unbindDeviceAndVisibilityHandlers(): void {
    if (this.deviceChangeHandler) {
      navigator.mediaDevices?.removeEventListener('devicechange', this.deviceChangeHandler);
      this.deviceChangeHandler = null;
    }
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
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
      onIceRestarted: () => void this.republishLocalMedia(),
    });
    this.peers.set(remoteId, peer);
    return peer;
  }

  /** Attach screen-share and mic tracks to a peer after connect. */
  private async attachLocalMedia(peer: PeerManager): Promise<void> {
    if (this.screenStream) await peer.replaceTracks(this.screenStream);
    if (this.audioStream) {
      const [track] = this.audioStream.getAudioTracks();
      if (track?.readyState === 'live') {
        await peer.addAudioTrack(track, this.audioStream);
      }
    }
  }

  /** Host: create peer connection to a specific attendee */
  async connectToAttendee(attendeeId: string): Promise<void> {
    await this.createHostPeerFor(attendeeId);
  }

  private async createHostPeerFor(attendeeId: string): Promise<void> {
    if (this.peers.has(attendeeId)) return;
    const peer = this.createPeer(attendeeId, true);
    await peer.connect(this.screenStream ?? undefined);
    await this.attachLocalMedia(peer);
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
      await this.attachLocalMedia(peer);
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
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 },
        },
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

  // ─── Audio (attendee microphone) ──────────────────────────────────────────────────────

  private bindAudioTrackHealth(track: MediaStreamTrack): void {
    track.onended = () => void this.recoverAudio('ended');
    track.onmute = () => {
      if (track.readyState !== 'live') void this.recoverAudio('mute_dead');
    };
    track.onunmute = () => {
      if (this.audioMuted) track.enabled = false;
    };
  }

  private async recoverAudio(reason: string): Promise<void> {
    if (this.audioRecoveryInFlight) return;
    this.audioRecoveryInFlight = true;
    try {
      this.log.warn('audio_recover', { reason });
      const wasMuted = this.audioMuted;
      this.stopAudio();
      const ok = await this.publishAudio();
      if (ok && wasMuted) this.muteAudio(true);
    } finally {
      this.audioRecoveryInFlight = false;
    }
  }

  /**
   * Re-attach live local tracks to every active peer (after ICE restart or signal reconnect).
   */
  async republishLocalMedia(): Promise<void> {
    if (this.audioStream) {
      const [track] = this.audioStream.getAudioTracks();
      if (!track || track.readyState !== 'live') {
        await this.recoverAudio('republish_stale');
        return;
      }
      for (const peer of this.peers.values()) {
        await peer.addAudioTrack(track, this.audioStream);
      }
    }
    if (this.screenStream && this.opts.isHost) {
      for (const peer of this.peers.values()) {
        await peer.replaceTracks(this.screenStream);
      }
    }
  }

  /**
   * Request microphone access and add the audio track to every active peer.
   * Returns true on success, false if the user denied permissions.
   */
  async publishAudio(): Promise<boolean> {
    if (this.audioStream) {
      const [existing] = this.audioStream.getAudioTracks();
      if (existing?.readyState === 'live') {
        await this.republishLocalMedia();
        return true;
      }
      this.stopAudio();
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: AUDIO_CAPTURE_CONSTRAINTS,
        video: false,
      });
      this.audioStream = stream;
      const [audioTrack] = stream.getAudioTracks();
      if (!audioTrack) return false;
      this.bindAudioTrackHealth(audioTrack);
      if (this.audioMuted) audioTrack.enabled = false;
      for (const peer of this.peers.values()) {
        await peer.addAudioTrack(audioTrack, stream);
      }
      return true;
    } catch (err) {
      this.log.warn('publish_audio_failed', { error: String(err) });
      return false;
    }
  }

  /**
   * Mute or unmute the local audio track in-place (no renegotiation needed).
   * If `muted` is true the track is silenced; false re-enables it.
   */
  muteAudio(muted: boolean): void {
    this.audioMuted = muted;
    this.audioStream?.getAudioTracks().forEach(t => { t.enabled = !muted; });
  }

  /** Stop and discard the local audio stream. */
  stopAudio(): void {
    this.audioStream?.getTracks().forEach(t => {
      t.onended = null;
      t.onmute = null;
      t.onunmute = null;
      t.stop();
    });
    this.audioStream = null;
    this.audioMuted = false;
  }

  isAudioMuted(): boolean { return this.audioMuted; }
  hasAudio(): boolean { return this.audioStream !== null; }

  getSignalClient(): SignalingClient { return this.signal; }
  getState(): PeerState { return this.aggregateState; }

  leave(): void {
    for (const peer of this.peers.values()) peer.close();
    this.peers.clear();
    this.stopScreenShare();
    this.stopAudio();
    this.unbindDeviceAndVisibilityHandlers();
    this.signal.leaveRoom();
    this.signal.disconnect();
    this.setAggregateState(PeerState.IDLE);
  }
}
