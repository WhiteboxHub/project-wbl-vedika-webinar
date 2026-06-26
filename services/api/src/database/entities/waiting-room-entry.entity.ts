import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { WaitingRoomState } from '@webinar/shared';

@Entity('waiting_room_entries')
export class WaitingRoomEntryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  sessionId: string;

  @Column()
  userId: string;

  @Column()
  userName: string;

  @Column({ type: 'varchar', default: WaitingRoomState.WAITING })
  state: WaitingRoomState;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
