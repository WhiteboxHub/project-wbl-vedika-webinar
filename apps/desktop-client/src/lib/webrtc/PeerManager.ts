import { PeerState } from '@webinar/shared';
import type { RTCIceServerConfig } from '@webinar/shared';
import { RtcLogger } from './RtcLogger';

export type WebRtcOutbound =
  | { type: 'offer'; targetParticipantId: string; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; targetParticipantId: string; sdp: RTCSessionDescriptionInit }
  | { type: 'ice'; targetParticipantId: string; candidate: RTCIceCandidateInit }
  | { type: 'restart'; targetParticipantId: string };

export interface PeerManagerOptions {
  participantId: string;
  roomId: string;
  remoteParticipantId: string;
  iceServers: RTCIceServerConfig[];
  isInitiator: boolean;
  onStateChange?: (state: PeerState) => void;
  onRemoteStream?: (stream: MediaStream) => void;
  onSendSignal: (msg: WebRtcOutbound) => void;
}

/**
 * Manages a single RTCPeerConnection lifecycle (one remote peer).
 * Host may hold one PeerManager per attendee; attendee holds one to host.
 */
export class PeerManager {
  private pc: RTCPeerConnection | null = null;
  private state: PeerState = PeerState.IDLE;
  private connectionEpoch = 0;
  private readonly log: RtcLogger;
  private localStream: MediaStream | null = null;

  constructor(private readonly opts: PeerManagerOptions) {
    this.log = new RtcLogger('PeerManager', opts.roomId, opts.participantId);
  }

  getState(): PeerState { return this.state; }
  getEpoch(): number { return this.connectionEpoch; }
  getRemoteParticipantId(): string { return this.opts.remoteParticipantId; }

  private transition(next: PeerState, reason: string) {
    this.log.info('state_transition', { from: this.state, to: next, reason }, next);
    this.state = next;
    this.opts.onStateChange?.(next);
  }

  async connect(localStream?: MediaStream): Promise<void> {
    if (this.state !== PeerState.IDLE && this.state !== PeerState.FAILED) return;
    this.connectionEpoch += 1;
    this.transition(PeerState.JOINING, 'connect_called');
    this.localStream = localStream ?? null;

    this.pc = new RTCPeerConnection({ iceServers: this.opts.iceServers as RTCIceServer[] });
    this.transition(PeerState.PEER_CREATED, 'pc_created');

    this.pc.ontrack = (ev) => {
      if (ev.streams[0]) {
        this.transition(PeerState.MEDIA_CONNECTED, 'ontrack');
        this.opts.onRemoteStream?.(ev.streams[0]);
        if (this.state !== PeerState.CONNECTED) {
          this.transition(PeerState.CONNECTED, 'media_flowing');
        }
      }
    };

    this.pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        this.opts.onSendSignal({
          type: 'ice',
          targetParticipantId: this.opts.remoteParticipantId,
          candidate: ev.candidate.toJSON(),
        });
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      const ice = this.pc?.iceConnectionState;
      this.log.debug('ice_state', { ice });
      if (ice === 'connected' || ice === 'completed') {
        this.transition(PeerState.ICE_CONNECTED, ice);
      } else if (ice === 'failed') {
        this.log.warn('ice_failed', {}, PeerState.RECONNECTING);
        this.transition(PeerState.RECONNECTING, 'ice_failed');
        void this.restartIce();
      } else if (ice === 'disconnected') {
        this.log.warn('ice_disconnected', {});
      }
    };

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        this.pc!.addTrack(track, this.localStream!);
      });
    }

    if (this.opts.isInitiator) {
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      this.transition(PeerState.OFFER_SENT, 'offer_created');
      this.opts.onSendSignal({
        type: 'offer',
        targetParticipantId: this.opts.remoteParticipantId,
        sdp: offer,
      });
    }
  }

  async handleOffer(sdp: RTCSessionDescriptionInit, epoch: number): Promise<void> {
    if (!this.pc) return;
    // Adopt the offerer's generation so our answer carries a matching epoch.
    if (epoch < this.connectionEpoch) return;
    this.connectionEpoch = epoch;

    await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    this.transition(PeerState.ANSWER_RECEIVED, 'answer_created');
    this.opts.onSendSignal({
      type: 'answer',
      targetParticipantId: this.opts.remoteParticipantId,
      sdp: answer,
    });
  }

  async handleAnswer(sdp: RTCSessionDescriptionInit, epoch: number): Promise<void> {
    if (!this.pc || epoch < this.connectionEpoch) return;
    await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    this.transition(PeerState.ANSWER_RECEIVED, 'answer_applied');
  }

  async handleIce(candidate: RTCIceCandidateInit, epoch: number): Promise<void> {
    if (!this.pc || epoch < this.connectionEpoch || !candidate) return;
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      this.log.warn('add_ice_failed', { error: String(err) });
    }
  }

  /**
   * Remote peer is restarting ICE — sync epoch only. Do NOT call restartIce() here;
   * only the side that detected iceConnectionState === 'failed' should offer.
   */
  noteRemoteRestart(epoch: number): void {
    if (epoch < this.connectionEpoch) return;
    this.connectionEpoch = epoch;
    this.log.info('remote_restart_noted', { epoch }, PeerState.RECONNECTING);
    this.transition(PeerState.RECONNECTING, 'remote_restart');
  }

  async restartIce(): Promise<void> {
    if (!this.pc) return;
    this.connectionEpoch += 1;
    this.opts.onSendSignal({
      type: 'restart',
      targetParticipantId: this.opts.remoteParticipantId,
    });
    const offer = await this.pc.createOffer({ iceRestart: true });
    await this.pc.setLocalDescription(offer);
    this.transition(PeerState.OFFER_SENT, 'ice_restart');
    this.opts.onSendSignal({
      type: 'offer',
      targetParticipantId: this.opts.remoteParticipantId,
      sdp: offer,
    });
  }

  async replaceTracks(stream: MediaStream): Promise<void> {
    if (!this.pc) return;
    this.localStream = stream;
    for (const track of stream.getTracks()) {
      const sender = this.pc.getSenders().find(s => s.track?.kind === track.kind);
      if (sender) await sender.replaceTrack(track);
      else this.pc.addTrack(track, stream);
    }
  }

  close(): void {
    this.localStream?.getTracks().forEach(t => t.stop());
    this.pc?.close();
    this.pc = null;
    this.transition(PeerState.IDLE, 'closed');
  }
}
