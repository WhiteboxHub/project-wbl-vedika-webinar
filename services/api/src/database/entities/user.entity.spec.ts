import { UserEntity } from './user.entity';
import { UserRole } from '@webinar/shared';

describe('UserEntity', () => {
  it('should create a user entity', () => {
    const user = new UserEntity();
    user.email = 'test@example.com';
    user.name = 'Test User';
    user.role = UserRole.INSTRUCTOR;

    expect(user.email).toBe('test@example.com');
    expect(user.name).toBe('Test User');
    expect(user.role).toBe(UserRole.INSTRUCTOR);
  });

  it('should default role to attendee', () => {
    const user = new UserEntity();
    user.email = 'attendee@example.com';
    user.name = 'Attendee User';

    expect(user.role).toBeUndefined();
  });

  it('should have all required fields', () => {
    const user = new UserEntity();

    expect(user).toHaveProperty('id');
    expect(user).toHaveProperty('email');
    expect(user).toHaveProperty('name');
    expect(user).toHaveProperty('role');
    expect(user).toHaveProperty('createdAt');
    expect(user).toHaveProperty('updatedAt');
  });
});
