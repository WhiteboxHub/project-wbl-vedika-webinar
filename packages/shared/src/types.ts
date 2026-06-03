// User types
export enum UserRole {
  INSTRUCTOR = 'instructor',
  ATTENDEE = 'attendee',
  ADMIN = 'admin',
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

// Auth types
export interface MagicLinkRequest {
  email: string;
}

export interface MagicLinkResponse {
  success: boolean;
  message: string;
}

export interface VerifyTokenRequest {
  token: string;
}

export interface VerifyTokenResponse {
  accessToken: string;
  user: AuthUser;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

// Session types
export enum SessionStatus {
  SCHEDULED = 'scheduled',
  LIVE = 'live',
  ENDED = 'ended',
  CANCELLED = 'cancelled',
}

export interface Session {
  id: string;
  title: string;
  description?: string;
  instructorId: string;
  status: SessionStatus;
  scheduledAt: Date;
  startedAt?: Date;
  endedAt?: Date;
  liveKitRoomName: string;
  maxAttendees: number;
  inviteToken: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSessionRequest {
  title: string;
  description?: string;
  scheduledAt: Date;
  maxAttendees?: number;
}

export interface CreateSessionResponse {
  id: string;
  title: string;
  description?: string;
  instructorId: string;
  status: SessionStatus;
  scheduledAt: Date;
  liveKitRoomName: string;
  maxAttendees: number;
  inviteToken: string;
  createdAt: Date;
}

export interface UpdateSessionRequest {
  title?: string;
  description?: string;
  scheduledAt?: Date;
  maxAttendees?: number;
  status?: SessionStatus;
}

export interface SessionListResponse {
  sessions: Session[];
  total: number;
}

// Invite types
export interface Invite {
  id: string;
  sessionId: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface CreateInviteRequest {
  sessionId: string;
  expiresInHours?: number;
}

export interface CreateInviteResponse {
  id: string;
  token: string;
  expiresAt: Date;
  inviteUrl: string;
}

export interface ResolveInviteRequest {
  token: string;
}

export interface ResolveInviteResponse {
  sessionId: string;
  title: string;
  description?: string;
  scheduledAt: Date;
  status: SessionStatus;
  instructorName: string;
  maxAttendees: number;
  registeredName?: string;
  registeredEmail?: string;
}

// Recording types
export enum RecordingStatus {
  RECORDING_STARTING = 'recording_starting',
  RECORDING_ACTIVE = 'recording_active',
  PROCESSING_QUEUED = 'processing_queued',
  PROCESSING = 'processing',
  READY = 'ready',
  FAILED = 'failed',
}

export enum RecordingResolution {
  HD_1080P = '1080p',
  HD_720P = '720p',
}

export interface Recording {
  id: string;
  sessionId: string;
  status: RecordingStatus;
  egressId?: string;
  rawPath?: string;
  finalPath?: string;
  duration?: number;
  fileSize?: number;
  resolution?: RecordingResolution;
  error?: string;
  startedAt: Date;
  stoppedAt?: Date;
  processedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface RecordingStartRequest {
  sessionId: string;
}

export interface RecordingStopRequest {
  sessionId: string;
}

export interface RecordingResponse {
  id: string;
  status: RecordingStatus;
  duration?: number;
  fileSize?: number;
  resolution?: RecordingResolution;
  downloadUrl?: string;
}

// Chat types
export interface ChatMessage {
  id: string;
  sessionId: string;
  userId: string;
  userName: string;
  message: string;
  timestamp: Date;
}

// Attendance types
export interface Attendance {
  id: string;
  sessionId: string;
  userId: string;
  joinedAt: Date;
  leftAt?: Date;
}

// LiveKit types
export interface LiveKitToken {
  token: string;
  roomName: string;
  participantName: string;
}

export interface LiveKitRoomMetadata {
  sessionId: string;
  title: string;
}

// Audit log types
export enum AuditAction {
  RECORDING_START = 'recording_start',
  RECORDING_STOP = 'recording_stop',
  RECORDING_PROCESSING_SUCCESS = 'recording_processing_success',
  RECORDING_PROCESSING_FAILURE = 'recording_processing_failure',
}

export interface AuditLog {
  id: string;
  action: AuditAction;
  userId?: string;
  sessionId?: string;
  recordingId?: string;
  metadata?: Record<string, unknown>;
  timestamp: Date;
}

// API Response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// Health check types
export interface HealthCheck {
  status: 'ok' | 'error';
  timestamp: string;
  services: {
    database?: 'ok' | 'error';
    redis?: 'ok' | 'error';
    livekit?: 'ok' | 'error';
    storage?: 'ok' | 'error';
  };
}
