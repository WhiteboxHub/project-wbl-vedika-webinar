import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SessionsService } from './sessions.service';
import { SessionEntity } from '../database/entities/session.entity';
import { SessionStatus } from '@webinar/shared';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

describe('SessionsService', () => {
  let service: SessionsService;
  let repository: Repository<SessionEntity>;

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionsService,
        {
          provide: getRepositoryToken(SessionEntity),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<SessionsService>(SessionsService);
    repository = module.get<Repository<SessionEntity>>(getRepositoryToken(SessionEntity));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createSession', () => {
    it('should create a session with SCHEDULED status', async () => {
      const instructorId = 'instructor-123';
      const data = {
        title: 'Test Session',
        description: 'Test Description',
        scheduledAt: new Date('2026-06-01T10:00:00Z'),
        maxAttendees: 50,
      };

      const mockSession = {
        id: 'session-123',
        ...data,
        instructorId,
        status: SessionStatus.SCHEDULED,
        liveKitRoomName: 'session_123_abc',
        inviteToken: 'token_xyz',
      };

      mockRepository.create.mockReturnValue(mockSession);
      mockRepository.save.mockResolvedValue(mockSession);

      const result = await service.createSession(instructorId, data);

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: data.title,
          instructorId,
          status: SessionStatus.SCHEDULED,
        }),
      );
      expect(result.status).toBe(SessionStatus.SCHEDULED);
    });
  });

  describe('getSession', () => {
    it('should return session if found', async () => {
      const mockSession = { id: 'session-123', title: 'Test' };
      mockRepository.findOne.mockResolvedValue(mockSession);

      const result = await service.getSession('session-123');

      expect(result).toEqual(mockSession);
    });

    it('should throw NotFoundException if not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.getSession('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('startSession', () => {
    it('should start a scheduled session', async () => {
      const mockSession = {
        id: 'session-123',
        instructorId: 'instructor-123',
        status: SessionStatus.SCHEDULED,
      };

      mockRepository.findOne.mockResolvedValue(mockSession);
      mockRepository.save.mockResolvedValue({
        ...mockSession,
        status: SessionStatus.LIVE,
        startedAt: expect.any(Date),
      });

      const result = await service.startSession('session-123', 'instructor-123');

      expect(result.status).toBe(SessionStatus.LIVE);
    });

    it('should throw ForbiddenException if not instructor', async () => {
      const mockSession = {
        id: 'session-123',
        instructorId: 'instructor-123',
        status: SessionStatus.SCHEDULED,
      };

      mockRepository.findOne.mockResolvedValue(mockSession);

      await expect(service.startSession('session-123', 'other-user')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('endSession', () => {
    it('should end a live session', async () => {
      const mockSession = {
        id: 'session-123',
        instructorId: 'instructor-123',
        status: SessionStatus.LIVE,
      };

      mockRepository.findOne.mockResolvedValue(mockSession);
      mockRepository.save.mockResolvedValue({
        ...mockSession,
        status: SessionStatus.ENDED,
        endedAt: expect.any(Date),
      });

      const result = await service.endSession('session-123', 'instructor-123');

      expect(result.status).toBe(SessionStatus.ENDED);
    });
  });
});
