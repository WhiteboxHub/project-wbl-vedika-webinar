import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UserEntity } from '../database/entities/user.entity';
import { UserRole } from '@webinar/shared';

describe('AuthService', () => {
  let service: AuthService;
  let userRepository: Repository<UserEntity>;
  let jwtService: JwtService;

  const mockUserRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn(),
    verify: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: string) => {
      if (key === 'JWT_SECRET') return 'test-secret';
      return defaultValue;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(UserEntity),
          useValue: mockUserRepository,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    userRepository = module.get<Repository<UserEntity>>(getRepositoryToken(UserEntity));
    jwtService = module.get<JwtService>(JwtService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('requestMagicLink', () => {
    it('should generate a magic link token', async () => {
      const email = 'test@example.com';
      const token = 'mock-token';

      mockJwtService.sign.mockReturnValue(token);

      const result = await service.requestMagicLink(email);

      expect(result.token).toBe(token);
      expect(mockJwtService.sign).toHaveBeenCalledWith(
        {
          email: email,
          type: 'magic-link',
        },
        { expiresIn: '15m' },
      );
    });

    it('should normalize email to lowercase', async () => {
      const email = 'Test@Example.COM';
      mockJwtService.sign.mockReturnValue('token');

      await service.requestMagicLink(email);

      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'test@example.com',
        }),
        expect.any(Object),
      );
    });
  });

  describe('verifyMagicLinkToken', () => {
    it('should verify token and return existing user', async () => {
      const token = 'valid-token';
      const email = 'test@example.com';
      const existingUser = {
        id: '123',
        email,
        name: 'Test User',
        role: UserRole.INSTRUCTOR,
      } as UserEntity;

      mockJwtService.verify.mockReturnValue({
        email,
        type: 'magic-link',
      });
      mockUserRepository.findOne.mockResolvedValue(existingUser);
      mockJwtService.sign.mockReturnValue('access-token');

      const result = await service.verifyMagicLinkToken(token);

      expect(result.accessToken).toBe('access-token');
      expect(result.user.id).toBe('123');
      expect(result.user.email).toBe(email);
      expect(mockUserRepository.findOne).toHaveBeenCalledWith({
        where: { email },
      });
    });

    it('should create new user if not exists', async () => {
      const token = 'valid-token';
      const email = 'new@example.com';
      const newUser = {
        id: '456',
        email,
        name: 'New',
        role: UserRole.ATTENDEE,
      } as UserEntity;

      mockJwtService.verify.mockReturnValue({
        email,
        type: 'magic-link',
      });
      mockUserRepository.findOne.mockResolvedValue(null);
      mockUserRepository.create.mockReturnValue(newUser);
      mockUserRepository.save.mockResolvedValue(newUser);
      mockJwtService.sign.mockReturnValue('access-token');

      const result = await service.verifyMagicLinkToken(token);

      expect(result.user.id).toBe('456');
      expect(result.user.role).toBe(UserRole.ATTENDEE);
      expect(mockUserRepository.create).toHaveBeenCalledWith({
        email,
        name: expect.any(String),
        role: UserRole.ATTENDEE,
      });
      expect(mockUserRepository.save).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException for invalid token', async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(service.verifyMagicLinkToken('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException for wrong token type', async () => {
      mockJwtService.verify.mockReturnValue({
        email: 'test@example.com',
        type: 'access-token',
      });

      await expect(service.verifyMagicLinkToken('wrong-type-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('validateUser', () => {
    it('should return user if found', async () => {
      const userId = '123';
      const user = {
        id: userId,
        email: 'test@example.com',
        name: 'Test User',
        role: UserRole.INSTRUCTOR,
      } as UserEntity;

      mockUserRepository.findOne.mockResolvedValue(user);

      const result = await service.validateUser(userId);

      expect(result).toBe(user);
      expect(mockUserRepository.findOne).toHaveBeenCalledWith({
        where: { id: userId },
      });
    });

    it('should throw UnauthorizedException if user not found', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(service.validateUser('non-existent')).rejects.toThrow(UnauthorizedException);
    });
  });
});
