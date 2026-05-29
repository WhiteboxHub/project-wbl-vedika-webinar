import {
  User,
  UserRole,
  MagicLinkRequest,
  MagicLinkResponse,
  VerifyTokenRequest,
  VerifyTokenResponse,
  AuthUser,
  Session,
  SessionStatus,
  CreateSessionRequest,
  CreateSessionResponse,
  UpdateSessionRequest,
  SessionListResponse,
  Invite,
  CreateInviteRequest,
  CreateInviteResponse,
  ResolveInviteRequest,
  ResolveInviteResponse,
} from './types';

describe('Auth Types', () => {
  describe('MagicLinkRequest', () => {
    it('should have email field', () => {
      const request: MagicLinkRequest = {
        email: 'test@example.com',
      };

      expect(request.email).toBe('test@example.com');
    });
  });

  describe('MagicLinkResponse', () => {
    it('should have success and message fields', () => {
      const response: MagicLinkResponse = {
        success: true,
        message: 'Magic link sent to your email',
      };

      expect(response.success).toBe(true);
      expect(response.message).toBe('Magic link sent to your email');
    });
  });

  describe('VerifyTokenRequest', () => {
    it('should have token field', () => {
      const request: VerifyTokenRequest = {
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      };

      expect(request.token).toMatch(/^eyJ/);
    });
  });

  describe('VerifyTokenResponse', () => {
    it('should have accessToken and user fields', () => {
      const response: VerifyTokenResponse = {
        accessToken: 'jwt-access-token',
        user: {
          id: '123',
          email: 'test@example.com',
          name: 'Test User',
          role: UserRole.INSTRUCTOR,
        },
      };

      expect(response.accessToken).toBe('jwt-access-token');
      expect(response.user.email).toBe('test@example.com');
      expect(response.user.role).toBe(UserRole.INSTRUCTOR);
    });
  });

  describe('AuthUser', () => {
    it('should match User interface fields', () => {
      const authUser: AuthUser = {
        id: '123',
        email: 'test@example.com',
        name: 'Test User',
        role: UserRole.ATTENDEE,
      };

      expect(authUser).toHaveProperty('id');
      expect(authUser).toHaveProperty('email');
      expect(authUser).toHaveProperty('name');
      expect(authUser).toHaveProperty('role');
      // AuthUser does not have createdAt/updatedAt (subset of User)
      expect(authUser).not.toHaveProperty('createdAt');
      expect(authUser).not.toHaveProperty('updatedAt');
    });

    it('should support all user roles', () => {
      const instructor: AuthUser = {
        id: '1',
        email: 'instructor@example.com',
        name: 'Instructor',
        role: UserRole.INSTRUCTOR,
      };

      const attendee: AuthUser = {
        id: '2',
        email: 'attendee@example.com',
        name: 'Attendee',
        role: UserRole.ATTENDEE,
      };

      const admin: AuthUser = {
        id: '3',
        email: 'admin@example.com',
        name: 'Admin',
        role: UserRole.ADMIN,
      };

      expect(instructor.role).toBe(UserRole.INSTRUCTOR);
      expect(attendee.role).toBe(UserRole.ATTENDEE);
      expect(admin.role).toBe(UserRole.ADMIN);
    });
  });
});

