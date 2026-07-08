import { Controller, Post, Body, UseGuards, Param, Get } from '@nestjs/common';
import { JoinService } from './join.service';
import { JoinRequestDto } from './dto/join-request.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '@webinar/shared';
import { IsString, IsOptional, IsEmail } from 'class-validator';

class HostTokenDto {
  @IsString()
  sessionId: string;
}

class DiagnosticsDto {
  @IsOptional()
  @IsString()
  participantId?: string;
}

class JoinBySlugDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

class RegisterBySlugDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

@Controller('join')
export class JoinController {
  constructor(private readonly joinService: JoinService) {}

  @Post('token')
  async requestJoinToken(@Body() dto: JoinRequestDto) {
    return await this.joinService.requestJoin(dto.inviteToken, dto.userName);
  }

  @Post('host-token')
  @UseGuards(JwtAuthGuard)
  async requestHostToken(@Body() dto: HostTokenDto, @CurrentUser() user: AuthUser) {
    const { grant } = await this.joinService.issueInstructorToken(
      dto.sessionId,
      user.id,
      user.name,
    );
    return {
      ...grant,
      livekitToken: grant.livekitToken ?? '',
      roomName: grant.roomId,
    };
  }

  // ─── Slug-based endpoints (permanent URLs) ──────────────────────────────────

  @Get('resolve-slug/:slug')
  async resolveBySlug(@Param('slug') slug: string) {
    return await this.joinService.resolveBySlug(slug);
  }

  @Post('slug/:slug')
  async joinBySlug(@Param('slug') slug: string, @Body() dto: JoinBySlugDto) {
    return await this.joinService.joinBySlug(slug, dto.name, dto.email);
  }

  @Post('register-slug/:slug')
  async registerBySlug(@Param('slug') slug: string, @Body() dto: RegisterBySlugDto) {
    return await this.joinService.registerBySlug(slug, dto.name, dto.email);
  }

  // ─── Legacy endpoints ────────────────────────────────────────────────────────

  @Get('ice-servers')
  getPublicIceServers() {
    return this.joinService.getDiagnosticIceServers();
  }

  @Post('diagnostics/ice-servers')
  getIceServers(@Body() dto: DiagnosticsDto) {
    const participantId = dto.participantId ?? 'diagnostic';
    return this.joinService.getIceServersForParticipant(participantId);
  }

  @Post('register/:sessionId')
  async registerForSession(
    @Param('sessionId') sessionId: string,
    @Body() body: RegisterDto,
  ) {
    return await this.joinService.registerForSession(
      sessionId,
      body.name.trim(),
      body.email.trim().toLowerCase(),
    );
  }
}
