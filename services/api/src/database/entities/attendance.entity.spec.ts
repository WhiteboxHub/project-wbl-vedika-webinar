import { AttendanceEntity } from './attendance.entity';

describe('AttendanceEntity', () => {
  it('should create an attendance entity', () => {
    const attendance = new AttendanceEntity();
    attendance.sessionId = 'session-123';
    attendance.userId = 'user-456';
    attendance.joinedAt = new Date('2026-06-01T10:00:00Z');

    expect(attendance.sessionId).toBe('session-123');
    expect(attendance.userId).toBe('user-456');
    expect(attendance.joinedAt).toBeInstanceOf(Date);
  });

  it('should have all required fields', () => {
    const attendance = new AttendanceEntity();

    expect(attendance).toHaveProperty('id');
    expect(attendance).toHaveProperty('sessionId');
    expect(attendance).toHaveProperty('userId');
    expect(attendance).toHaveProperty('joinedAt');
    expect(attendance).toHaveProperty('leftAt');
  });

  it('should have optional leftAt field', () => {
    const attendance = new AttendanceEntity();

    expect(attendance.leftAt).toBeUndefined();

    attendance.leftAt = new Date('2026-06-01T11:00:00Z');
    expect(attendance.leftAt).toBeInstanceOf(Date);
  });

  it('should support ManyToOne relationships', () => {
    const attendance = new AttendanceEntity();
    attendance.sessionId = 'session-789';
    attendance.userId = 'user-012';

    expect(attendance.sessionId).toBe('session-789');
    expect(attendance.userId).toBe('user-012');
    expect(attendance).toHaveProperty('session');
    expect(attendance).toHaveProperty('user');
  });

  it('should track session duration', () => {
    const attendance = new AttendanceEntity();
    attendance.joinedAt = new Date('2026-06-01T10:00:00Z');
    attendance.leftAt = new Date('2026-06-01T11:00:00Z');

    const durationMs = attendance.leftAt.getTime() - attendance.joinedAt.getTime();
    const durationMinutes = durationMs / (1000 * 60);

    expect(durationMinutes).toBe(60);
  });
});
