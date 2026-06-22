import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { QaSocketService } from './qa-socket.service';
import { SignalModule } from '../signal/signal.module';

@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (cs: ConfigService) => ({
        secret: cs.get<string>('JWT_SECRET', 'dev-secret-change-me'),
      }),
      inject: [ConfigService],
    }),
    forwardRef(() => SignalModule),
  ],
  providers: [QaSocketService],
  exports: [QaSocketService],
})
export class QaModule {}
