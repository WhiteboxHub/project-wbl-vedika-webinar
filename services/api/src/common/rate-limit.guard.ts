import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';

export const RATE_LIMIT_KEY = 'rate_limit';

export interface RateLimitOptions {
  /** Max requests in the window */
  limit: number;
  /** Window size in seconds */
  windowSeconds: number;
}

/**
 * GAP-17: IP-based rate limiter using Redis sliding window.
 * Apply with @UseGuards(RateLimitGuard) and @SetMetadata(RATE_LIMIT_KEY, options)
 * on any sensitive HTTP endpoint (auth, join, register).
 *
 * Uses @nestjs/common built-ins only — no new package dependency needed.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);
  private readonly redis: Redis;

  constructor(
    private readonly reflector: Reflector,
    configService: ConfigService,
  ) {
    const rawUrl = configService.get<string>('REDIS_URL', 'redis://localhost:6379');
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      parsedUrl = new URL('redis://localhost:6379');
    }
    this.redis = new Redis({
      host: parsedUrl.hostname || 'localhost',
      port: parseInt(parsedUrl.port || '6379', 10),
      password: parsedUrl.password ? decodeURIComponent(parsedUrl.password) : undefined,
      tls: parsedUrl.protocol === 'rediss:' ? {} : undefined,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    this.redis.connect().catch((err) =>
      this.logger.warn(`RateLimitGuard Redis connect failed: ${err.message}`),
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No rate-limit metadata → allow by default
    if (!options) return true;

    const req = context.switchToHttp().getRequest();
    const ip: string =
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      'unknown';

    const key = `rate:${req.url}:${ip}`;

    try {
      const pipeline = this.redis.pipeline();
      pipeline.incr(key);
      pipeline.expire(key, options.windowSeconds);
      const results = await pipeline.exec();
      const count = results?.[0]?.[1] as number;

      if (count > options.limit) {
        this.logger.warn(`Rate limit hit for IP ${ip} on ${req.url} (${count}/${options.limit})`);
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: `Too many requests. Please wait ${options.windowSeconds} seconds before trying again.`,
            retryAfter: options.windowSeconds,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      return true;
    } catch (err) {
      if (err instanceof HttpException) throw err;
      // Redis unavailable → fail open (allow the request) to avoid blocking users
      this.logger.error(`Rate limit Redis error: ${err.message}`);
      return true;
    }
  }
}
