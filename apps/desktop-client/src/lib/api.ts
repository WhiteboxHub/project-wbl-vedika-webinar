const API_BASE = 'http://localhost:3000';

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
  const res = await fetch(`${API_BASE}/classes`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to load sessions');
  return res.json();
}

export async function getSession(id: string): Promise<Session> {
  const res = await fetch(`${API_BASE}/classes/${id}`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to load session');
  return res.json();
}

export async function createSession(payload: CreateSessionPayload): Promise<Session> {
  const res = await fetch(`${API_BASE}/classes`, {
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
  const res = await fetch(`${API_BASE}/classes/${id}/start`, {
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
  const res = await fetch(`${API_BASE}/classes/${id}/end`, {
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
  const res = await fetch(`${API_BASE}/classes/${sessionId}/invites`, {
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
}

export interface JoinTokenResponse {
  livekitToken: string;
  livekitUrl: string;
  roomName: string;
  sessionId: string;
  sessionTitle: string;
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

export async function getHostToken(sessionId: string): Promise<string> {
  const res = await fetch(`${API_BASE}/join/host-token`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ sessionId }),
  });
  if (!res.ok) throw new Error('Failed to get host token');
  const data = await res.json();
  return data.livekitToken;
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
