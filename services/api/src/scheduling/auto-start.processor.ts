import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { SessionEntity } from '../database/entities/session.entity';
import { SessionStatus } from '@webinar/shared';

/**
 * Bull processor for the 'scheduling' queue.
 * Periodically checks for sessions that should be auto-started
 * (scheduledAt <= now AND status = 'scheduled').
 */
@Processor('scheduling')
export class AutoStartProcessor {
  private readonly logger = new Logger(AutoStartProcessor.name);

  constructor(
    @InjectRepository(SessionEntity)
    private readonly sessionRepository: Repository<SessionEntity>,
  ) {}

  /**
   * Processes the 'check-auto-start' job.
   * Finds all sessions due to start and transitions them to LIVE.
   */
  @Process('check-auto-start')
  async handleCheckAutoStart(job: Job): Promise<void> {
    this.logger.log('Running auto-start check…');

    const now = new Date();

    let dueSessions: SessionEntity[];
    try {
      dueSessions = await this.sessionRepository.find({
        where: {
          status: SessionStatus.SCHEDULED,
          autoStart: true,
          scheduledAt: LessThanOrEqual(now),
        },
      });
    } catch (error: any) {
      this.logger.error(`Failed to query sessions due to start: ${error.message}`, error.stack);
      return;
    }

    if (dueSessions.length === 0) {
      this.logger.debug('No sessions due for auto-start');
      return;
    }

    this.logger.log(`Found ${dueSessions.length} session(s) due for auto-start`);

    for (const session of dueSessions) {
      try {
        session.status = SessionStatus.LIVE;
        session.startedAt = now;

        await this.sessionRepository.save(session);

        this.logger.log(
          `Auto-started session "${session.title}" (${session.id}) — ` +
          `was scheduled for ${session.scheduledAt.toISOString()}`,
        );
      } catch (error: any) {
        // One session failure must not block processing of remaining sessions
        this.logger.error(
          `Failed to auto-start session ${session.id}: ${error.message}`,
          error.stack,
        );
      }
    }

    this.logger.log(`Auto-start check complete. Processed ${dueSessions.length} session(s).`);
  }
}
