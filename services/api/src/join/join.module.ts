import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JoinService } from './join.service';
import { JoinController } from './join.controller';
import { UserEntity } from '../database/entities/user.entity';
import { AttendanceEntity } from '../database/entities/attendance.entity';
import { InvitesModule } from '../invites/invites.module';
import { LiveKitModule } from '../livekit/livekit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity, AttendanceEntity]),
    InvitesModule,
    LiveKitModule,
  ],
  controllers: [JoinController],
  providers: [JoinService],
  exports: [JoinService],
})
export class JoinModule {}
