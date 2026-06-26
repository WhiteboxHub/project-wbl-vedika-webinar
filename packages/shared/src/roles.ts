/** In-room session roles (enterprise model) */
export enum SessionRole {
  ORGANIZER = 'organizer',
  CO_ORGANIZER = 'co_organizer',
  PRESENTER = 'presenter',
  ATTENDEE = 'attendee',
}

/** Legacy realtime role strings — kept for backward compatibility */
export enum ParticipantRole {
  HOST = 'host',
  ORGANIZER = 'organizer',
  CO_ORGANIZER = 'co_organizer',
  PRESENTER = 'presenter',
  MODERATOR = 'moderator',
  ATTENDEE = 'attendee',
}

export interface SessionParticipantCapabilities {
  canPublishAudio: boolean;
  canPublishVideo: boolean;
  canShareScreen: boolean;
}

export interface SessionParticipantRecord {
  id: string;
  sessionId: string;
  userId: string;
  displayName: string;
  role: SessionRole;
  canPublishAudio: boolean;
  canPublishVideo: boolean;
  canShareScreen: boolean;
  joinedAt?: Date;
  leftAt?: Date;
}

export type AudioRequestStatus = 'pending' | 'approved' | 'denied';

export interface RaisedHandEntry {
  userId: string;
  userName: string;
  raisedAt: number;
}

export interface AudioRequestEntry {
  userId: string;
  userName: string;
  status: AudioRequestStatus;
  requestedAt: number;
}

/** Map legacy JWT/signal roles to SessionRole */
export function normalizeSessionRole(role: string): SessionRole {
  switch (role) {
    case SessionRole.ORGANIZER:
    case ParticipantRole.HOST:
      return SessionRole.ORGANIZER;
    case SessionRole.CO_ORGANIZER:
    case ParticipantRole.MODERATOR:
      return SessionRole.CO_ORGANIZER;
    case SessionRole.PRESENTER:
    case ParticipantRole.PRESENTER:
      return SessionRole.PRESENTER;
    default:
      return SessionRole.ATTENDEE;
  }
}

/** Roles allowed to moderate (mute, remove, promote, approve hands/audio) */
export function canModerateSession(role: SessionRole): boolean {
  return role === SessionRole.ORGANIZER || role === SessionRole.CO_ORGANIZER;
}

export function defaultCapabilities(role: SessionRole): SessionParticipantCapabilities {
  switch (role) {
    case SessionRole.ORGANIZER:
    case SessionRole.CO_ORGANIZER:
      return { canPublishAudio: true, canPublishVideo: true, canShareScreen: true };
    case SessionRole.PRESENTER:
      return { canPublishAudio: true, canPublishVideo: true, canShareScreen: true };
    default:
      return { canPublishAudio: false, canPublishVideo: false, canShareScreen: false };
  }
}

/** Signal/event role string (legacy-compatible) */
export function toSignalRole(role: SessionRole): string {
  if (role === SessionRole.ORGANIZER) return ParticipantRole.HOST;
  if (role === SessionRole.CO_ORGANIZER) return ParticipantRole.MODERATOR;
  return role;
}
