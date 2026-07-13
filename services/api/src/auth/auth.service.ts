import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../database/entities/user.entity';
import { EmailService } from '../email/email.service';
import { UserRole, AuthUser, VerifyTokenResponse } from '@webinar/shared';

interface MagicLinkPayload {
  email: string;
  type: 'magic-link';
  exp?: number;
}

interface AccessTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {}

  async requestMagicLink(email: string): Promise<{ token: string }> {
    this.logger.log(`Magic link requested for ${email}`);

    const payload: MagicLinkPayload = {
      email: email.toLowerCase().trim(),
      type: 'magic-link',
    };

    const token = this.jwtService.sign(payload, {
      expiresIn: '15m',
    });

    const clientUrl = this.configService.get<string>('PUBLIC_APP_URL', 'http://localhost:5173');
    const verifyUrl = `${clientUrl}/login?token=${token}`;

    // ── Terminal log: clearly visible box ──────────────────────────────────────
    const line = '─'.repeat(68);
    this.logger.log('\n' + [
      `┌${line}┐`,
      `│  🔑  MAGIC LINK VERIFICATION CODE                                    │`,
      `│  To: ${email.padEnd(62)}│`,
      `│${line}  │`,
      `│  Token (paste into the verification field):                          │`,
      `│  ${token.substring(0, 64)}  │`,
      `│  ${token.substring(64).padEnd(64)}  │`,
      `│${line}  │`,
      `│  Or open this URL directly:                                          │`,
      `│  ${verifyUrl.substring(0, 64).padEnd(64)}  │`,
      `└${line}┘`,
    ].join('\n'));

    // ── Send actual email (Mailpit in dev, real SMTP in prod) ──────────────────
    try {
      await this.emailService.sendMagicLinkEmail(email, token, verifyUrl);
    } catch (err: any) {
      this.logger.warn(`Could not send magic link email: ${err.message}. Token is logged above.`);
    }

    return { token };
  }

  async login(email: string, password: string): Promise<{ accessToken: string; user: AuthUser }> {
    // GAP-03 / GAP-16: Password login is an instructor-only escape hatch.
    // It must be explicitly enabled via ADMIN_LOGIN_ENABLED=true and must use
    // non-default credentials. In production without this flag, login is rejected.
    const loginEnabled = this.configService.get<string>('ADMIN_LOGIN_ENABLED', 'false') === 'true';
    if (!loginEnabled) {
      throw new UnauthorizedException('Password login is disabled. Use magic-link authentication.');
    }

    const adminEmail = this.configService.get<string>('ADMIN_EMAIL', '');
    const adminPassword = this.configService.get<string>('ADMIN_PASSWORD', '');

    // GAP-03: Refuse to authenticate with default/empty credentials.
    if (
      !adminEmail || !adminPassword ||
      adminEmail === 'admin@webinar.local' ||
      adminPassword === 'webinar123'
    ) {
      throw new UnauthorizedException('Default admin credentials are not permitted. Set ADMIN_EMAIL and ADMIN_PASSWORD in your .env.');
    }

    if (email.toLowerCase().trim() !== adminEmail.toLowerCase() || password !== adminPassword) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Find or create the admin user
    let user = await this.userRepository.findOne({ where: { email: adminEmail } });
    if (!user) {
      user = this.userRepository.create({
        email: adminEmail,
        name: 'Admin Organizer',
        role: UserRole.INSTRUCTOR,
      });
      await this.userRepository.save(user);
    }

    const accessToken = this.generateAccessToken(user);
    return {
      accessToken,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    };
  }

  async verifyMagicLinkToken(token: string): Promise<VerifyTokenResponse> {
    try {
      const payload = this.jwtService.verify<MagicLinkPayload>(token);

      if (payload.type !== 'magic-link') {
        throw new UnauthorizedException('Invalid token type');
      }

      const email = payload.email;

      // Determine role:
      // 1. If ADMIN_EMAIL is set and matches → always INSTRUCTOR
      // 2. If ADMIN_EMAIL is not set and we're in dev (non-production) → grant
      //    INSTRUCTOR to any magic-link user (organizer is the only one who
      //    knows the /login URL; attendees use /w/:slug instead)
      // 3. Otherwise → ATTENDEE
      const adminEmail = this.configService.get<string>('ADMIN_EMAIL', '').toLowerCase().trim();
      const isDev = this.configService.get<string>('NODE_ENV', 'production') !== 'production';
      const isInstructor = (adminEmail && email.toLowerCase() === adminEmail) ||
                           (!adminEmail && isDev);

      let user = await this.userRepository.findOne({
        where: { email },
      });

      if (!user) {
        user = this.userRepository.create({
          email,
          name: this.extractNameFromEmail(email),
          role: isInstructor ? UserRole.INSTRUCTOR : UserRole.ATTENDEE,
        });
        await this.userRepository.save(user);
        this.logger.log(`Created new user: ${email} (role: ${user.role})`);
      } else if (isInstructor && user.role !== UserRole.INSTRUCTOR) {
        // Upgrade existing user to instructor if they are the configured admin
        user.role = UserRole.INSTRUCTOR;
        await this.userRepository.save(user);
        this.logger.log(`Upgraded ${email} to INSTRUCTOR role`);
      }

      const accessToken = this.generateAccessToken(user);

      const authUser: AuthUser = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      };

      return {
        accessToken,
        user: authUser,
      };
    } catch (error) {
      this.logger.error('Failed to verify magic link token', error);
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  async validateUser(userId: string): Promise<UserEntity> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
  }

  private generateAccessToken(user: UserEntity): string {
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    return this.jwtService.sign(payload, {
      expiresIn: '24h',
    });
  }

  private extractNameFromEmail(email: string): string {
    const localPart = email.split('@')[0];
    const name = localPart
      .split(/[._-]/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
    return name;
  }
}
