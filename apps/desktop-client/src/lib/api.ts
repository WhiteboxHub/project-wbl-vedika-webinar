const API_BASE = '/api';

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message || 'Login failed');
  }
  return res.json();
}

export function getStoredAuth(): LoginResponse | null {
  try {
    const raw = localStorage.getItem('auth');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function storeAuth(data: LoginResponse) {
  localStorage.setItem('auth', JSON.stringify(data));
}

export function clearAuth() {
  localStorage.removeItem('auth');
}

function authHeaders(): Record<string, string> {
  const auth = getStoredAuth();
  return {
    'Content-Type': 'application/json',
    ...(auth ? { Authorization: `Bearer ${auth.accessToken}` } : {}),
  };
}

/**
 * Central fetch wrapper. If the server returns 401 (expired/invalid JWT),
 * it clears stored auth and redirects to /login so the user re-authenticates.
 */
async function apiFetch(url: string, options?: RequestInit): Promise<Response> {
  const res = await fetch(url, options);
  if (res.status === 401) {
    clearAuth();
    window.location.href = '/login';
    throw new Error('Session expired. Please log in again.');
  }
  return res;
}

// ─── Sessions ────────────────────────────────────────────────────────────────

export interface Session {
  id: string;
  title: string;
  description?: string;
  status: 'scheduled' | 'live' | 'ended' | 'cancelled';
  scheduledAt: string;
  startedAt?: string;
  endedAt?: string;
  maxAttendees: number;
  liveKitRoomName: string;
  inviteToken: string;
  instructor?: { id: string; name: string; email: string };
}

export interface CreateSessionPayload {
  title: string;
  description?: string;
  scheduledAt: string;
  maxAttendees?: number;
}

export async function getSessions(): Promise<Session[]> {
  const res = await apiFetch(`${API_BASE}/classes`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to load sessions');
  return res.json();
}

export async function getSession(id: string): Promise<Session> {
  const res = await apiFetch(`${API_BASE}/classes/${id}`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to load session');
  return res.json();
}

export async function createSession(payload: CreateSessionPayload): Promise<Session> {
  const res = await apiFetch(`${API_BASE}/classes`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message || 'Failed to create session');
  }
  return res.json();
}

export async function startSession(id: string): Promise<Session> {
  const res = await apiFetch(`${API_BASE}/classes/${id}/start`, {
    method: 'POST',
    headers: authHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message || 'Failed to start session');
  }
  return res.json();
}

export async function endSession(id: string): Promise<Session> {
  const res = await apiFetch(`${API_BASE}/classes/${id}/end`, {
    method: 'POST',
    headers: authHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message || 'Failed to end session');
  }
  return res.json();
}

export async function generateInviteLink(sessionId: string): Promise<string> {
  const res = await apiFetch(`${API_BASE}/classes/${sessionId}/invites`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ expiresInHours: 24 }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message || 'Failed to generate invite');
  }
  const data = await res.json();
  const token = data.token;
  return `${window.location.origin}/join/${token}`;
}

// ─── Attendee Join Flow ──────────────────────────────────────────────────────

export interface ResolveInviteResponse {
  sessionId: string;
  title: string;
  description?: string;
  scheduledAt: string;
  status: string;
  instructorName: string;
  maxAttendees: number;
  registeredName?: string;
  registeredEmail?: string;
}

export interface JoinTokenResponse {
  livekitToken: string;
  livekitUrl: string;
  roomName: string;
  sessionId: string;
  sessionTitle: string;
}

export async function registerForWebinar(sessionId: string, name: string, email: string): Promise<{ token: string; inviteUrl: string }> {
  const res = await fetch(`${API_BASE}/join/register/${sessionId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message || 'Failed to register');
  }
  return res.json();
}

export async function resolveInvite(token: string): Promise<ResolveInviteResponse> {
  const res = await fetch(`${API_BASE}/join/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message || 'Invalid or expired invite');
  }
  return res.json();
}

export async function joinSession(token: string, name: string): Promise<JoinTokenResponse> {
  const res = await fetch(`${API_BASE}/join/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inviteToken: token, userName: name }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message || 'Failed to join session');
  }
  return res.json();
}

// ─── Host Controls ───────────────────────────────────────────────────────────

export async function getHostToken(sessionId: string): Promise<{ livekitToken: string; signalToken: string; roomName: string }> {
  const res = await apiFetch(`${API_BASE}/join/host-token`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ sessionId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message || `Server error: ${res.status}`);
  }
  const data = await res.json();
  return { livekitToken: data.livekitToken, signalToken: data.signalToken ?? '', roomName: data.roomName };
}

export async function muteParticipant(sessionId: string, identity: string, trackSid: string): Promise<void> {
  await fetch(`${API_BASE}/classes/${sessionId}/participants/${identity}/mute`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ trackSid, muted: true }),
  });
}

export async function removeParticipant(sessionId: string, identity: string): Promise<void> {
  await fetch(`${API_BASE}/classes/${sessionId}/participants/${identity}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
}
