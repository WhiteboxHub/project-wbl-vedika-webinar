import { Injectable } from '@nestjs/common';
import { ReactionType } from '@webinar/shared';

const VALID_REACTIONS: ReadonlySet<ReactionType> = new Set([
  'thumbs-up', 'heart', 'clap', 'laugh', 'surprised',
]);
const RATE_LIMIT_MS = 2000;

@Injectable()
export class ReactionService {
  private readonly lastReaction = new Map<string, number>();

  isValid(type: string): type is ReactionType {
    return VALID_REACTIONS.has(type as ReactionType);
  }

  isRateLimited(userId: string): boolean {
    const last = this.lastReaction.get(userId) ?? 0;
    return Date.now() - last < RATE_LIMIT_MS;
  }

  record(userId: string): void {
    this.lastReaction.set(userId, Date.now());
  }
}
