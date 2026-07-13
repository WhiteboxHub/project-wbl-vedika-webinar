import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthCheck } from '@webinar/shared';
import { createClient } from 'redis';
import { Pool } from 'pg';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly configService: ConfigService) {}

  async check(): Promise<HealthCheck> {
    const services: HealthCheck['services'] = {};
    let overallStatus: 'ok' | 'error' = 'ok';

    // Check database
    try {
      const pool = new Pool({
        connectionString: this.configService.get('DATABASE_URL'),
      });
      await pool.query('SELECT 1');
      await pool.end();
      services.database = 'ok';
    } catch (error) {
      this.logger.error('Database health check failed', error);
      services.database = 'error';
      overallStatus = 'error';
    }

    // Check Redis
    try {
      const redis = createClient({
        url: this.configService.get('REDIS_URL'),
      });
      await redis.connect();
      await redis.ping();
      await redis.disconnect();
      services.redis = 'ok';
    } catch (error) {
      this.logger.error('Redis health check failed', error);
      services.redis = 'error';
      overallStatus = 'error';
    }

    // GAP-18: Check LiveKit SFU availability
    // Non-critical: LiveKit unavailable should not mark the API as fully down.
    try {
      const livekitUrl = this.configService.get<string>('LIVEKIT_URL', 'ws://localhost:7880');
      const httpUrl = livekitUrl.replace(/^ws(s?):\/\//, 'http$1://');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${httpUrl}/rtc/validate`, { signal: controller.signal }).catch(() => null);
      clearTimeout(timeout);
      // LiveKit returns various codes depending on version; any sub-500 means server is alive.
      services.livekit = (res && res.status < 500) ? 'ok' : 'error';
    } catch {
      services.livekit = 'error';
      this.logger.warn('LiveKit health check failed (non-critical)');
    }

    // GAP-18: Check MinIO object storage availability
    try {
      const minioUrl = this.configService.get<string>('MINIO_ENDPOINT', 'http://localhost:9000');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${minioUrl}/minio/health/live`, { signal: controller.signal }).catch(() => null);
      clearTimeout(timeout);
      services.storage = (res && res.status < 500) ? 'ok' : 'error';
    } catch {
      services.storage = 'error';
      this.logger.warn('MinIO health check failed (non-critical)');
    }

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      services,
    };
  }
}
