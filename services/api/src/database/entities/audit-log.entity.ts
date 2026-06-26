import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';
import { AuditAction } from '@webinar/shared';

@Entity('audit_logs')
export class AuditLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: AuditAction })
  action: AuditAction;

  @Column({ name: 'user_id', nullable: true })
  userId?: string;

  @Column({ name: 'session_id', nullable: true })
  sessionId?: string;

  @Column({ name: 'recording_id', nullable: true })
  recordingId?: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>;

  @CreateDateColumn({ name: 'timestamp' })
  timestamp: Date;
}
