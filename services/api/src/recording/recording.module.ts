import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RecordingController } from './recording.controller';
import { RecordingService } from './recording.service';
import { SessionEntity } from '../database/entities/session.entity';
import { DatabaseModule } from '../database/database.module';
import { LiveKitModule } from '../livekit/livekit.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'recording',
    }),
    TypeOrmModule.forFeature([SessionEntity]),
    DatabaseModule,
    LiveKitModule,
  ],
  controllers: [RecordingController],
  providers: [RecordingService],
  exports: [RecordingService],
})
export class RecordingModule {}
