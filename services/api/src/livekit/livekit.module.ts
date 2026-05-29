import { Module } from '@nestjs/common';
import { EgressService } from './egress.service';
import { TokenService } from './token.service';

@Module({
  providers: [EgressService, TokenService],
  exports: [EgressService, TokenService],
})
export class LiveKitModule {}
