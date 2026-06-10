/**
 * Persists LiveKit connection data in sessionStorage so that:
 * 1. Direct URL access (via tunnel) works without losing state
 * 2. Page refreshes inside the classroom don't boot you out
 *
 * Data is keyed by roomId and cleared when you disconnect.
 */

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
 * Returns the LiveKit WebSocket URL that works whether you're running
 * locally or through a Cloudflare tunnel.
 *
 * - Locally: the Vite proxy forwards /livekit → ws://localhost:7880
 * - Via tunnel: the tunnel forwards /livekit → ws://localhost:7880 on the server
 *
 * We use the current page's origin so the URL is always correct.
 */
export function getLiveKitUrl(): string {
  const origin = window.location.origin;
  // Convert https:// → wss:// and http:// → ws://
  const wsOrigin = origin.replace(/^https/, 'wss').replace(/^http/, 'ws');
  return `${wsOrigin}/livekit`;
}