describe('Session Types', () => {
  describe('CreateSessionRequest', () => {
    it('should have required fields', () => {
      const request: CreateSessionRequest = {
        title: 'Introduction to TypeScript',
        scheduledAt: new Date('2026-06-01T10:00:00Z'),
      };

      expect(request.title).toBe('Introduction to TypeScript');
      expect(request.scheduledAt).toBeInstanceOf(Date);
    });

    it('should support optional fields', () => {
      const request: CreateSessionRequest = {
        title: 'Advanced React',
        description: 'Deep dive into React patterns',
        scheduledAt: new Date('2026-06-15T14:00:00Z'),
        maxAttendees: 50,
      };

      expect(request.description).toBe('Deep dive into React patterns');
      expect(request.maxAttendees).toBe(50);
    });
  });

  describe('CreateSessionResponse', () => {
    it('should have all session fields', () => {
      const response: CreateSessionResponse = {
        id: 'session-123',
        title: 'Web Development Basics',
        instructorId: 'instructor-456',
        status: SessionStatus.SCHEDULED,
        scheduledAt: new Date('2026-06-20T09:00:00Z'),
        liveKitRoomName: 'session_web-dev-123',
        maxAttendees: 100,
        inviteToken: 'invite-token-xyz',
        createdAt: new Date(),
      };

      expect(response.id).toBe('session-123');
      expect(response.status).toBe(SessionStatus.SCHEDULED);
      expect(response.liveKitRoomName).toMatch(/^session_/);
      expect(response.inviteToken).toBeTruthy();
    });
  });

  describe('UpdateSessionRequest', () => {
    it('should allow partial updates', () => {
      const request: UpdateSessionRequest = {
        title: 'Updated Title',
      };

      expect(request.title).toBe('Updated Title');
      expect(request.description).toBeUndefined();
      expect(request.scheduledAt).toBeUndefined();
    });

    it('should support status updates', () => {
      const request: UpdateSessionRequest = {
        status: SessionStatus.LIVE,
      };

      expect(request.status).toBe(SessionStatus.LIVE);
    });
  });

  describe('SessionListResponse', () => {
    it('should contain sessions array and total count', () => {
      const session1: Session = {
        id: '1',
        title: 'Session 1',
        instructorId: 'instructor-1',
        status: SessionStatus.SCHEDULED,
        scheduledAt: new Date('2026-06-01T10:00:00Z'),
        liveKitRoomName: 'room_1',
        maxAttendees: 100,
        inviteToken: 'token_1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const session2: Session = {
        id: '2',
        title: 'Session 2',
        instructorId: 'instructor-2',
        status: SessionStatus.LIVE,
        scheduledAt: new Date('2026-06-02T14:00:00Z'),
        liveKitRoomName: 'room_2',
        maxAttendees: 50,
        inviteToken: 'token_2',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const response: SessionListResponse = {
        sessions: [session1, session2],
        total: 2,
      };

      expect(response.sessions).toHaveLength(2);
      expect(response.total).toBe(2);
      expect(response.sessions[0].status).toBe(SessionStatus.SCHEDULED);
      expect(response.sessions[1].status).toBe(SessionStatus.LIVE);
    });
  });

  describe('SessionStatus', () => {
    it('should have all status values', () => {
      expect(SessionStatus.SCHEDULED).toBe('scheduled');
      expect(SessionStatus.LIVE).toBe('live');
      expect(SessionStatus.ENDED).toBe('ended');
      expect(SessionStatus.CANCELLED).toBe('cancelled');
    });
  });
});

describe('Invite Types', () => {
  describe('Invite', () => {
    it('should have all required fields', () => {
      const invite: Invite = {
        id: 'invite-123',
        sessionId: 'session-456',
        token: 'invite-token-xyz',
        expiresAt: new Date('2026-06-01T12:00:00Z'),
        createdAt: new Date(),
      };

      expect(invite.id).toBe('invite-123');
      expect(invite.sessionId).toBe('session-456');
      expect(invite.token).toBe('invite-token-xyz');
      expect(invite.expiresAt).toBeInstanceOf(Date);
      expect(invite.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('CreateInviteRequest', () => {
    it('should have sessionId', () => {
      const request: CreateInviteRequest = {
        sessionId: 'session-789',
      };

      expect(request.sessionId).toBe('session-789');
      expect(request.expiresInHours).toBeUndefined();
    });

    it('should support custom expiration', () => {
      const request: CreateInviteRequest = {
        sessionId: 'session-789',
        expiresInHours: 48,
      };

      expect(request.expiresInHours).toBe(48);
    });
  });

  describe('CreateInviteResponse', () => {
    it('should include invite details and URL', () => {
      const response: CreateInviteResponse = {
        id: 'invite-001',
        token: 'secure-token-abc',
        expiresAt: new Date('2026-06-02T12:00:00Z'),
        inviteUrl: 'https://webinar.example.com/join/secure-token-abc',
      };

      expect(response.id).toBe('invite-001');
      expect(response.token).toBe('secure-token-abc');
      expect(response.inviteUrl).toMatch(/^https:\/\//);
      expect(response.inviteUrl).toContain(response.token);
    });
  });

  describe('ResolveInviteRequest', () => {
    it('should have token field', () => {
      const request: ResolveInviteRequest = {
        token: 'invite-token-to-resolve',
      };

      expect(request.token).toBe('invite-token-to-resolve');
    });
  });

  describe('ResolveInviteResponse', () => {
    it('should contain session details', () => {
      const response: ResolveInviteResponse = {
        sessionId: 'session-111',
        title: 'Advanced JavaScript',
        description: 'Learn modern JS features',
        scheduledAt: new Date('2026-06-10T15:00:00Z'),
        status: SessionStatus.SCHEDULED,
        instructorName: 'John Doe',
        maxAttendees: 100,
      };

      expect(response.sessionId).toBe('session-111');
      expect(response.title).toBe('Advanced JavaScript');
      expect(response.instructorName).toBe('John Doe');
      expect(response.status).toBe(SessionStatus.SCHEDULED);
    });

    it('should support optional description', () => {
      const response: ResolveInviteResponse = {
        sessionId: 'session-222',
        title: 'Quick Demo',
        scheduledAt: new Date('2026-06-11T10:00:00Z'),
        status: SessionStatus.LIVE,
        instructorName: 'Jane Smith',
        maxAttendees: 50,
      };

      expect(response.description).toBeUndefined();
    });
  });
});
