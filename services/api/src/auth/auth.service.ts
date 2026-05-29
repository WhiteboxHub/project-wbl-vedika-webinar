import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../database/entities/user.entity';
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

    // TODO: Send email with magic link
    // For MVP, log the token
    this.logger.log(`Magic link token (DEV ONLY): ${token}`);
    this.logger.log(`Verify URL: http://localhost:3000/auth/verify?token=${token}`);

    return { token };
  }

  async verifyMagicLinkToken(token: string): Promise<VerifyTokenResponse> {
    try {
      const payload = this.jwtService.verify<MagicLinkPayload>(token);

      if (payload.type !== 'magic-link') {
        throw new UnauthorizedException('Invalid token type');
      }

      const email = payload.email;

      let user = await this.userRepository.findOne({
        where: { email },
      });

      if (!user) {
        user = this.userRepository.create({
          email,
          name: this.extractNameFromEmail(email),
          role: UserRole.ATTENDEE,
        });
        await this.userRepository.save(user);
        this.logger.log(`Created new user: ${email}`);
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
      expiresIn: '1h',
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
