import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { EmailVerificationEntity } from '../database/entities/email-verification.entity';
import { UserEntity } from '../database/entities/user.entity';

export interface RegistrationEmailContext {
  attendeeName: string;
  sessionTitle: string;
  scheduledAt: Date;
  instructorName?: string;
  joinUrl: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;
  private readonly smtpEnabled: boolean;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(EmailVerificationEntity)
    private readonly verificationRepo: Repository<EmailVerificationEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {
    const host = this.config.get<string>('SMTP_HOST', '');
    this.smtpEnabled = Boolean(host);

    if (this.smtpEnabled) {
      this.transporter = nodemailer.createTransport({
        host,
        port: this.config.get<number>('SMTP_PORT', 587),
        secure: this.config.get<string>('SMTP_SECURE', 'false') === 'true',
        auth: {
          user: this.config.get<string>('SMTP_USER', ''),
          pass: this.config.get<string>('SMTP_PASS', ''),
        },
      });
      this.logger.log('SMTP email transport configured');
    } else {
      this.logger.warn(
        'SMTP is NOT configured (SMTP_HOST missing). Emails will be logged only.',
      );
    }
  }

  private fromAddress(): string {
    return this.config.get<string>(
      'EMAIL_FROM',
      'Whitebox Learning Webinars <webinars@whiteboxlearning.com>',
    );
  }

  private async deliver(to: string, subject: string, html: string, text: string): Promise<void> {
    if (!this.transporter) {
      this.logger.log(JSON.stringify({ event: 'email.dev_log', to, subject, text }));
      return;
    }

    await this.transporter.sendMail({
      from: this.fromAddress(),
      to,
      subject,
      html,
      text,
    });
    this.logger.log(JSON.stringify({ event: 'email.sent', to, subject }));
  }

  /** Send email verification link (logs in dev when SMTP not configured) */
  async sendVerificationEmail(userId: string, email: string, slug?: string): Promise<void> {
    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.verificationRepo.save(
      this.verificationRepo.create({ userId, tokenHash, expiresAt }),
    );

    const baseUrl = this.config.get<string>('PUBLIC_APP_URL', 'http://localhost:5173');
    const link = slug
      ? `${baseUrl}/verify-email?token=${token}&slug=${slug}`
      : `${baseUrl}/verify-email?token=${token}`;

    await this.deliver(
      email,
      'Verify your email — Whitebox Learning',
      `<p>Please <a href="${link}">verify your email</a> to complete registration.</p>`,
      `Verify your email: ${link}`,
    );
  }

  /** Send magic-link sign-in email (organizer login) */
  async sendMagicLinkEmail(email: string, token: string, verifyUrl: string): Promise<void> {
    const html = `
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #1a1a2e; max-width: 600px; margin: 0 auto; padding: 24px;">
  <div style="background: linear-gradient(135deg, #2563eb, #7c3aed); padding: 24px; border-radius: 12px 12px 0 0;">
    <h1 style="color: #fff; margin: 0; font-size: 22px;">Vedika Webinar Platform</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0;">Sign-in verification code</p>
  </div>
  <div style="background: #f8f9fc; padding: 28px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
    <p>Hi,</p>
    <p>We received a sign-in request for <strong>${email}</strong>. Use the button below to sign in — this link expires in <strong>15 minutes</strong>.</p>
    <p style="text-align: center; margin: 32px 0;">
      <a href="${verifyUrl}" style="background: linear-gradient(135deg, #2563eb, #7c3aed); color: #fff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; display: inline-block; font-size: 16px;">
        ✅ Sign in to Organizer Portal
      </a>
    </p>
    <p style="font-size: 13px; color: #64748b;">Or copy your verification token and paste it into the login page:</p>
    <div style="background: #1e293b; border-radius: 8px; padding: 16px; margin: 12px 0; font-family: monospace; font-size: 12px; color: #94a3b8; word-break: break-all;">
      ${token}
    </div>
    <p style="font-size: 12px; color: #94a3b8; margin-top: 24px;">If you didn't request this, you can safely ignore this email.</p>
  </div>
</body>
</html>`;

    const text = [
      `Sign in to Vedika Webinar Platform`,
      ``,
      `Click here to sign in: ${verifyUrl}`,
      ``,
      `Or paste this token into the login page:`,
      token,
      ``,
      `This link expires in 15 minutes.`,
      `If you didn't request this, ignore this email.`,
    ].join('\n');

    await this.deliver(email, '🔑 Your sign-in link — Vedika Webinar', html, text);
  }

  async verifyEmailToken(token: string): Promise<{ userId: string; name: string; email: string }> {
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

    const user = await this.userRepo.findOne({ where: { id: row.userId } });
    return {
      userId: row.userId,
      name: user?.name ?? '',
      email: user?.email ?? '',
    };
  }

  private formatDateTime(d: Date): string {
    return d.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  }

  private buildRegistrationHtml(ctx: RegistrationEmailContext): string {
    const when = this.formatDateTime(ctx.scheduledAt);
    const host = ctx.instructorName ? ` with ${ctx.instructorName}` : '';
    return `
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #1a1a2e; max-width: 600px; margin: 0 auto; padding: 24px;">
  <div style="background: linear-gradient(135deg, #2563eb, #7c3aed); padding: 24px; border-radius: 12px 12px 0 0;">
    <h1 style="color: #fff; margin: 0; font-size: 22px;">Whitebox Learning</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0;">Webinar Registration Confirmed</p>
  </div>
  <div style="background: #f8f9fc; padding: 28px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
    <p>Hi ${ctx.attendeeName},</p>
    <p>Thank you for registering for our webinar! We're excited to have you join us.</p>
    <div style="background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
      <p style="margin: 0 0 8px; font-weight: 700; font-size: 16px;">${ctx.sessionTitle}</p>
      <p style="margin: 0; color: #64748b; font-size: 14px;">📅 ${when}${host}</p>
    </div>
    <p>Your spot is reserved. When it's time to join, use the button below:</p>
    <p style="text-align: center; margin: 28px 0;">
      <a href="${ctx.joinUrl}" style="background: #2563eb; color: #fff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; display: inline-block;">Join Webinar</a>
    </p>
    <p style="font-size: 13px; color: #64748b;">Or copy this link: <a href="${ctx.joinUrl}">${ctx.joinUrl}</a></p>
    <p style="margin-top: 24px;">See you there!<br><strong>The Whitebox Learning Team</strong></p>
  </div>
</body>
</html>`;
  }

  private buildRegistrationText(ctx: RegistrationEmailContext): string {
    const when = this.formatDateTime(ctx.scheduledAt);
    return [
      `Hi ${ctx.attendeeName},`,
      '',
      'Thank you for registering for our webinar with Whitebox Learning!',
      '',
      `Webinar: ${ctx.sessionTitle}`,
      `When: ${when}`,
      '',
      'Your spot is reserved. Join here:',
      ctx.joinUrl,
      '',
      'See you there!',
      'The Whitebox Learning Team',
    ].join('\n');
  }

  /** Registration confirmation for webinar signup */
  async sendRegistrationConfirmation(
    _sessionId: string,
    _userId: string,
    email: string,
    ctx: RegistrationEmailContext,
  ): Promise<void> {
    const subject = `You're registered — ${ctx.sessionTitle} | Whitebox Learning`;
    await this.deliver(
      email,
      subject,
      this.buildRegistrationHtml(ctx),
      this.buildRegistrationText(ctx),
    );
  }
}
