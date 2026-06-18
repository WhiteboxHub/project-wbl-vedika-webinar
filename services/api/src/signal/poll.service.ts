import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PollEntity } from '../database/entities/poll.entity';
import { PollOptionEntity } from '../database/entities/poll-option.entity';
import { PollVoteEntity } from '../database/entities/poll-vote.entity';
import { PollResult } from '@webinar/shared';

@Injectable()
export class PollService {
  constructor(
    @InjectRepository(PollEntity)
    private readonly pollRepo: Repository<PollEntity>,
    @InjectRepository(PollOptionEntity)
    private readonly optionRepo: Repository<PollOptionEntity>,
    @InjectRepository(PollVoteEntity)
    private readonly voteRepo: Repository<PollVoteEntity>,
  ) {}

  async createPoll(sessionId: string, question: string, options: string[]): Promise<PollEntity> {
    if (options.length < 2 || options.length > 10) {
      throw new BadRequestException('Poll must have 2–10 options');
    }
    const poll = await this.pollRepo.save(this.pollRepo.create({ sessionId, question, isActive: true }));
    const optionEntities = await this.optionRepo.save(
      options.map((text) => this.optionRepo.create({ pollId: poll.id, text })),
    );
    poll.options = optionEntities;
    return poll;
  }

  async submitVote(pollId: string, optionId: string, userId: string): Promise<PollResult> {
    const poll = await this.pollRepo.findOne({ where: { id: pollId }, relations: ['options'] });
    if (!poll) throw new NotFoundException('Poll not found');
    if (!poll.isActive) throw new BadRequestException('Poll is no longer active');
    if (!poll.options.find((o) => o.id === optionId)) throw new BadRequestException('Invalid option');

    const existing = await this.voteRepo.findOne({ where: { pollId, userId } });
    if (existing) {
      await this.voteRepo.update(existing.id, { optionId });
    } else {
      await this.voteRepo.save(this.voteRepo.create({ pollId, optionId, userId }));
    }
    return this.getResults(pollId);
  }

  async getResults(pollId: string): Promise<PollResult> {
    const poll = await this.pollRepo.findOne({ where: { id: pollId }, relations: ['options'] });
    if (!poll) throw new NotFoundException('Poll not found');
    const votes = await this.voteRepo.find({ where: { pollId } });
    const totalVotes = votes.length;
    const options = poll.options.map((opt) => {
      const count = votes.filter((v) => v.optionId === opt.id).length;
      return {
        id: opt.id,
        text: opt.text,
        count,
        percentage: totalVotes ? Math.round((count / totalVotes) * 100) : 0,
      };
    });
    return { pollId, question: poll.question, totalVotes, options };
  }

  async closePoll(pollId: string): Promise<void> {
    await this.pollRepo.update(pollId, { isActive: false });
  }

  async getActivePoll(sessionId: string): Promise<PollEntity | null> {
    return this.pollRepo.findOne({ where: { sessionId, isActive: true }, relations: ['options'] });
  }
}
