import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SessionsService } from './sessions.service';
import { SessionsController } from './sessions.controller';
import { SessionEntity } from '../database/entities/session.entity';
import { AuthModule } from '../auth/auth.module';
import { LiveKitModule } from '../livekit/livekit.module';
import { SignalModule } from '../signal/signal.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SessionEntity]),
    AuthModule,
    LiveKitModule,
    // SignalModule provides SignalService.broadcast() so endSession can notify clients
    SignalModule,
  ],
  controllers: [SessionsController],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
