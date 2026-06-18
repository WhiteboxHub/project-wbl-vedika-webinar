import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatMessageEntity } from '../database/entities/chat-message.entity';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(ChatMessageEntity)
    private readonly repo: Repository<ChatMessageEntity>,
  ) {}

  async save(sessionId: string, userId: string, userName: string, message: string): Promise<ChatMessageEntity> {
    const entity = this.repo.create({ sessionId, userId, userName, message });
    return this.repo.save(entity);
  }

  async getHistory(sessionId: string, limit = 50): Promise<ChatMessageEntity[]> {
    const msgs = await this.repo.find({
      where: { sessionId, isModerated: false },
      order: { createdAt: 'DESC' },
      take: limit,
    });
    return msgs.reverse();
  }
}
