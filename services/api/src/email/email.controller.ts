import { Controller, Get, Post, Body, Query, BadRequestException } from '@nestjs/common';
import { EmailService } from './email.service';

@Controller('auth/email')
export class EmailController {
  constructor(private readonly email: EmailService) {}

  @Get('verify')
  async verify(@Query('token') token: string) {
    if (!token) throw new BadRequestException('Token required');
    try {
      const result = await this.email.verifyEmailToken(token);
      return {
        verified: true,
        userId: result.userId,
        name: result.name,
        email: result.email,
      };
    } catch {
      throw new BadRequestException('Invalid or expired token');
    }
  }
}
