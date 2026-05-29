import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RecordingEntity } from './entities/recording.entity';
import { AuditLogEntity } from './entities/audit-log.entity';
import { UserEntity } from './entities/user.entity';
import { SessionEntity } from './entities/session.entity';
import { InviteEntity } from './entities/invite.entity';
import { AttendanceEntity } from './entities/attendance.entity';
import { AuditService } from './audit.service';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.get('DATABASE_URL'),
        entities: [RecordingEntity, AuditLogEntity, UserEntity, SessionEntity, InviteEntity, AttendanceEntity],
        synchronize: configService.get('NODE_ENV') === 'development',
        logging: configService.get('LOG_LEVEL') === 'debug',
      }),
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([RecordingEntity, AuditLogEntity, UserEntity, SessionEntity, InviteEntity, AttendanceEntity]),
  ],
  providers: [AuditService],
  exports: [TypeOrmModule, AuditService],
})
export class DatabaseModule {}
