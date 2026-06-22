import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmailVerificationEntity } from '../database/entities/email-verification.entity';
import { UserEntity } from '../database/entities/user.entity';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(EmailVerificationEntity)
    private readonly verificationRepo: Repository<EmailVerificationEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {}

  /** Send email verification link (logs in dev when SMTP not configured) */
  async sendVerificationEmail(userId: string, email: string): Promise<void> {
    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.verificationRepo.save(
      this.verificationRepo.create({ userId, tokenHash, expiresAt }),
    );

    const baseUrl = this.config.get<string>('PUBLIC_APP_URL', 'http://localhost:5173');
    const link = `${baseUrl}/verify-email?token=${token}`;

    // TODO: integrate SendGrid/SES via BullMQ worker
    this.logger.log(JSON.stringify({
      event: 'email.verification',
      to: email,
      link,
      message: 'Verification email (dev: logged only)',
    }));
  }

  async verifyEmailToken(token: string): Promise<{ userId: string }> {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const row = await this.verificationRepo.findOne({
      where: { tokenHash },
      order: { createdAt: 'DESC' },
    });
    if (!row || row.verifiedAt || row.expiresAt < new Date()) {
      throw new Error('Invalid or expired verification token');
    }
    row.verifiedAt = new Date();
    await this.verificationRepo.save(row);
    await this.userRepo.update(row.userId, { emailVerified: true });
    return { userId: row.userId };
  }

  /** Registration confirmation for webinar signup */
  async sendRegistrationConfirmation(
    sessionId: string,
    userId: string,
    email: string,
    sessionTitle: string,
    joinUrl: string,
  ): Promise<void> {
    this.logger.log(JSON.stringify({
      event: 'email.registration_confirmation',
      sessionId,
      userId,
      to: email,
      sessionTitle,
      joinUrl,
      message: 'Registration confirmation (dev: logged only)',
    }));
  }
}
