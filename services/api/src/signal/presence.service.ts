import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { PresenceData, ParticipantRole } from '@webinar/shared';

@Injectable()
export class PresenceService implements OnModuleDestroy {
  private readonly logger = new Logger(PresenceService.name);
  private readonly redis: Redis;
  private readonly TTL = 30; // seconds — 3× the 10s client ping interval

  constructor(private readonly configService: ConfigService) {
    const redisUrl = this.configService.get<string>('REDIS_URL', 'redis://localhost:6379');
    this.redis = new Redis(redisUrl);
    this.redis.on('error', (err) => this.logger.error('Redis presence error', err.message));
  }

  onModuleDestroy() {
    this.redis.disconnect();
  }

  private userKey(userId: string): string {
    return `presence:user:${userId}`;
  }

  private roomKey(roomId: string): string {
    return `presence:room:${roomId}`;
  }

  async setPresence(userId: string, data: Omit<PresenceData, 'userId'>): Promise<void> {
    const payload: PresenceData = { userId, ...data, lastSeen: Date.now() };
    const pipeline = this.redis.pipeline();
    pipeline.setex(this.userKey(userId), this.TTL, JSON.stringify(payload));
    if (data.online && data.roomId) {
      pipeline.sadd(this.roomKey(data.roomId), userId);
      pipeline.expire(this.roomKey(data.roomId), this.TTL * 3);
    }
    await pipeline.exec();
  }

  async removePresence(userId: string, roomId?: string): Promise<void> {
    await this.redis.del(this.userKey(userId));
    if (roomId) {
      await this.redis.srem(this.roomKey(roomId), userId);
    }
  }

  async heartbeat(userId: string): Promise<void> {
    const raw = await this.redis.get(this.userKey(userId));
    if (raw) {
      await this.redis.expire(this.userKey(userId), this.TTL);
    }
  }

  async getPresence(userId: string): Promise<PresenceData | null> {
    const raw = await this.redis.get(this.userKey(userId));
    if (!raw) return null;
    try { return JSON.parse(raw) as PresenceData; } catch { return null; }
  }

  async getRoomPresence(roomId: string): Promise<PresenceData[]> {
    const userIds = await this.redis.smembers(this.roomKey(roomId));
    if (!userIds.length) return [];
    const pipeline = this.redis.pipeline();
    userIds.forEach((uid) => pipeline.get(this.userKey(uid)));
    const results = await pipeline.exec();
    const presences: PresenceData[] = [];
    results?.forEach(([err, raw]) => {
      if (!err && raw) {
        try { presences.push(JSON.parse(raw as string) as PresenceData); } catch { /* skip */ }
      }
    });
    return presences;
  }
}
