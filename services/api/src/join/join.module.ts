import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JoinService } from './join.service';
import { JoinController } from './join.controller';
import { UserEntity } from '../database/entities/user.entity';
import { AttendanceEntity } from '../database/entities/attendance.entity';
import { SessionEntity } from '../database/entities/session.entity';
import { InvitesModule } from '../invites/invites.module';
import { LiveKitModule } from '../livekit/livekit.module';
import { ParticipantsModule } from '../participants/participants.module';
import { EmailModule } from '../email/email.module';
import { RateLimitGuard } from '../common/rate-limit.guard';

import { IceService } from './ice.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity, AttendanceEntity, SessionEntity]),
    InvitesModule,
    LiveKitModule,
    ParticipantsModule,
    EmailModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (cs: ConfigService) => ({
        secret: cs.get<string>('JWT_SECRET', 'dev-secret-change-me'),
        signOptions: { expiresIn: '6h' },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [JoinController],
  providers: [JoinService, IceService, RateLimitGuard],
  exports: [JoinService, IceService],
})
export class JoinModule {}
