// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserMetadata {
  name: string;
  role: string;
}

export interface RoomUser {
  userId: string;
  metadata: UserMetadata;
}

export type SignalingMessageType =
  | 'join'
  | 'leave'
  | 'offer'
  | 'answer'
  | 'ice-candidate'
  | 'chat'
  | 'hand-raise'
  | 'user-joined'
  | 'user-left'
  | 'room-users'
  | 'error';

export interface SignalingMessage {
  type: SignalingMessageType;
  [key: string]: unknown;
}

// ─── SignalingClient ──────────────────────────────────────────────────────────

export class SignalingClient {
  private serverUrl: string;
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private shouldReconnect = false;

  public connected = false;
  public roomId: string | null = null;

  // ── Callback properties ──────────────────────────────────────────────────

  public onConnected: (() => void) | null = null;
  public onDisconnected: (() => void) | null = null;
  public onError: ((message: string) => void) | null = null;
  public onUserJoined: ((userId: string, metadata: UserMetadata) => void) | null = null;
  public onUserLeft: ((userId: string) => void) | null = null;
  public onOffer: ((from: string, sdp: RTCSessionDescriptionInit) => void) | null = null;
  public onAnswer: ((from: string, sdp: RTCSessionDescriptionInit) => void) | null = null;
  public onIceCandidate: ((from: string, candidate: RTCIceCandidateInit) => void) | null = null;
  public onChat: ((from: string, message: string, timestamp: number) => void) | null = null;
  public onHandRaise: ((userId: string, raised: boolean) => void) | null = null;
  public onRoomUsers: ((users: Array<{ userId: string; metadata: any }>) => void) | null = null;

  constructor(serverUrl: string) {
    this.serverUrl = serverUrl;
  }

  // ── Public API ───────────────────────────────────────────────────────────

  connect(): void {
    this.shouldReconnect = true;
    this.openSocket();
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.clearReconnectTimer();
    this.closeSocket();
  }

  joinRoom(roomId: string, userId: string, metadata: UserMetadata): void {
    this.roomId = roomId;
    this.send({ type: 'join', roomId, userId, metadata });
  }

  leaveRoom(): void {
    this.send({ type: 'leave' });
    this.roomId = null;
  }

  sendOffer(to: string, sdp: RTCSessionDescriptionInit): void {
    this.send({ type: 'offer', to, sdp });
  }

  sendAnswer(to: string, sdp: RTCSessionDescriptionInit): void {
    this.send({ type: 'answer', to, sdp });
  }

  sendIceCandidate(to: string, candidate: RTCIceCandidateInit): void {
    this.send({ type: 'ice-candidate', to, candidate });
  }

  sendChat(message: string): void {
    this.send({ type: 'chat', message });
  }

  sendHandRaise(raised: boolean): void {
    this.send({ type: 'hand-raise', raised });
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private send(msg: SignalingMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.log('[Signal] Cannot send — WebSocket not open');
      return;
    }
    console.log('[Signal] Sending:', msg.type);
    this.ws.send(JSON.stringify(msg));
  }

  private openSocket(): void {
    this.closeSocket();

    console.log('[Signal] Connecting to', this.serverUrl);
    const ws = new WebSocket(this.serverUrl);

    ws.onopen = () => {
      console.log('[Signal] Connected');
      this.connected = true;
      this.reconnectDelay = 1000; // reset backoff on success
      this.onConnected?.();
    };

    ws.onclose = (ev: CloseEvent) => {
      console.log('[Signal] Disconnected — code:', ev.code, 'reason:', ev.reason);
      this.connected = false;
      this.onDisconnected?.();
      this.scheduleReconnect();
    };

    ws.onerror = (ev: Event) => {
      console.log('[Signal] WebSocket error', ev);
      this.onError?.('WebSocket connection error');
    };

    ws.onmessage = (ev: MessageEvent) => {
      this.handleMessage(ev);
    };

    this.ws = ws;
  }

  private closeSocket(): void {
    if (this.ws) {
      // Remove handlers so close doesn't trigger reconnect
      this.ws.onopen = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;

      if (
        this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING
      ) {
        this.ws.close();
      }
      this.ws = null;
      this.connected = false;
    }
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect) return;

    this.clearReconnectTimer();
    console.log('[Signal] Reconnecting in', this.reconnectDelay, 'ms');

    this.reconnectTimer = setTimeout(() => {
      this.openSocket();
    }, this.reconnectDelay);

    // Exponential backoff capped at 10 s
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 10000);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private handleMessage(ev: MessageEvent): void {
    let msg: SignalingMessage;
    try {
      msg = JSON.parse(ev.data as string);
    } catch {
      console.log('[Signal] Failed to parse message:', ev.data);
      return;
    }

    console.log('[Signal] Received:', msg.type);

    switch (msg.type) {
      case 'user-joined':
        this.onUserJoined?.(msg.userId as string, msg.metadata as UserMetadata);
        break;

      case 'user-left':
        this.onUserLeft?.(msg.userId as string);
        break;

      case 'offer':
        this.onOffer?.(msg.from as string, msg.sdp as RTCSessionDescriptionInit);
        break;

      case 'answer':
        this.onAnswer?.(msg.from as string, msg.sdp as RTCSessionDescriptionInit);
        break;

      case 'ice-candidate':
        this.onIceCandidate?.(msg.from as string, msg.candidate as RTCIceCandidateInit);
        break;

      case 'chat':
        this.onChat?.(msg.from as string, msg.message as string, msg.timestamp as number);
        break;

      case 'hand-raise':
        this.onHandRaise?.(msg.userId as string, msg.raised as boolean);
        break;

      case 'room-users':
        this.onRoomUsers?.(msg.users as Array<{ userId: string; metadata: any }>);
        break;

      case 'error':
        console.log('[Signal] Server error:', msg.message);
        this.onError?.(msg.message as string);
        break;

      default:
        console.log('[Signal] Unknown message type:', msg.type);
    }
  }
}
