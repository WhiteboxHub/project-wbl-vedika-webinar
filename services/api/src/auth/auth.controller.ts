import { Controller, Post, Get, Body, HttpCode, HttpStatus, UseGuards, SetMetadata } from '@nestjs/common';
import { AuthService } from './auth.service';
import { MagicLinkRequestDto } from './dto/magic-link.dto';
import { VerifyTokenDto } from './dto/verify-token.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';
import {
  ApiResponse,
  MagicLinkResponse,
  VerifyTokenResponse,
  AuthUser,
} from '@webinar/shared';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { RateLimitGuard, RATE_LIMIT_KEY } from '../common/rate-limit.guard';

class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  password: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    return await this.authService.login(dto.email, dto.password);
  }

  @Post('magic-link')
  @HttpCode(HttpStatus.OK)
  // GAP-17: Rate limit to 5 requests per IP per 60 seconds to prevent SMTP abuse & email enumeration
  @UseGuards(RateLimitGuard)
  @SetMetadata(RATE_LIMIT_KEY, { limit: 5, windowSeconds: 60 })
  async requestMagicLink(
    @Body() dto: MagicLinkRequestDto,
  ): Promise<ApiResponse<MagicLinkResponse>> {
    const { token } = await this.authService.requestMagicLink(dto.email);

    // In development (no SMTP), expose the token in the response so the UI
    // can show it directly — avoids digging through server logs.
    const smtpHost = process.env.SMTP_HOST;
    const isDev = !smtpHost && process.env.NODE_ENV !== 'production';

    return {
      success: true,
      data: {
        success: true,
        message: isDev
          ? `Dev mode — copy your token: ${token}`
          : 'Magic link sent to your email address.',
        ...(isDev ? { devToken: token } : {}),
      } as MagicLinkResponse,
    };
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  // GAP-17: Rate limit to 10 verify attempts per IP per 60 seconds
  @UseGuards(RateLimitGuard)
  @SetMetadata(RATE_LIMIT_KEY, { limit: 10, windowSeconds: 60 })
  async verifyToken(@Body() dto: VerifyTokenDto): Promise<ApiResponse<VerifyTokenResponse>> {
    const result = await this.authService.verifyMagicLinkToken(dto.token);

    return {
      success: true,
      data: result,
    };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getCurrentUser(@CurrentUser() user: AuthUser): Promise<ApiResponse<AuthUser>> {
    return {
      success: true,
      data: user,
    };
  }
}
