import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailVerificationEntity } from '../database/entities/email-verification.entity';
import { UserEntity } from '../database/entities/user.entity';
import { EmailService } from './email.service';
import { EmailController } from './email.controller';

@Module({
  imports: [TypeOrmModule.forFeature([EmailVerificationEntity, UserEntity])],
  controllers: [EmailController],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
