export interface ClassroomSessionData {
  liveKitToken: string;
  livekitUrl: string;
  participantName: string;
  isHost: boolean;
  sessionId: string;
}

/** Data passed to the new WebinarRoom (no LiveKit dependency) */
export interface WebinarSessionData {
  roomId: string;
  userId: string;
  userName: string;
  isHost: boolean;
  sessionId: string;
}

const KEY_PREFIX = 'classroom_session_';
const WEBINAR_PREFIX = 'webinar_session_';

// ─── Legacy LiveKit helpers (kept for backward compat) ─────────────────────

export function saveClassroomSession(roomId: string, data: ClassroomSessionData) {
  try { sessionStorage.setItem(KEY_PREFIX + roomId, JSON.stringify(data)); } catch {}
}
export function loadClassroomSession(roomId: string): ClassroomSessionData | null {
  try { const r = sessionStorage.getItem(KEY_PREFIX + roomId); return r ? JSON.parse(r) : null; } catch { return null; }
}
export function clearClassroomSession(roomId: string) {
  try { sessionStorage.removeItem(KEY_PREFIX + roomId); } catch {}
}

// ─── New WebRTC Webinar helpers ────────────────────────────────────────────

export function saveWebinarSession(roomId: string, data: WebinarSessionData) {
  try { sessionStorage.setItem(WEBINAR_PREFIX + roomId, JSON.stringify(data)); } catch {}
}
export function loadWebinarSession(roomId: string): WebinarSessionData | null {
  try { const r = sessionStorage.getItem(WEBINAR_PREFIX + roomId); return r ? JSON.parse(r) : null; } catch { return null; }
}
export function clearWebinarSession(roomId: string) {
  try { sessionStorage.removeItem(WEBINAR_PREFIX + roomId); } catch {}
}

/**
 * Signal server URL — built into the NestJS API at /signal.
 * Uses the current page origin so it works through Cloudflare tunnel automatically.
 */
export function getSignalServerUrl(): string {
  const { origin } = window.location;
  const wsOrigin = origin.replace(/^https/, 'wss').replace(/^http/, 'ws');
  return `${wsOrigin}/signal`;
}

/** @deprecated — use SIGNAL_SERVER_URL for the new WebRTC flow */
export function getLiveKitUrl(): string {
  const envUrl = (import.meta as any).env?.VITE_LIVEKIT_URL;
  if (envUrl) return envUrl;
  const { hostname, origin } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return 'ws://localhost:7880';
  const wsOrigin = origin.replace(/^https/, 'wss').replace(/^http/, 'ws');
  return `${wsOrigin}/livekit`;
}
