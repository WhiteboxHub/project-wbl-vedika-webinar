export interface ClassroomSessionData {
  liveKitToken: string;
  livekitUrl: string;
  participantName: string;
  isHost: boolean;
  sessionId: string;
}

const KEY_PREFIX = 'classroom_session_';

export function saveClassroomSession(roomId: string, data: ClassroomSessionData) {
  try {
    sessionStorage.setItem(KEY_PREFIX + roomId, JSON.stringify(data));
  } catch {}
}

export function loadClassroomSession(roomId: string): ClassroomSessionData | null {
  try {
    const raw = sessionStorage.getItem(KEY_PREFIX + roomId);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearClassroomSession(roomId: string) {
  try {
    sessionStorage.removeItem(KEY_PREFIX + roomId);
  } catch {}
}

/**
 * Returns the correct LiveKit WebSocket URL.
 *
 * Priority:
 *  1. VITE_LIVEKIT_URL env var (set this to LiveKit Cloud URL for production-like behaviour)
 *  2. ws://localhost:7880 when running locally (direct — no proxy hop needed)
 *  3. Proxy path through the tunnel (/livekit) for remote attendees
 */
export function getLiveKitUrl(): string {
  // Explicit override — e.g. LiveKit Cloud: wss://xxx.livekit.cloud
  const envUrl = (import.meta as any).env?.VITE_LIVEKIT_URL;
  if (envUrl) return envUrl;

  const { hostname, origin } = window.location;

  // On localhost/127.0.0.1 connect directly — fastest, most reliable
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'ws://localhost:7880';
  }

  // Remote access via Cloudflare tunnel — proxy WebSocket through Vite
  const wsOrigin = origin.replace(/^https/, 'wss').replace(/^http/, 'ws');
  return `${wsOrigin}/livekit`;
}
