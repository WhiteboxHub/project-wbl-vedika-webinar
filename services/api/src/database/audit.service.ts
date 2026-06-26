import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLogEntity } from './entities/audit-log.entity';
import { AuditAction } from '@webinar/shared';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLogEntity)
    private readonly auditLogRepository: Repository<AuditLogEntity>,
  ) {}

  async log(
    action: AuditAction,
    options?: {
      userId?: string;
      sessionId?: string;
      recordingId?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    try {
      const auditLog = this.auditLogRepository.create({
        action,
        userId: options?.userId,
        sessionId: options?.sessionId,
        recordingId: options?.recordingId,
        metadata: options?.metadata,
      });

      await this.auditLogRepository.save(auditLog);

      this.logger.log(
        `Audit log created: ${action} ${options?.recordingId ? `recording=${options.recordingId}` : ''}`,
      );
    } catch (error) {
      this.logger.error('Failed to create audit log', error);
    }
  }
}
