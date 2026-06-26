import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QuestionEntity } from '../database/entities/question.entity';
import { QuestionStatus } from '@webinar/shared';

@Injectable()
export class QAService {
  constructor(
    @InjectRepository(QuestionEntity)
    private readonly repo: Repository<QuestionEntity>,
  ) {}

  async submit(sessionId: string, userId: string, userName: string, text: string): Promise<QuestionEntity> {
    return this.repo.save(
      this.repo.create({ sessionId, userId, userName, text, status: QuestionStatus.PENDING, upvotes: 0, upvotedBy: [] }),
    );
  }

  async approve(questionId: string): Promise<QuestionEntity> {
    const q = await this.findOrFail(questionId);
    q.status = QuestionStatus.APPROVED;
    return this.repo.save(q);
  }

  async reject(questionId: string): Promise<QuestionEntity> {
    const q = await this.findOrFail(questionId);
    q.status = QuestionStatus.REJECTED;
    return this.repo.save(q);
  }

  async answer(questionId: string, answer: string): Promise<QuestionEntity> {
    const q = await this.findOrFail(questionId);
    if (q.status !== QuestionStatus.APPROVED) throw new BadRequestException('Only approved questions can be answered');
    q.status = QuestionStatus.ANSWERED;
    q.answer = answer;
    return this.repo.save(q);
  }

  async upvote(questionId: string, userId: string): Promise<QuestionEntity> {
    const q = await this.findOrFail(questionId);
    if (!(q.upvotedBy || []).includes(userId)) {
      q.upvotedBy = [...(q.upvotedBy || []), userId];
      q.upvotes = q.upvotedBy.length;
      return this.repo.save(q);
    }
    return q;
  }

  async getPending(sessionId: string): Promise<QuestionEntity[]> {
    return this.repo.find({ where: { sessionId, status: QuestionStatus.PENDING }, order: { createdAt: 'ASC' } });
  }

  async getApproved(sessionId: string): Promise<QuestionEntity[]> {
    return this.repo.find({ where: { sessionId, status: QuestionStatus.APPROVED }, order: { upvotes: 'DESC' } });
  }

  private async findOrFail(id: string): Promise<QuestionEntity> {
    const q = await this.repo.findOne({ where: { id } });
    if (!q) throw new NotFoundException('Question not found');
    return q;
  }
}
