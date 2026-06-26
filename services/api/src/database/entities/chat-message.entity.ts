import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('chat_messages')
export class ChatMessageEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  sessionId: string;

  @Column()
  userId: string;

  @Column()
  userName: string;

  @Column('text')
  message: string;

  @Column({ default: false })
  isModerated: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
