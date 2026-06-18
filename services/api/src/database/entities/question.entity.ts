import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { QuestionStatus } from '@webinar/shared';

@Entity('questions')
export class QuestionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  sessionId: string;

  @Column()
  userId: string;

  @Column()
  userName: string;

  @Column('text')
  text: string;

  @Column({ type: 'varchar', default: QuestionStatus.PENDING })
  status: QuestionStatus;

  @Column({ default: 0 })
  upvotes: number;

  @Column({ type: 'text', nullable: true })
  answer: string | null;

  @Column('simple-array', { nullable: true })
  upvotedBy: string[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
