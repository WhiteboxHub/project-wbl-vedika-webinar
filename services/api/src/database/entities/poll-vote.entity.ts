import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Unique } from 'typeorm';

@Entity('poll_votes')
@Unique(['pollId', 'userId'])
export class PollVoteEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  pollId: string;

  @Column()
  optionId: string;

  @Column()
  userId: string;

  @CreateDateColumn()
  createdAt: Date;
}
