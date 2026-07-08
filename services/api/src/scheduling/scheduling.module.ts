import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { SessionEntity } from '../database/entities/session.entity';
import { SchedulingService } from './scheduling.service';
import { SchedulingController } from './scheduling.controller';
import { AutoStartProcessor } from './auto-start.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([SessionEntity]),
    BullModule.registerQueue({ name: 'scheduling' }),
  ],
  controllers: [SchedulingController],
  providers: [SchedulingService, AutoStartProcessor],
  exports: [SchedulingService],
})
export class SchedulingModule {}
