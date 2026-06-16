import { SignalingClient, UserMetadata } from './signaling';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Participant {
  userId: string;
  name: string;
  role: string;
  handRaised: boolean;
}

// ─── ICE Configuration ───────────────────────────────────────────────────────

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const RTC_CONFIG: RTCConfiguration = {
  iceServers: ICE_SERVERS,
};

// ─── WebRTCRoom ──────────────────────────────────────────────────────────────

export class WebRTCRoom {
  private signaling: SignalingClient;
  private userId: string;
  private isHost: boolean;

  // ── Public state ─────────────────────────────────────────────────────────

  public localStream: MediaStream | null = null;
  public screenStream: MediaStream | null = null;
  public remoteStreams: Map<string, MediaStream[]> = new Map();
  public peers: Map<string, RTCPeerConnection> = new Map();
  public dataChannels: Map<string, RTCDataChannel> = new Map();
  public participants: Map<string, Participant> = new Map();

  // ── Callback properties ──────────────────────────────────────────────────

  public onParticipantJoined: ((userId: string, meta: any) => void) | null = null;
  public onParticipantLeft: ((userId: string) => void) | null = null;
  public onRemoteStream: ((userId: string, streams: MediaStream[]) => void) | null = null;
  public onRemoteStreamRemoved: ((userId: string) => void) | null = null;
  public onChatMessage: ((from: string, message: string, timestamp: number) => void) | null = null;
  public onHandRaise: ((userId: string, raised: boolean) => void) | null = null;
  public onConnectionStateChange: ((userId: string, state: RTCPeerConnectionState) => void) | null = null;
  public onError: ((error: Error) => void) | null = null;

  constructor(signaling: SignalingClient, userId: string, isHost: boolean) {
    this.signaling = signaling;
    this.userId = userId;
    this.isHost = isHost;

    this.wireSignalingEvents();
  }

  // ── Media controls ───────────────────────────────────────────────────────

  async startLocalMedia(video: boolean, audio: boolean): Promise<MediaStream> {
    try {
      console.log('[WebRTC] Requesting local media — video:', video, 'audio:', audio);
      const stream = await navigator.mediaDevices.getUserMedia({ video, audio });
      this.localStream = stream;
      return stream;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.log('[WebRTC] Failed to get local media:', error.message);
      this.onError?.(error);
      throw error;
    }
  }

  stopLocalMedia(): void {
    if (this.localStream) {
      console.log('[WebRTC] Stopping local media');
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }
  }

  async startScreenShare(): Promise<MediaStream> {
    try {
      console.log('[WebRTC] Requesting screen share');
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      this.screenStream = stream;

      // Add screen tracks to every existing peer connection and renegotiate
      for (const [peerId, pc] of this.peers.entries()) {
        try {
          stream.getTracks().forEach((track) => {
            pc.addTrack(track, stream);
          });
          console.log('[WebRTC] Added screen tracks to peer', peerId);

          // Renegotiate — send a new offer so the remote peer knows about the new tracks
          if (this.isHost) {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            this.signaling.sendOffer(peerId, pc.localDescription!);
            console.log('[WebRTC] Renegotiation offer sent to', peerId);
          }
        } catch (err) {
          console.log('[WebRTC] Error adding screen tracks to peer', peerId, err);
        }
      }

      // Listen for the user stopping the screen share via browser UI
      stream.getVideoTracks().forEach((track) => {
        track.onended = () => {
          console.log('[WebRTC] Screen share track ended by user');
          this.stopScreenShare();
        };
      });

      return stream;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.log('[WebRTC] Failed to get screen share:', error.message);
      this.onError?.(error);
      throw error;
    }
  }

