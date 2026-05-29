import { Controller, Post, Get, Body, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
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

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('magic-link')
  @HttpCode(HttpStatus.OK)
  async requestMagicLink(
    @Body() dto: MagicLinkRequestDto,
  ): Promise<ApiResponse<MagicLinkResponse>> {
    const { token } = await this.authService.requestMagicLink(dto.email);

    return {
      success: true,
      data: {
        success: true,
        message: 'Magic link sent to your email. For development, check server logs.',
      },
    };
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
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
