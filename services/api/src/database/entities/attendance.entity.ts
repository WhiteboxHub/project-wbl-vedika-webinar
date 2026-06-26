import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { SessionEntity } from './session.entity';
import { UserEntity } from './user.entity';

@Entity('attendance')
export class AttendanceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'session_id' })
  sessionId: string;

  @ManyToOne(() => SessionEntity)
  @JoinColumn({ name: 'session_id' })
  session: SessionEntity;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @Column({ name: 'joined_at', default: () => 'NOW()' })
  joinedAt: Date;

  @Column({ name: 'left_at', nullable: true })
  leftAt?: Date;
}
