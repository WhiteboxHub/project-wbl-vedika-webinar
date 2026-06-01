import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { JoinService } from './join.service';
import { JoinRequestDto } from './dto/join-request.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '@webinar/shared';
import { IsString } from 'class-validator';

class HostTokenDto {
  @IsString()
  sessionId: string;
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
    const token = await this.joinService.issueInstructorToken(dto.sessionId, user.id, user.name);
    const roomName = `session_${dto.sessionId}`;
    return {
      livekitToken: token,
      livekitUrl: process.env.LIVEKIT_URL || 'ws://localhost:7880',
      roomName,
      sessionId: dto.sessionId,
    };
  }
}
