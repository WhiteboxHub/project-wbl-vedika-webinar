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

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      services,
    };
  }
}
