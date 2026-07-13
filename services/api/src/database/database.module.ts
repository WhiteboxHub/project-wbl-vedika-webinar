import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { RecordingEntity } from './entities/recording.entity';
import { AuditLogEntity } from './entities/audit-log.entity';
import { UserEntity } from './entities/user.entity';
import { SessionEntity } from './entities/session.entity';
import { InviteEntity } from './entities/invite.entity';
import { AttendanceEntity } from './entities/attendance.entity';
import { ChatMessageEntity } from './entities/chat-message.entity';
import { PollEntity } from './entities/poll.entity';
import { PollOptionEntity } from './entities/poll-option.entity';
import { PollVoteEntity } from './entities/poll-vote.entity';
import { QuestionEntity } from './entities/question.entity';
import { WaitingRoomEntryEntity } from './entities/waiting-room-entry.entity';
import { SessionParticipantEntity } from './entities/session-participant.entity';
import { EmailVerificationEntity } from './entities/email-verification.entity';
import { AuditService } from './audit.service';

const ALL_ENTITIES = [
  RecordingEntity,
  AuditLogEntity,
  UserEntity,
  SessionEntity,
  InviteEntity,
  AttendanceEntity,
  ChatMessageEntity,
  PollEntity,
  PollOptionEntity,
  PollVoteEntity,
  QuestionEntity,
  WaitingRoomEntryEntity,
  SessionParticipantEntity,
  EmailVerificationEntity,
];

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const isProduction = configService.get('NODE_ENV') === 'production';

        // GAP-03: Guard dangerous defaults in production environments.
        if (isProduction) {
          const jwtSecret = configService.get('JWT_SECRET', '');
          if (!jwtSecret || jwtSecret === 'your-secret-key-change-in-production' || jwtSecret === 'dev-secret-change-me') {
            throw new Error('FATAL: JWT_SECRET must be set to a secure value in production. Refusing to start.');
          }
        }

        return {
          type: 'postgres',
          url: configService.get('DATABASE_URL'),
          entities: ALL_ENTITIES,
          // GAP-02: Never auto-synchronize in any environment — rely on SQL migrations.
          // Auto-sync can silently DROP columns when entities change, corrupting data.
          synchronize: false,
          namingStrategy: new SnakeNamingStrategy(),
          logging: configService.get('LOG_LEVEL') === 'debug',
        };
      },
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature(ALL_ENTITIES),
  ],
  providers: [AuditService],
  exports: [TypeOrmModule, AuditService],
})
export class DatabaseModule {}
