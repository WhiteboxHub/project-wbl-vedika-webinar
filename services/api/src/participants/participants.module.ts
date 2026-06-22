import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SessionParticipantEntity } from '../database/entities/session-participant.entity';
import { SessionEntity } from '../database/entities/session.entity';
import { ParticipantsService } from './participants.service';
import { ParticipantsController } from './participants.controller';
import { ModerationService } from './moderation.service';
import { LiveKitModule } from '../livekit/livekit.module';
import { SignalModule } from '../signal/signal.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SessionParticipantEntity, SessionEntity]),
    LiveKitModule,
    forwardRef(() => SignalModule),
  ],
  controllers: [ParticipantsController],
  providers: [ParticipantsService, ModerationService],
  exports: [ParticipantsService, ModerationService],
})
export class ParticipantsModule {}