  stopScreenShare(): void {
    if (!this.screenStream) return;
    console.log('[WebRTC] Stopping screen share');

    // Stop tracks
    this.screenStream.getTracks().forEach((track) => track.stop());

    // Remove tracks from peers and renegotiate
    for (const [peerId, pc] of this.peers.entries()) {
      try {
        const senders = pc.getSenders();
        this.screenStream.getTracks().forEach((track) => {
          const sender = senders.find((s) => s.track === track);
          if (sender) {
            pc.removeTrack(sender);
          }
        });

        // Renegotiate after removing tracks
        if (this.isHost) {
          pc.createOffer().then((offer) => {
            return pc.setLocalDescription(offer);
          }).then(() => {
            this.signaling.sendOffer(peerId, pc.localDescription!);
            console.log('[WebRTC] Renegotiation offer sent to', peerId, 'after removing screen share');
          }).catch((err) => {
            console.error('[WebRTC] Error renegotiating after screen share stop:', err);
          });
        }
      } catch (err) {
        console.error('[WebRTC] Error removing screen tracks from peer', peerId, err);
      }
    }

    this.screenStream = null;
  }

  toggleMic(): boolean {
    if (!this.localStream) return false;
    const audioTracks = this.localStream.getAudioTracks();
    if (audioTracks.length === 0) return false;
    const newState = !audioTracks[0].enabled;
    audioTracks.forEach((t) => (t.enabled = newState));
    console.log('[WebRTC] Mic toggled:', newState ? 'on' : 'off');
    return newState;
  }

  toggleCamera(): boolean {
    if (!this.localStream) return false;
    const videoTracks = this.localStream.getVideoTracks();
    if (videoTracks.length === 0) return false;
    const newState = !videoTracks[0].enabled;
    videoTracks.forEach((t) => (t.enabled = newState));
    console.log('[WebRTC] Camera toggled:', newState ? 'on' : 'off');
    return newState;
  }

  // ── Chat / hand raise ───────────────────────────────────────────────────

  sendChat(message: string): void {
    this.signaling.sendChat(message);
  }

