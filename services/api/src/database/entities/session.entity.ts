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
