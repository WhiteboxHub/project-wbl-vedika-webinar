import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

const GRACE_SECONDS = 60;

@Injectable()
export class GraceService implements OnModuleDestroy {
  private readonly logger = new Logger(GraceService.name);
  private readonly redis: Redis;

  constructor(private readonly config: ConfigService) {
    const redisUrl = this.config.get<string>('REDIS_URL', 'redis://localhost:6379');
    this.redis = new Redis(redisUrl);
  }

  onModuleDestroy() {
    this.redis.disconnect();
  }

  private graceKey(participantId: string): string {
    return `grace:participant:${participantId}`;
  }

  /** Mark participant as in grace period after socket disconnect */
  async enterGrace(participantId: string, roomId: string): Promise<void> {
    await this.redis.setex(this.graceKey(participantId), GRACE_SECONDS, roomId);
    this.logger.debug(`[${roomId}] participant ${participantId} entered ${GRACE_SECONDS}s grace`);
  }

  /** True if participant reconnected within grace window */
  async clearGraceIfPresent(participantId: string): Promise<boolean> {
    const key = this.graceKey(participantId);
    const existed = await this.redis.exists(key);
    if (existed) await this.redis.del(key);
    return existed === 1;
  }

  async isInGrace(participantId: string): Promise<boolean> {
    return (await this.redis.exists(this.graceKey(participantId))) === 1;
  }
}
