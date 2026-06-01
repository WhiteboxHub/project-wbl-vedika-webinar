import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '@webinar/shared';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { TokenService } from '../livekit/token.service';
import { IsString } from 'class-validator';

class MuteParticipantDto {
  @IsString() trackSid: string;
  muted: boolean;
}

@Controller('classes')
@UseGuards(JwtAuthGuard)
export class SessionsController {
  constructor(
    private readonly sessionsService: SessionsService,
    private readonly tokenService: TokenService,
  ) {}

  @Post()
  async createSession(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateSessionDto,
  ) {
    return await this.sessionsService.createSession(user.id, dto);
  }

  @Get(':id')
  async getSession(@Param('id') id: string) {
    return await this.sessionsService.getSession(id);
  }

  @Get()
  async listSessions(@CurrentUser() user: AuthUser) {
    return await this.sessionsService.listInstructorSessions(user.id);
  }

  @Patch(':id')
  async updateSession(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateSessionDto,
  ) {
    return await this.sessionsService.updateSession(id, user.id, dto);
  }

  @Delete(':id')
  async deleteSession(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return await this.sessionsService.deleteSession(id, user.id);
  }

  @Post(':id/start')
  async startSession(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return await this.sessionsService.startSession(id, user.id);
  }

  @Post(':id/end')
  async endSession(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return await this.sessionsService.endSession(id, user.id);
  }

  @Post(':id/participants/:identity/mute')
  @HttpCode(HttpStatus.NO_CONTENT)
  async muteParticipant(
    @Param('id') sessionId: string,
    @Param('identity') identity: string,
    @Body() dto: MuteParticipantDto,
  ) {
    const session = await this.sessionsService.getSession(sessionId);
    const roomClient = this.tokenService.getRoomServiceClient();
    await roomClient.mutePublishedTrack(session.liveKitRoomName, identity, dto.trackSid, dto.muted);
  }

  @Delete(':id/participants/:identity')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeParticipant(
    @Param('id') sessionId: string,
    @Param('identity') identity: string,
  ) {
    const session = await this.sessionsService.getSession(sessionId);
    const roomClient = this.tokenService.getRoomServiceClient();
    await roomClient.removeParticipant(session.liveKitRoomName, identity);
  }
}
