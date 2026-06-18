import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { PollEntity } from './poll.entity';

@Entity('poll_options')
export class PollOptionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  pollId: string;

  @Column('text')
  text: string;

  @ManyToOne(() => PollEntity, (poll) => poll.options)
  @JoinColumn({ name: 'pollId' })
  poll: PollEntity;
}
