import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { SessionStatus } from '@webinar/shared';
import { UserEntity } from './user.entity';

@Entity('sessions')
export class SessionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Human-readable, permanent URL slug (e.g., "bright-summit-4829") */
  @Column({ length: 50, unique: true, nullable: true })
  slug?: string;

  @Column({ length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ name: 'instructor_id' })
  instructorId: string;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'instructor_id' })
  instructor: UserEntity;

  @Column({
    type: 'varchar',
    length: 50,
    default: SessionStatus.SCHEDULED,
  })
  status: SessionStatus;

  @Column({ name: 'scheduled_at' })
  scheduledAt: Date;

  /** Precise start time with timezone awareness (for scheduling) */
  @Column({ name: 'scheduled_start_at', nullable: true })
  scheduledStartAt?: Date;

  /** Precise end time (for auto-end and duration display) */
  @Column({ name: 'scheduled_end_at', nullable: true })
  scheduledEndAt?: Date;

  /** IANA timezone string (e.g., "America/New_York") */
  @Column({ length: 100, nullable: true })
  timezone?: string;

  /** Duration in minutes */
  @Column({ type: 'int', nullable: true })
  duration?: number;

  /** Whether to auto-start the session at scheduledStartAt */
  @Column({ name: 'auto_start', default: false })
  autoStart: boolean;

  /** Recurring pattern: null=one-time, 'daily', 'weekly', 'custom' */
  @Column({ name: 'recurring_pattern', length: 50, nullable: true })
  recurringPattern?: string;

  @Column({ name: 'started_at', nullable: true })
  startedAt?: Date;

  @Column({ name: 'ended_at', nullable: true })
  endedAt?: Date;

  @Column({ name: 'livekit_room_name', unique: true, length: 255 })
  liveKitRoomName: string;

  @Column({ name: 'max_attendees', default: 100 })
  maxAttendees: number;

  @Column({ name: 'invite_token', unique: true, length: 500 })
  inviteToken: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
