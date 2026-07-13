import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private readonly redis: Redis;

  constructor(private readonly configService: ConfigService) {
    const redisUrl = this.configService.get<string>(
      'REDIS_URL',
      'redis://localhost:6379',
    );

    this.redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    });

    this.redis.on('error', (err) => {
      this.logger.error(`Redis connection error: ${err.message}`);
    });

    this.redis.on('connect', () => {
      this.logger.log('Connected to Redis');
    });
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.redis.quit();
      this.logger.log('Redis connection closed');
    } catch (error: any) {
      this.logger.error(`Error closing Redis connection: ${error.message}`);
    }
  }

  /**
   * Retrieves a value from the cache and parses it as JSON.
   * Returns null if the key does not exist or parsing fails.
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.get(key);
      if (raw === null) return null;
      return JSON.parse(raw) as T;
    } catch (error: any) {
      this.logger.error(`Cache GET error for key "${key}": ${error.message}`);
      return null;
    }
  }

  /**
   * Stores a value in the cache as a JSON string.
   * Optionally sets a TTL (in seconds).
   */
  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    try {
      const serialized = JSON.stringify(value);

      if (ttlSeconds !== undefined && ttlSeconds > 0) {
        await this.redis.set(key, serialized, 'EX', ttlSeconds);
      } else {
        await this.redis.set(key, serialized);
      }
    } catch (error: any) {
      this.logger.error(`Cache SET error for key "${key}": ${error.message}`);
    }
  }

  /**
   * Deletes a key from the cache.
   */
  async del(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (error: any) {
      this.logger.error(`Cache DEL error for key "${key}": ${error.message}`);
    }
  }

  /**
   * Cache-aside pattern: returns cached value if present, otherwise
   * calls the factory function, caches the result, and returns it.
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttlSeconds: number,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const value = await factory();
    await this.set(key, value, ttlSeconds);
    return value;
  }

  /**
   * Deletes all keys matching the given glob pattern using SCAN.
   * Uses cursor-based iteration to avoid blocking Redis.
   */
  async invalidatePattern(pattern: string): Promise<void> {
    try {
      let cursor = '0';
      let totalDeleted = 0;

      do {
        const [nextCursor, keys] = await this.redis.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          100,
        );
        cursor = nextCursor;

        if (keys.length > 0) {
          await this.redis.del(...keys);
          totalDeleted += keys.length;
        }
      } while (cursor !== '0');

      if (totalDeleted > 0) {
        this.logger.debug(
          `Invalidated ${totalDeleted} key(s) matching "${pattern}"`,
        );
      }
    } catch (error: any) {
      this.logger.error(
        `Cache invalidatePattern error for "${pattern}": ${error.message}`,
      );
    }
  }
}
