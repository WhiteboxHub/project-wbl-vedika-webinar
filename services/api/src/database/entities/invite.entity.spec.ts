import { InviteEntity } from './invite.entity';

describe('InviteEntity', () => {
  it('should create an invite entity', () => {
    const invite = new InviteEntity();
    invite.sessionId = 'session-123';
    invite.token = 'invite-token-xyz';
    invite.expiresAt = new Date('2026-06-01T12:00:00Z');

    expect(invite.sessionId).toBe('session-123');
    expect(invite.token).toBe('invite-token-xyz');
    expect(invite.expiresAt).toBeInstanceOf(Date);
  });

  it('should have all required fields', () => {
    const invite = new InviteEntity();

    expect(invite).toHaveProperty('id');
    expect(invite).toHaveProperty('sessionId');
    expect(invite).toHaveProperty('token');
    expect(invite).toHaveProperty('expiresAt');
    expect(invite).toHaveProperty('createdAt');
  });

  it('should have unique token constraint', () => {
    const invite = new InviteEntity();
    invite.token = 'unique-token-abc';

    expect(invite.token).toBe('unique-token-abc');
  });

  it('should support ManyToOne session relationship', () => {
    const invite = new InviteEntity();
    invite.sessionId = 'session-456';

    expect(invite.sessionId).toBe('session-456');
    expect(invite).toHaveProperty('session');
  });
});
