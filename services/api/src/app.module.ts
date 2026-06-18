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

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    AuthModule,
    SessionsModule,
    InvitesModule,
    JoinModule,
    BullModule.forRootAsync({
      imports: [NestConfigModule],
      useFactory: async (configService: ConfigService) => ({
        redis: {
          host: configService.get('REDIS_URL', 'redis://localhost:6379').replace('redis://', ''),
          port: 6379,
        },
      }),
      inject: [ConfigService],
    }),
    HealthModule,
    RecordingModule,
    SignalModule,
  ],
})
export class AppModule {}
