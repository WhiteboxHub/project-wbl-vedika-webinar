import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { RaisedHandEntry, AudioRequestEntry } from '@webinar/shared';

@Injectable()
export class HandsService implements OnModuleDestroy {
  private readonly redis: Redis;

  constructor(private readonly config: ConfigService) {
    const redisUrl = this.config.get<string>('REDIS_URL', 'redis://localhost:6379');
    this.redis = new Redis(redisUrl);
  }

  onModuleDestroy() {
    this.redis.disconnect();
  }

  private handsKey(sessionId: string) {
    return `session:${sessionId}:raised_hands`;
  }

  private audioKey(sessionId: string) {
    return `session:${sessionId}:audio_requests`;
  }

  async raiseHand(sessionId: string, userId: string, userName: string): Promise<RaisedHandEntry> {
    const at = Date.now();
    const entry: RaisedHandEntry = { userId, userName, raisedAt: at };
    await this.redis.hset(this.handsKey(sessionId), userId, JSON.stringify(entry));
    return entry;
  }

  async lowerHand(sessionId: string, userId: string): Promise<void> {
    await this.redis.hdel(this.handsKey(sessionId), userId);
  }

  async getRaisedHands(sessionId: string): Promise<RaisedHandEntry[]> {
    const raw = await this.redis.hgetall(this.handsKey(sessionId));
    return Object.values(raw).map((v) => JSON.parse(v) as RaisedHandEntry);
  }

  async requestAudio(sessionId: string, userId: string, userName: string): Promise<AudioRequestEntry> {
    const entry: AudioRequestEntry = {
      userId,
      userName,
      status: 'pending',
      requestedAt: Date.now(),
    };
    await this.redis.hset(this.audioKey(sessionId), userId, JSON.stringify(entry));
    return entry;
  }

  async approveAudio(sessionId: string, userId: string): Promise<AudioRequestEntry | null> {
    const raw = await this.redis.hget(this.audioKey(sessionId), userId);
    if (!raw) return null;
    const entry = JSON.parse(raw) as AudioRequestEntry;
    entry.status = 'approved';
    await this.redis.hset(this.audioKey(sessionId), userId, JSON.stringify(entry));
    await this.redis.hdel(this.handsKey(sessionId), userId);
    return entry;
  }

  async denyAudio(sessionId: string, userId: string): Promise<AudioRequestEntry | null> {
    const raw = await this.redis.hget(this.audioKey(sessionId), userId);
    if (!raw) return null;
    const entry = JSON.parse(raw) as AudioRequestEntry;
    entry.status = 'denied';
    await this.redis.hset(this.audioKey(sessionId), userId, JSON.stringify(entry));
    return entry;
  }

  async getAudioRequests(sessionId: string): Promise<AudioRequestEntry[]> {
    const raw = await this.redis.hgetall(this.audioKey(sessionId));
    return Object.values(raw).map((v) => JSON.parse(v) as AudioRequestEntry);
  }

  async clearParticipant(sessionId: string, userId: string): Promise<void> {
    await this.redis.hdel(this.handsKey(sessionId), userId);
    await this.redis.hdel(this.audioKey(sessionId), userId);
  }
}
