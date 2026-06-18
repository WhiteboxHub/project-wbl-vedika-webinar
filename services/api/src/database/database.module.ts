import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
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
];

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.get('DATABASE_URL'),
        entities: ALL_ENTITIES,
        synchronize: configService.get('NODE_ENV') === 'development',
        logging: configService.get('LOG_LEVEL') === 'debug',
      }),
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature(ALL_ENTITIES),
  ],
  providers: [AuditService],
  exports: [TypeOrmModule, AuditService],
})
export class DatabaseModule {}
