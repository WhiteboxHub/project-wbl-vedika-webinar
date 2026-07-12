export interface ClassroomSessionData {
  liveKitToken: string;
  /** App JWT (JWT_SECRET) for the signal WebSocket gateway. Separate from liveKitToken. */
  signalToken?: string;
  livekitUrl?: string;
  participantName: string;
  isHost: boolean;
  sessionId: string;
}

import type { JoinGrant } from '@webinar/shared';

/** Native WebRTC session (no LiveKit) */
export interface WebinarSessionData {
  roomId: string;
  participantId: string;
  isHost: boolean;
  sessionId: string;
  grant: JoinGrant;
}

const KEY_PREFIX    = 'classroom_session_';
const WEBINAR_PREFIX = 'webinar_session_';

// ─── Session storage helpers ─────────────────────────────────────────────────

export function saveClassroomSession(roomId: string, data: ClassroomSessionData) {
  try { sessionStorage.setItem(KEY_PREFIX + roomId, JSON.stringify(data)); } catch {}
}
export function loadClassroomSession(roomId: string): ClassroomSessionData | null {
  try { const r = sessionStorage.getItem(KEY_PREFIX + roomId); return r ? JSON.parse(r) : null; } catch { return null; }
}
export function clearClassroomSession(roomId: string) {
  try { sessionStorage.removeItem(KEY_PREFIX + roomId); } catch {}
}

export function saveWebinarSession(roomId: string, data: WebinarSessionData) {
  try { sessionStorage.setItem(WEBINAR_PREFIX + roomId, JSON.stringify(data)); } catch {}
}
export function loadWebinarSession(roomId: string): WebinarSessionData | null {
  try { const r = sessionStorage.getItem(WEBINAR_PREFIX + roomId); return r ? JSON.parse(r) : null; } catch { return null; }
}
export function clearWebinarSession(roomId: string) {
  try { sessionStorage.removeItem(WEBINAR_PREFIX + roomId); } catch {}
}

// ─── URL helpers — always same-origin ────────────────────────────────────────
//
// The architecture uses a single entry point (Caddy in prod, Vite proxy in dev).
// All traffic goes to the same origin the page was loaded from:
//
//   DEV  (Vite on :5173)       PROD / LAN  (Caddy on :80)
//   ────────────────────       ──────────────────────────
//   /api/*    → :3000 NestJS   /api/*    → :3000 NestJS
//   /signal   → :3000 NestJS   /signal   → :3000 NestJS
//   /livekit  → :7880 LiveKit  /livekit  → :7880 LiveKit
//
// Therefore: always use window.location.origin — no env vars, no config,
// no hardcoded hostnames. Works identically on localhost, LAN IP, or a domain.

/**
 * WebSocket URL for the NestJS signal gateway.
 * Always resolves to wss?://{current-origin}/signal
 */
export function getSignalServerUrl(): string {
  const wsOrigin = window.location.origin
    .replace(/^https/, 'wss')
    .replace(/^http/,  'ws');
  return `${wsOrigin}/signal`;
}

/**
 * WebSocket URL for LiveKit SFU.
 *
 * Uses VITE_LIVEKIT_URL if set (for standalone LiveKit Cloud or self-hosted
 * LiveKit without a reverse proxy). Otherwise uses the same-origin /livekit
 * path which Caddy / Vite proxy forwards to the LiveKit server.
 */
export function getLiveKitUrl(): string {
  const explicit = (import.meta as any).env?.VITE_LIVEKIT_URL as string | undefined;
  if (explicit) return explicit;

  const wsOrigin = window.location.origin
    .replace(/^https/, 'wss')
    .replace(/^http/,  'ws');
  return `${wsOrigin}/livekit`;
}