  raiseHand(raised: boolean): void {
    this.signaling.sendHandRaise(raised);
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────

  dispose(): void {
    console.log('[WebRTC] Disposing room');

    // Close all peer connections
    this.peers.forEach((pc, peerId) => {
      try {
        pc.close();
      } catch (err) {
        console.log('[WebRTC] Error closing peer', peerId, err);
      }
    });
    this.peers.clear();
    this.dataChannels.clear();
    this.remoteStreams.clear();
    this.participants.clear();

    // Stop media
    this.stopLocalMedia();
    this.stopScreenShare();

    // Disconnect signaling
    this.signaling.disconnect();
  }

  // ── Private: wire signaling ──────────────────────────────────────────────

  private wireSignalingEvents(): void {
    this.signaling.onUserJoined = (userId: string, metadata: UserMetadata) => {
      console.log('[WebRTC] User joined:', userId, metadata);

      this.participants.set(userId, {
        userId,
        name: metadata.name,
        role: metadata.role,
        handRaised: false,
      });

      this.onParticipantJoined?.(userId, metadata);

      if (this.isHost) {
        this.createPeerConnectionAndOffer(userId);
      }
    };

    this.signaling.onUserLeft = (userId: string) => {
      console.log('[WebRTC] User left:', userId);
      this.closePeer(userId);
      this.participants.delete(userId);
      this.onParticipantLeft?.(userId);
    };

    this.signaling.onOffer = (from: string, sdp: RTCSessionDescriptionInit) => {
      console.log('[WebRTC] Received offer from:', from);
      if (!this.isHost) {
        this.handleOffer(from, sdp);
      }
    };

    this.signaling.onAnswer = (from: string, sdp: RTCSessionDescriptionInit) => {
      console.log('[WebRTC] Received answer from:', from);
      if (this.isHost) {
        this.handleAnswer(from, sdp);
      }
    };

    this.signaling.onIceCandidate = (from: string, candidate: RTCIceCandidateInit) => {
      this.handleRemoteIceCandidate(from, candidate);
    };

    this.signaling.onChat = (from: string, message: string, timestamp: number) => {
      this.onChatMessage?.(from, message, timestamp);
    };

    this.signaling.onHandRaise = (userId: string, raised: boolean) => {
      const participant = this.participants.get(userId);
      if (participant) {
        participant.handRaised = raised;
      }
      this.onHandRaise?.(userId, raised);
    };

    this.signaling.onRoomUsers = (users: Array<{ userId: string; metadata: any }>) => {
      console.log('[WebRTC] Room users received:', users.length);
      for (const user of users) {
        if (user.userId === this.userId) continue;

        const metadata = user.metadata || {};
        this.participants.set(user.userId, {
          userId: user.userId,
          name: metadata.name ?? '',
          role: metadata.role ?? '',
          handRaised: false,
        });

        // Trigger callback so React state updates
        this.onParticipantJoined?.(user.userId, metadata);
      }
    };
  }

  // ── Private: Host flow — create connection & send offer ──────────────────

  private async createPeerConnectionAndOffer(peerId: string): Promise<void> {
    try {
      const pc = this.createPeerConnection(peerId);

      // Add local media tracks
      this.addLocalTracks(pc);

      // Create data channel
      const dc = pc.createDataChannel('chat');
      this.setupDataChannel(peerId, dc);

      // Create and send offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      console.log('[WebRTC] Sending offer to', peerId);
      this.signaling.sendOffer(peerId, pc.localDescription!);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.log('[WebRTC] Error creating offer for', peerId, error.message);
      this.onError?.(error);
    }
  }

  // ── Private: Attendee flow — handle incoming offer ───────────────────────

  private async handleOffer(from: string, sdp: RTCSessionDescriptionInit): Promise<void> {
    try {
      // Reuse existing peer connection for renegotiation (e.g. host started screen share)
      let pc = this.peers.get(from);
      const isRenegotiation = !!pc;

      if (!pc) {
        pc = this.createPeerConnection(from);

        // Listen for incoming data channels (only on first offer)
        pc.ondatachannel = (ev: RTCDataChannelEvent) => {
          console.log('[WebRTC] Data channel received from', from);
          this.setupDataChannel(from, ev.channel);
        };
      }

      console.log('[WebRTC]', isRenegotiation ? 'Renegotiation' : 'Initial', 'offer from', from);

      await pc.setRemoteDescription(new RTCSessionDescription(sdp));

      // Add local tracks before creating answer (only on first offer)
      if (!isRenegotiation) {
        this.addLocalTracks(pc);
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      console.log('[WebRTC] Sending answer to', from);
      this.signaling.sendAnswer(from, pc.localDescription!);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.log('[WebRTC] Error handling offer from', from, error.message);
      this.onError?.(error);
    }
  }

  // ── Private: Host flow — handle incoming answer ──────────────────────────

  private async handleAnswer(from: string, sdp: RTCSessionDescriptionInit): Promise<void> {
    try {
      const pc = this.peers.get(from);
      if (!pc) {
        console.log('[WebRTC] No peer connection found for answer from', from);
        return;
      }
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      console.log('[WebRTC] Remote description set for', from);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.log('[WebRTC] Error handling answer from', from, error.message);
      this.onError?.(error);
    }
  }

  // ── Private: ICE handling ────────────────────────────────────────────────

  private async handleRemoteIceCandidate(
    from: string,
    candidate: RTCIceCandidateInit,
  ): Promise<void> {
    try {
      const pc = this.peers.get(from);
      if (!pc) {
        console.log('[WebRTC] No peer connection for ICE candidate from', from);
        return;
      }
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.log('[WebRTC] Error adding ICE candidate from', from, error.message);
      this.onError?.(error);
    }
  }

  // ── Private: RTCPeerConnection factory ───────────────────────────────────

  private createPeerConnection(peerId: string): RTCPeerConnection {
    // Close existing connection to this peer if any
    this.closePeer(peerId);

    console.log('[WebRTC] Creating peer connection for', peerId);
    const pc = new RTCPeerConnection(RTC_CONFIG);

    // ICE candidates
    pc.onicecandidate = (ev: RTCPeerConnectionIceEvent) => {
      if (ev.candidate) {
        this.signaling.sendIceCandidate(peerId, ev.candidate.toJSON());
      }
    };

    // Remote tracks
    pc.ontrack = (ev: RTCTrackEvent) => {
      console.log('[WebRTC] Remote track received from', peerId, '— kind:', ev.track.kind);

      const incomingStream = ev.streams[0] || new MediaStream([ev.track]);
      let streamsForPeer = this.remoteStreams.get(peerId) || [];
      
      const existing = streamsForPeer.find(s => s.id === incomingStream.id);
      if (!existing) {
        streamsForPeer.push(incomingStream);
        this.remoteStreams.set(peerId, streamsForPeer);
      } else {
        if (!existing.getTracks().includes(ev.track)) {
          existing.addTrack(ev.track);
        }
      }

      // Trigger update with a new array reference so React detects the change
      const updatedStreams = [...streamsForPeer];
      this.remoteStreams.set(peerId, updatedStreams);
      this.onRemoteStream?.(peerId, updatedStreams);
    };

    // Connection state monitoring
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log('[WebRTC] Connection state for', peerId, ':', state);
      this.onConnectionStateChange?.(peerId, state);

      if (state === 'failed' || state === 'closed') {
        this.closePeer(peerId);
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('[WebRTC] ICE connection state for', peerId, ':', pc.iceConnectionState);
    };

    this.peers.set(peerId, pc);
    return pc;
  }

  // ── Private: add local tracks to a peer connection ───────────────────────

  private addLocalTracks(pc: RTCPeerConnection): void {
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        try {
          pc.addTrack(track, this.localStream!);
        } catch (err) {
          console.log('[WebRTC] Error adding local track:', err);
        }
      });
    }

