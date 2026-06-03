import { Controller, Post, Body, UseGuards, Param } from '@nestjs/common';
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
    const { token, roomName } = await this.joinService.issueInstructorToken(dto.sessionId, user.id, user.name);
    return {
      livekitToken: token,
      livekitUrl: '', // Client uses Vite proxy
      roomName,
      sessionId: dto.sessionId,
    };
  }

  @Post('register/:sessionId')
  async registerForSession(
    @Param('sessionId') sessionId: string,
    @Body() body: { name: string; email: string },
  ) {
    return await this.joinService.registerForSession(sessionId, body.name, body.email);
  }
}
