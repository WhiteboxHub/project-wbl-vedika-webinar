import { SessionEntity } from './session.entity';
import { SessionStatus } from '@webinar/shared';

describe('SessionEntity', () => {
  it('should create a session entity', () => {
    const session = new SessionEntity();
    session.title = 'Test Webinar';
    session.description = 'A test webinar session';
    session.instructorId = 'instructor-123';
    session.status = SessionStatus.SCHEDULED;
    session.scheduledAt = new Date('2026-06-01T10:00:00Z');
    session.liveKitRoomName = 'session_test-123';
    session.inviteToken = 'invite-token-123';
    session.maxAttendees = 50;

    expect(session.title).toBe('Test Webinar');
    expect(session.description).toBe('A test webinar session');
    expect(session.instructorId).toBe('instructor-123');
    expect(session.status).toBe(SessionStatus.SCHEDULED);
    expect(session.maxAttendees).toBe(50);
  });

  it('should have all required fields', () => {
    const session = new SessionEntity();

    expect(session).toHaveProperty('id');
    expect(session).toHaveProperty('title');
    expect(session).toHaveProperty('description');
    expect(session).toHaveProperty('instructorId');
    expect(session).toHaveProperty('status');
    expect(session).toHaveProperty('scheduledAt');
    expect(session).toHaveProperty('startedAt');
    expect(session).toHaveProperty('endedAt');
    expect(session).toHaveProperty('liveKitRoomName');
    expect(session).toHaveProperty('maxAttendees');
    expect(session).toHaveProperty('inviteToken');
    expect(session).toHaveProperty('createdAt');
    expect(session).toHaveProperty('updatedAt');
  });

  it('should support all session statuses', () => {
    const scheduled = new SessionEntity();
    scheduled.status = SessionStatus.SCHEDULED;
    expect(scheduled.status).toBe(SessionStatus.SCHEDULED);

    const live = new SessionEntity();
    live.status = SessionStatus.LIVE;
    expect(live.status).toBe(SessionStatus.LIVE);

    const ended = new SessionEntity();
    ended.status = SessionStatus.ENDED;
    expect(ended.status).toBe(SessionStatus.ENDED);

    const cancelled = new SessionEntity();
    cancelled.status = SessionStatus.CANCELLED;
    expect(cancelled.status).toBe(SessionStatus.CANCELLED);
  });

  it('should have optional timestamp fields', () => {
    const session = new SessionEntity();

    expect(session.startedAt).toBeUndefined();
    expect(session.endedAt).toBeUndefined();

    session.startedAt = new Date('2026-06-01T10:05:00Z');
    session.endedAt = new Date('2026-06-01T11:00:00Z');

    expect(session.startedAt).toBeInstanceOf(Date);
    expect(session.endedAt).toBeInstanceOf(Date);
  });

  it('should have unique constraints', () => {
    const session1 = new SessionEntity();
    session1.liveKitRoomName = 'room_unique';
    session1.inviteToken = 'token_unique';

    expect(session1.liveKitRoomName).toBe('room_unique');
    expect(session1.inviteToken).toBe('token_unique');
  });
});
