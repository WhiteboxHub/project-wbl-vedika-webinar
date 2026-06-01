const API_BASE = 'http://localhost:3000';

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
  participantName: string;
}

export async function resolveInvite(token: string): Promise<ResolveInviteResponse> {
  const response = await fetch(`${API_BASE}/join/resolve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ token }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(errorData?.message || 'Failed to resolve invite token');
  }

  // API returns data directly (no wrapper)
  return response.json();
}

export async function joinSession(token: string, name: string): Promise<JoinTokenResponse> {
  const response = await fetch(`${API_BASE}/join/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    // Match the DTO field names: inviteToken and userName
    body: JSON.stringify({ inviteToken: token, userName: name }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(errorData?.message || 'Failed to join session');
  }

  // API returns data directly (no wrapper)
  return response.json();
}
