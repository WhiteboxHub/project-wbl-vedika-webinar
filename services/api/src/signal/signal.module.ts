import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SignalGateway } from './signal.gateway';
import { SignalService } from './signal.service';
import { PresenceService } from './presence.service';
import { ChatService } from './chat.service';
import { PollService } from './poll.service';
import { QAService } from './qa.service';
import { ReactionService } from './reaction.service';
import { GraceService } from './grace.service';
import { HandsModule } from '../hands/hands.module';
import { ChatMessageEntity } from '../database/entities/chat-message.entity';
import { PollEntity } from '../database/entities/poll.entity';
import { PollOptionEntity } from '../database/entities/poll-option.entity';
import { PollVoteEntity } from '../database/entities/poll-vote.entity';
import { QuestionEntity } from '../database/entities/question.entity';

@Module({
  imports: [
    HandsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (cs: ConfigService) => ({
        secret: cs.get<string>('JWT_SECRET', 'dev-secret-change-me'),
        signOptions: { expiresIn: '24h' },
      }),
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([
      ChatMessageEntity,
      PollEntity,
      PollOptionEntity,
      PollVoteEntity,
      QuestionEntity,
    ]),
  ],
  providers: [
    SignalGateway,
    SignalService,
    PresenceService,
    ChatService,
    PollService,
    QAService,
    ReactionService,
    GraceService,
  ],
  exports: [SignalGateway, SignalService, PresenceService, ChatService, PollService, QAService, GraceService],
})
export class SignalModule {}