    if (this.screenStream) {
      this.screenStream.getTracks().forEach((track) => {
        try {
          pc.addTrack(track, this.screenStream!);
        } catch (err) {
          console.log('[WebRTC] Error adding screen track:', err);
        }
      });
    }
  }

  // ── Private: data channel setup ──────────────────────────────────────────

  private setupDataChannel(peerId: string, dc: RTCDataChannel): void {
    this.dataChannels.set(peerId, dc);

    dc.onopen = () => {
      console.log('[WebRTC] Data channel open with', peerId);
    };

    dc.onclose = () => {
      console.log('[WebRTC] Data channel closed with', peerId);
      this.dataChannels.delete(peerId);
    };

    dc.onmessage = (ev: MessageEvent) => {
      try {
        const msg = JSON.parse(ev.data as string);
        if (msg.type === 'chat') {
          this.onChatMessage?.(peerId, msg.message, msg.timestamp ?? Date.now());
        }
      } catch {
        console.log('[WebRTC] Failed to parse data channel message from', peerId);
      }
    };

    dc.onerror = (ev) => {
      console.log('[WebRTC] Data channel error with', peerId, ev);
    };
  }

  // ── Private: tear down a single peer ─────────────────────────────────────

  private closePeer(peerId: string): void {
    const pc = this.peers.get(peerId);
    if (pc) {
      try {
        pc.onicecandidate = null;
        pc.ontrack = null;
        pc.onconnectionstatechange = null;
        pc.oniceconnectionstatechange = null;
        pc.ondatachannel = null;
        pc.close();
      } catch (err) {
        console.log('[WebRTC] Error closing peer connection for', peerId, err);
      }
      this.peers.delete(peerId);
    }

    this.dataChannels.delete(peerId);

    if (this.remoteStreams.has(peerId)) {
      this.remoteStreams.delete(peerId);
      this.onRemoteStreamRemoved?.(peerId);
    }
  }
}
