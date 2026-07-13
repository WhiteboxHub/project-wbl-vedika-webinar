import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SessionEntity } from '../database/entities/session.entity';
import { CreateSessionRequest, UpdateSessionRequest, SessionStatus } from '@webinar/shared';
import { randomBytes } from 'crypto';
import { TokenService } from '../livekit/token.service';
import { SignalService } from '../signal/signal.service';
import { ParticipantsService } from '../participants/participants.service';
import { SessionRole } from '@webinar/shared';

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    @InjectRepository(SessionEntity)
    private readonly sessionRepository: Repository<SessionEntity>,
    private readonly tokenService: TokenService,
    private readonly signalService: SignalService,
    private readonly participantsService: ParticipantsService,
  ) {}

  async createSession(
    instructorId: string,
    data: CreateSessionRequest,
  ): Promise<SessionEntity> {
    const inviteToken = this.generateInviteToken();
    const slug = this.generateSlug(data.title);

    const session = this.sessionRepository.create({
      title: data.title,
      slug,
      description: data.description,
      instructorId,
      status: SessionStatus.SCHEDULED,
      scheduledAt: data.scheduledAt,
      scheduledStartAt: data.scheduledStartAt ?? data.scheduledAt,
      scheduledEndAt: data.scheduledEndAt,
      timezone: data.timezone,
      duration: data.duration,
      autoStart: data.autoStart ?? false,
      liveKitRoomName: 'pending',
      inviteToken,
      maxAttendees: data.maxAttendees || 100,
    });

    const saved = await this.sessionRepository.save(session);
    saved.liveKitRoomName = saved.id;
    const finalSession = await this.sessionRepository.save(saved);

    const instructor = await this.sessionRepository.findOne({
      where: { id: finalSession.id },
      relations: ['instructor'],
    });
    if (instructor?.instructor) {
      await this.participantsService.upsertParticipant(
        finalSession.id,
        instructorId,
        instructor.instructor.name,
        SessionRole.ORGANIZER,
      );
    }

    return finalSession;
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

    const saved = await this.sessionRepository.save(session);

    // ── Tear down LiveKit room ─────────────────────────────────────────────
    // Deleting the room disconnects all participants from the media server.
    // This is best-effort: if LiveKit is unreachable we log and continue.
    const roomId = session.id;
    try {
      const roomClient = this.tokenService.getRoomServiceClient();
      await roomClient.deleteRoom(roomId);
      this.logger.log(`[${roomId}] LiveKit room deleted`);
    } catch (err: any) {
      if (!err?.message?.includes('not found')) {
        this.logger.warn(`[${roomId}] deleteRoom failed: ${err.message}`);
      }
    }

    this.signalService.broadcast(roomId, 'session-ended', {
      sessionId,
      endedAt: saved.endedAt,
    });
    this.logger.log(`[${roomId}] session-ended broadcast sent`);

    // GAP-08: Purge in-memory signal state to prevent memory leaks across sessions.
    // Do this after the broadcast so all connected clients receive the event first.
    this.signalService.purgeRoom(roomId);

    return saved;
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

  /** Generate a URL-safe slug from title + random suffix */
  private generateSlug(title: string): string {
    const base = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 30);
    const suffix = Math.floor(1000 + Math.random() * 9000);
    return `${base}-${suffix}`;
  }

  async findBySlug(slug: string): Promise<SessionEntity> {
    const session = await this.sessionRepository.findOne({
      where: { slug },
      relations: ['instructor'],
    });
    if (!session) {
      throw new NotFoundException(`Session with slug "${slug}" not found`);
    }
    return session;
  }
}
