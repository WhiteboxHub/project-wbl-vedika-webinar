import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { SessionsModule } from './sessions/sessions.module';
import { InvitesModule } from './invites/invites.module';
import { JoinModule } from './join/join.module';
import { HealthModule } from './health/health.module';
import { RecordingModule } from './recording/recording.module';
import { SignalModule } from './signal/signal.module';
import { ParticipantsModule } from './participants/participants.module';
import { HandsModule } from './hands/hands.module';
import { EmailModule } from './email/email.module';
import { SchedulingModule } from './scheduling/scheduling.module';
import { CacheModule } from './cache/cache.module';

@Module({
  imports: [
    ConfigModule,
    CacheModule,
    DatabaseModule,
    AuthModule,
    SessionsModule,
    InvitesModule,
    JoinModule,
    ParticipantsModule,
    HandsModule,
    EmailModule,
    SchedulingModule,
    BullModule.forRootAsync({
      imports: [NestConfigModule],
      useFactory: async (configService: ConfigService) => {
        const rawUrl = configService.get('REDIS_URL', 'redis://localhost:6379');
        // GAP-07: Parse the Redis URL properly instead of fragile string replace.
        // Supports redis://, rediss://, and authenticated redis://:pass@host:port URLs.
        let parsedUrl: URL;
        try {
          parsedUrl = new URL(rawUrl);
        } catch {
          parsedUrl = new URL('redis://localhost:6379');
        }
        const redisConfig: Record<string, unknown> = {
          host: parsedUrl.hostname || 'localhost',
          port: parseInt(parsedUrl.port || '6379', 10),
          tls: parsedUrl.protocol === 'rediss:' ? {} : undefined,
        };
        if (parsedUrl.password) {
          redisConfig.password = decodeURIComponent(parsedUrl.password);
        }
        return { redis: redisConfig };
      },
      inject: [ConfigService],
    }),
    HealthModule,
    RecordingModule,
    SignalModule,
  ],
})
export class AppModule {}
