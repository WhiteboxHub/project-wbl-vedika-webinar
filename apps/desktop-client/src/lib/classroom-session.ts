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

/**
 * Returns the LiveKit server URL to pass to <LiveKitRoom serverUrl={...}>.
 *
 * LOCAL DEV  — Use the Vite dev server proxy path (/livekit).
 *   The Vite proxy rewrites ws://localhost:5173/livekit → ws://localhost:7880.
 *   LiveKit ICE uses LIVEKIT_NODE_IP (see docker/livekit.yaml.template).
 *
 * CROSS-DEVICE — Host and attendees must open the SAME origin, e.g. http://192.168.0.60:5173
 *   (not localhost on one side and LAN IP on the other). Set LIVEKIT_NODE_IP in .env and
 *   run `pnpm docker:up` to regenerate LiveKit config.
 *
 * PRODUCTION — Set VITE_LIVEKIT_URL=wss://your-livekit-domain.com in .env.
 *   Or leave empty to use the /livekit proxy path on your own server.
 */
export function getLiveKitUrl(): string {
  // Explicit env override (production / LiveKit Cloud)
  const envUrl = (import.meta as any).env?.VITE_LIVEKIT_URL;
  if (envUrl) return envUrl;

  const { hostname, protocol, port } = window.location;
  const wsProto = protocol === 'https:' ? 'wss:' : 'ws:';

  // Local dev: use the proxy path instead of direct ws://localhost:7880
  // Vite dev server listens on port 5173 and proxies /livekit → 7880
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    const devPort = port || '5173';
    return `${wsProto}//${hostname}:${devPort}/livekit`;
  }

  // Production / tunnel: use the same origin with /livekit proxy path
  return `${wsProto}//${window.location.host}/livekit`;
}
