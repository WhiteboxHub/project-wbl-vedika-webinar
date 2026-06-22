// ─── Types ────────────────────────────────────────────────────────────────────

export type ReactionType = 'thumbs-up' | 'heart' | 'clap' | 'laugh' | 'surprised';

export interface SignalingMessage {
  event: string;
  data?: Record<string, unknown>;
}

// ─── SignalingClient ──────────────────────────────────────────────────────────

export class SignalingClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectDelay = 1000;
  private shouldReconnect = false;
  private pendingJoin: (() => void) | null = null;

  public connected = false;
  public roomId: string | null = null;

  // ── Callbacks ──────────────────────────────────────────────────────────────
  public onConnected: (() => void) | null = null;
  public onDisconnected: (() => void) | null = null;
  public onError: ((msg: string) => void) | null = null;
  public onRoomState: ((data: any) => void) | null = null;
  public onParticipantJoined: ((userId: string, userName: string, role: string) => void) | null = null;
  public onParticipantLeft: ((userId: string, userName: string) => void) | null = null;
  public onChat: ((id: string, userId: string, userName: string, message: string, timestamp: string) => void) | null = null;
  public onHandRaised: ((userId: string, userName: string, raised: boolean) => void) | null = null;
  public onReaction: ((userId: string, userName: string, type: ReactionType, timestamp: number) => void) | null = null;
  public onPollCreated: ((poll: any) => void) | null = null;
  public onPollResult: ((result: any) => void) | null = null;
  public onPollClosed: ((data: { pollId: string }) => void) | null = null;
  public onQuestionPending: ((q: any) => void) | null = null;
  public onQuestionSubmitted: ((data: { id: string; status: string }) => void) | null = null;
  public onQuestionApproved: ((q: any) => void) | null = null;
  public onQuestionRejected: ((data: { id: string }) => void) | null = null;
  public onQuestionAnswered: ((q: any) => void) | null = null;
  public onQuestionUpvoted: ((data: { id: string; upvotes: number }) => void) | null = null;
  public onParticipantAdmitted: ((data: any) => void) | null = null;
  public onRoleChanged: ((data: any) => void) | null = null;
  public onParticipantMuted: ((data: { userId: string; trackSid: string; muted: boolean }) => void) | null = null;
  public onParticipantRemoved: ((data: { userId: string }) => void) | null = null;
  public onAudioRequested: ((data: any) => void) | null = null;
  public onAudioApproved: ((data: { userId: string }) => void) | null = null;
  public onAudioDenied: ((data: { userId: string }) => void) | null = null;
  /** Fired when the host ends the session server-side. Stop reconnecting; show ended screen. */
  public onSessionEnded: ((data: any) => void) | null = null;

  public onWebRtcOffer: ((data: { fromParticipantId: string; targetParticipantId: string; sdp: RTCSessionDescriptionInit; connectionEpoch: number }) => void) | null = null;
  public onWebRtcAnswer: ((data: { fromParticipantId: string; targetParticipantId: string; sdp: RTCSessionDescriptionInit; connectionEpoch: number }) => void) | null = null;
  public onWebRtcIce: ((data: { fromParticipantId: string; targetParticipantId: string; candidate: RTCIceCandidateInit; connectionEpoch: number }) => void) | null = null;
  public onWebRtcRestart: ((data: { fromParticipantId: string; targetParticipantId: string; connectionEpoch: number }) => void) | null = null;

  constructor(private readonly serverUrl: string) {}

  // ── Public API ─────────────────────────────────────────────────────────────

  connect(): void {
    this.shouldReconnect = true;
    this.openSocket();
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.clearReconnectTimer();
    this.clearHeartbeat();
    this.closeSocket();
  }

  joinRoom(roomId: string, token: string, userName: string, role: string): void {
    this.roomId = roomId;
    const doJoin = () => this.send({ event: 'join-room', data: { roomId, token, userName, role } });
    if (this.connected) doJoin();
    else this.pendingJoin = doJoin;
  }

  leaveRoom(): void { this.send({ event: 'leave-room' }); this.roomId = null; }
  sendChat(message: string): void { this.send({ event: 'chat', data: { message } }); }
  raiseHand(): void { this.send({ event: 'raise-hand' }); }
  lowerHand(): void { this.send({ event: 'lower-hand' }); }
  requestAudio(): void { this.send({ event: 'request-audio' }); }
  approveAudio(userId: string): void { this.send({ event: 'approve-audio', data: { userId } }); }
  denyAudio(userId: string): void { this.send({ event: 'deny-audio', data: { userId } }); }
  sendReaction(type: ReactionType): void { this.send({ event: 'reaction', data: { type } }); }
  createPoll(question: string, options: string[]): void { this.send({ event: 'poll-create', data: { question, options } }); }
  votePoll(pollId: string, optionId: string): void { this.send({ event: 'poll-vote', data: { pollId, optionId } }); }
  closePoll(pollId: string): void { this.send({ event: 'poll-close', data: { pollId } }); }
  submitQuestion(text: string): void { this.send({ event: 'question-submit', data: { text } }); }
  approveQuestion(questionId: string): void { this.send({ event: 'question-approve', data: { questionId } }); }
  rejectQuestion(questionId: string): void { this.send({ event: 'question-reject', data: { questionId } }); }
  answerQuestion(questionId: string, answer: string): void { this.send({ event: 'question-answer', data: { questionId, answer } }); }
  upvoteQuestion(questionId: string): void { this.send({ event: 'question-upvote', data: { questionId } }); }
  admitParticipant(userId: string): void { this.send({ event: 'admit-participant', data: { userId } }); }

  sendWebRtcOffer(data: { fromParticipantId: string; targetParticipantId: string; sdp: RTCSessionDescriptionInit; connectionEpoch: number }): void {
    this.send({ event: 'webrtc-offer', data: data as unknown as Record<string, unknown> });
  }
  sendWebRtcAnswer(data: { fromParticipantId: string; targetParticipantId: string; sdp: RTCSessionDescriptionInit; connectionEpoch: number }): void {
    this.send({ event: 'webrtc-answer', data: data as unknown as Record<string, unknown> });
  }
  sendWebRtcIce(data: { fromParticipantId: string; targetParticipantId: string; candidate: RTCIceCandidateInit; connectionEpoch: number }): void {
    this.send({ event: 'webrtc-ice', data: data as unknown as Record<string, unknown> });
  }
  sendWebRtcRestart(data: { fromParticipantId: string; targetParticipantId: string; connectionEpoch: number }): void {
    this.send({ event: 'webrtc-restart', data: data as unknown as Record<string, unknown> });
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private send(msg: SignalingMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private openSocket(): void {
    this.closeSocket();
    const ws = new WebSocket(this.serverUrl);

    ws.onopen = () => {
      this.connected = true;
      this.reconnectDelay = 1000;
      this.startHeartbeat();
      this.onConnected?.();
      if (this.pendingJoin) { this.pendingJoin(); this.pendingJoin = null; }
    };

    ws.onclose = () => {
      this.connected = false;
      this.clearHeartbeat();
      this.onDisconnected?.();
      this.scheduleReconnect();
    };

    ws.onerror = () => { this.onError?.('WebSocket connection error'); };

    ws.onmessage = (ev: MessageEvent) => {
      let msg: { event: string; data?: any };
      try { msg = JSON.parse(ev.data as string); } catch { return; }
      const d = msg.data;
      switch (msg.event) {
        case 'room-state': this.onRoomState?.(d); break;
        case 'participant-joined': this.onParticipantJoined?.(d.userId, d.userName, d.role); break;
        case 'participant-left': this.onParticipantLeft?.(d.userId, d.userName); break;
        case 'chat': this.onChat?.(d.id, d.userId, d.userName, d.message, d.timestamp); break;
        case 'hand-raised': this.onHandRaised?.(d.userId, d.userName, d.raised); break;
        case 'reaction': this.onReaction?.(d.userId, d.userName, d.type, d.timestamp); break;
        case 'poll-created': this.onPollCreated?.(d); break;
        case 'poll-result': this.onPollResult?.(d); break;
        case 'poll-closed': this.onPollClosed?.(d); break;
        case 'question-pending': this.onQuestionPending?.(d); break;
        case 'question-submitted': this.onQuestionSubmitted?.(d); break;
        case 'question-approved': this.onQuestionApproved?.(d); break;
        case 'question-rejected': this.onQuestionRejected?.(d); break;
        case 'question-answered': this.onQuestionAnswered?.(d); break;
        case 'question-upvoted': this.onQuestionUpvoted?.(d); break;
        case 'participant-admitted': this.onParticipantAdmitted?.(d); break;
        case 'role-changed': this.onRoleChanged?.(d); break;
        case 'participant-muted': this.onParticipantMuted?.(d); break;
        case 'participant-removed': this.onParticipantRemoved?.(d); break;
        case 'audio-requested': this.onAudioRequested?.(d); break;
        case 'audio-approved': this.onAudioApproved?.(d); break;
        case 'audio-denied': this.onAudioDenied?.(d); break;
        case 'session-ended':
          this.shouldReconnect = false;
          this.clearReconnectTimer();
          this.onSessionEnded?.(d);
          break;
        case 'pong':
          break;
        case 'webrtc-offer':
          this.onWebRtcOffer?.(d);
          break;
        case 'webrtc-answer':
          this.onWebRtcAnswer?.(d);
          break;
        case 'webrtc-ice':
          this.onWebRtcIce?.(d);
          break;
        case 'webrtc-restart':
          this.onWebRtcRestart?.(d);
          break;
        case 'error': this.onError?.(d?.message ?? 'Unknown server error'); break;
      }
    };

    this.ws = ws;
  }

  private closeSocket(): void {
    if (this.ws) {
      this.ws.onopen = this.ws.onclose = this.ws.onerror = this.ws.onmessage = null;
      if (this.ws.readyState < 2) this.ws.close();
      this.ws = null;
      this.connected = false;
    }
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect) return;
    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => this.openSocket(), this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 10000);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
  }

  private startHeartbeat(): void {
    this.clearHeartbeat();
    this.heartbeatTimer = setInterval(() => this.send({ event: 'ping', data: { ts: Date.now() } }), 15000);
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer !== null) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
  }
}
