import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { SessionEntity } from '../database/entities/session.entity';
import { SessionStatus } from '@webinar/shared';

@Injectable()
export class SchedulingService {
  private readonly logger = new Logger(SchedulingService.name);

  constructor(
    @InjectRepository(SessionEntity)
    private readonly sessionRepository: Repository<SessionEntity>,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Returns sessions with status='scheduled' whose scheduledAt is in the future,
   * ordered by scheduledAt ASC (soonest first).
   */
  async getUpcomingSessions(): Promise<SessionEntity[]> {
    const now = new Date();

    return this.sessionRepository
      .createQueryBuilder('session')
      .where('session.status = :status', { status: SessionStatus.SCHEDULED })
      .andWhere('session.scheduledAt > :now', { now })
      .orderBy('session.scheduledAt', 'ASC')
      .getMany();
  }

  /**
   * Returns sessions whose scheduledAt has passed but are still in 'scheduled' status.
   * These are candidates for auto-start.
   */
  async getSessionsDueToStart(): Promise<SessionEntity[]> {
    const now = new Date();

    return this.sessionRepository
      .createQueryBuilder('session')
      .where('session.status = :status', { status: SessionStatus.SCHEDULED })
      .andWhere('session.scheduledAt <= :now', { now })
      .orderBy('session.scheduledAt', 'ASC')
      .getMany();
  }

  /**
   * Reschedules a session by updating its scheduledAt (and optionally endedAt placeholder).
   * Only sessions in SCHEDULED status can be rescheduled.
   */
  async rescheduleSession(
    sessionId: string,
    newStartAt: Date,
    newEndAt?: Date,
  ): Promise<SessionEntity> {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }

    if (session.status !== SessionStatus.SCHEDULED) {
      throw new NotFoundException(
        `Cannot reschedule session ${sessionId} — current status is "${session.status}"`,
      );
    }

    const previousScheduledAt = session.scheduledAt;
    session.scheduledAt = newStartAt;

    // If the entity supports an endedAt placeholder for scheduling, set it
    if (newEndAt !== undefined) {
      (session as any).scheduledEndAt = newEndAt;
    }

    const saved = await this.sessionRepository.save(session);

    this.logger.log(
      `Session ${sessionId} rescheduled: ${previousScheduledAt.toISOString()} → ${newStartAt.toISOString()}`,
    );

    return saved;
  }

  /**
   * Returns all sessions that fall within a given date range (inclusive),
   * regardless of status. Useful for calendar views.
   */
  async getScheduleCalendar(from: Date, to: Date): Promise<SessionEntity[]> {
    return this.sessionRepository
      .createQueryBuilder('session')
      .where('session.scheduledAt >= :from', { from })
      .andWhere('session.scheduledAt <= :to', { to })
      .orderBy('session.scheduledAt', 'ASC')
      .getMany();
  }
}
