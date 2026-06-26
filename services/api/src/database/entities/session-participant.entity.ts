import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { SessionRole } from '@webinar/shared';
import { SessionEntity } from './session.entity';
import { UserEntity } from './user.entity';

@Entity('session_participants')
@Unique(['sessionId', 'userId'])
export class SessionParticipantEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'session_id' })
  sessionId: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'display_name', default: '' })
  displayName: string;

  @Column({ type: 'varchar', length: 32, default: SessionRole.ATTENDEE })
  role: SessionRole;

  @Column({ name: 'can_publish_audio', default: false })
  canPublishAudio: boolean;

  @Column({ name: 'can_publish_video', default: false })
  canPublishVideo: boolean;

  @Column({ name: 'can_share_screen', default: false })
  canShareScreen: boolean;

  @Column({ name: 'joined_at', type: 'timestamptz', nullable: true })
  joinedAt: Date | null;

  @Column({ name: 'left_at', type: 'timestamptz', nullable: true })
  leftAt: Date | null;

  @ManyToOne(() => SessionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session: SessionEntity;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
