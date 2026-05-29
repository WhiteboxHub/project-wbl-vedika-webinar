import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SessionEntity } from '../database/entities/session.entity';
import { CreateSessionRequest, UpdateSessionRequest, SessionStatus } from '@webinar/shared';
import { randomBytes } from 'crypto';

@Injectable()
export class SessionsService {
  constructor(
    @InjectRepository(SessionEntity)
    private readonly sessionRepository: Repository<SessionEntity>,
  ) {}

  async createSession(
    instructorId: string,
    data: CreateSessionRequest,
  ): Promise<SessionEntity> {
    const liveKitRoomName = this.generateRoomName();
    const inviteToken = this.generateInviteToken();

    const session = this.sessionRepository.create({
      title: data.title,
      description: data.description,
      instructorId,
      status: SessionStatus.SCHEDULED,
      scheduledAt: data.scheduledAt,
      liveKitRoomName,
      inviteToken,
      maxAttendees: data.maxAttendees || 100,
    });

    return await this.sessionRepository.save(session);
  }

  async getSession(sessionId: string): Promise<SessionEntity> {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId },
      relations: ['instructor'],
    });

    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }

    return session;
  }

  async updateSession(
    sessionId: string,
    userId: string,
    data: UpdateSessionRequest,
  ): Promise<SessionEntity> {
    const session = await this.getSession(sessionId);

    if (session.instructorId !== userId) {
      throw new ForbiddenException('Only the instructor can update this session');
    }

    if (data.title !== undefined) session.title = data.title;
    if (data.description !== undefined) session.description = data.description;
    if (data.scheduledAt !== undefined) session.scheduledAt = data.scheduledAt;
    if (data.maxAttendees !== undefined) session.maxAttendees = data.maxAttendees;
    if (data.status !== undefined) session.status = data.status;

    return await this.sessionRepository.save(session);
  }

  async startSession(sessionId: string, userId: string): Promise<SessionEntity> {
    const session = await this.getSession(sessionId);

    if (session.instructorId !== userId) {
      throw new ForbiddenException('Only the instructor can start this session');
    }

    if (session.status !== SessionStatus.SCHEDULED) {
      throw new ForbiddenException('Session must be in SCHEDULED status to start');
    }

    session.status = SessionStatus.LIVE;
    session.startedAt = new Date();

    return await this.sessionRepository.save(session);
  }

  async endSession(sessionId: string, userId: string): Promise<SessionEntity> {
    const session = await this.getSession(sessionId);

    if (session.instructorId !== userId) {
      throw new ForbiddenException('Only the instructor can end this session');
    }

    if (session.status !== SessionStatus.LIVE) {
      throw new ForbiddenException('Session must be LIVE to end');
    }

    session.status = SessionStatus.ENDED;
    session.endedAt = new Date();

    return await this.sessionRepository.save(session);
  }

  async listInstructorSessions(instructorId: string): Promise<SessionEntity[]> {
    return await this.sessionRepository.find({
      where: { instructorId },
      order: { scheduledAt: 'DESC' },
    });
  }

  async deleteSession(sessionId: string, userId: string): Promise<SessionEntity> {
    const session = await this.getSession(sessionId);

    if (session.instructorId !== userId) {
      throw new ForbiddenException('Only the instructor can delete this session');
    }

    session.status = SessionStatus.CANCELLED;

    return await this.sessionRepository.save(session);
  }

  private generateRoomName(): string {
    const timestamp = Date.now();
    const random = randomBytes(4).toString('hex');
    return `session_${timestamp}_${random}`;
  }

  private generateInviteToken(): string {
    return randomBytes(32).toString('base64url');
  }
}
