import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { SessionEntity } from './session.entity';

@Entity('invites')
export class InviteEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'session_id' })
  sessionId: string;

  @ManyToOne(() => SessionEntity)
  @JoinColumn({ name: 'session_id' })
  session: SessionEntity;

  @Column({ unique: true, length: 500 })
  token: string;

  @Column({ name: 'expires_at' })
  expiresAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
