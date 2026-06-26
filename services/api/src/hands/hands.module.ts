import { Module } from '@nestjs/common';
import { HandsService } from './hands.service';

@Module({
  providers: [HandsService],
  exports: [HandsService],
})
export class HandsModule {}
