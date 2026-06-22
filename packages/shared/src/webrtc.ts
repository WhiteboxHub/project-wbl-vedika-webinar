import { ParticipantRole, SessionRole } from './roles';

/** Client-side WebRTC connection state machine */
export enum PeerState {
  IDLE = 'IDLE',
  JOINING = 'JOINING',
  SIGNAL_CONNECTED = 'SIGNAL_CONNECTED',
  PEER_CREATED = 'PEER_CREATED',
  OFFER_SENT = 'OFFER_SENT',
  ANSWER_RECEIVED = 'ANSWER_RECEIVED',
  ICE_CONNECTED = 'ICE_CONNECTED',
  MEDIA_CONNECTED = 'MEDIA_CONNECTED',
  CONNECTED = 'CONNECTED',
  RECONNECTING = 'RECONNECTING',
  FAILED = 'FAILED',
}

/** Join grant issued by POST /join/token and POST /join/host-token */
export interface JoinGrant {
  participantId: string;
  roomId: string;
  sessionId: string;
  role: SessionRole | ParticipantRole | string;
  displayName: string;
  signalToken: string;
  iceServers: RTCIceServerConfig[];
  /** @deprecated LiveKit path — omitted when native WebRTC is enabled */
  livekitToken?: string;
  livekitUrl?: string;
}

export interface RTCIceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface IceServersResponse {
  iceServers: RTCIceServerConfig[];
  ttlSeconds: number;
}

export interface SessionDescriptionInit {
  type?: 'offer' | 'answer' | 'pranswer' | 'rollback';
  sdp?: string;
}

export interface IceCandidateInit {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

/** Signal WebSocket events for WebRTC SDP/ICE relay */
export type WebRtcSignalEvent =
  | 'webrtc-offer'
  | 'webrtc-answer'
  | 'webrtc-ice'
  | 'webrtc-restart';

export interface WebRtcOfferPayload {
  fromParticipantId: string;
  targetParticipantId: string;
  sdp: SessionDescriptionInit;
  connectionEpoch: number;
}

export interface WebRtcAnswerPayload {
  fromParticipantId: string;
  targetParticipantId: string;
  sdp: SessionDescriptionInit;
  connectionEpoch: number;
}

export interface WebRtcIcePayload {
  fromParticipantId: string;
  targetParticipantId: string;
  candidate: IceCandidateInit;
  connectionEpoch: number;
}

export interface WebRtcRestartPayload {
  fromParticipantId: string;
  targetParticipantId: string;
  connectionEpoch: number;
}

/** Structured RTC log event — never include tokens or raw IPs in production */
export interface RtcLogEvent {
  ts: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  component: 'PeerManager' | 'RoomManager' | 'SignalClient' | 'Diagnostics';
  event: string;
  participantId?: string;
  roomId?: string;
  state?: PeerState;
  meta?: Record<string, unknown>;
}

export interface PreJoinDiagnosticResult {
  camera: DiagnosticCheck;
  microphone: DiagnosticCheck;
  signalServer: DiagnosticCheck;
  turn: DiagnosticCheck;
  overall: 'pass' | 'warn' | 'fail';
}

export interface DiagnosticCheck {
  status: 'pass' | 'warn' | 'fail' | 'skipped';
  message: string;
  latencyMs?: number;
}

export interface SignalTokenPayload {
  sub: string;
  roomId: string;
  role: string;
  jti: string;
  displayName?: string;
  email?: string;
}
