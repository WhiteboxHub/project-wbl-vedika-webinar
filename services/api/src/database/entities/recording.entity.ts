import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { RecordingStatus, RecordingResolution } from '@webinar/shared';

@Entity('recordings')
export class RecordingEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'session_id' })
  sessionId: string;

  @Column({
    type: 'enum',
    enum: RecordingStatus,
    default: RecordingStatus.RECORDING_STARTING,
  })
  status: RecordingStatus;

  @Column({ name: 'egress_id', nullable: true })
  egressId?: string;

  @Column({ name: 'raw_path', nullable: true })
  rawPath?: string;

  @Column({ name: 'final_path', nullable: true })
  finalPath?: string;

  @Column({ nullable: true })
  duration?: number;

  @Column({ name: 'file_size', type: 'bigint', nullable: true })
  fileSize?: number;

  @Column({ type: 'enum', enum: RecordingResolution, nullable: true })
  resolution?: RecordingResolution;

  @Column({ type: 'text', nullable: true })
  error?: string;

  @Column({ name: 'ffmpeg_logs', type: 'text', nullable: true })
  ffmpegLogs?: string;

  @Column({ name: 'started_at' })
  startedAt: Date;

  @Column({ name: 'stopped_at', nullable: true })
  stoppedAt?: Date;

  @Column({ name: 'processed_at', nullable: true })
  processedAt?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
