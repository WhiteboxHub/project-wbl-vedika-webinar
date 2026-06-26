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
import { ParticipantsService } from './participants.service';
import { ModerationService } from './moderation.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '@webinar/shared';
import { UpdateParticipantRoleDto, SetAudioApprovalDto, MuteParticipantDto } from './dto/participants.dto';

@Controller('classes/:sessionId/participants')
@UseGuards(JwtAuthGuard)
export class ParticipantsController {
  constructor(
    private readonly participants: ParticipantsService,
    private readonly moderation: ModerationService,
  ) {}

  @Get()
  async list(@Param('sessionId') sessionId: string) {
    return this.participants.getParticipants(sessionId);
  }

  @Patch(':userId/role')
  async promote(
    @Param('sessionId') sessionId: string,
    @Param('userId') userId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateParticipantRoleDto,
  ) {
    const updated = await this.participants.promoteRole(sessionId, user.id, userId, dto.role);
    await this.moderation.broadcastRoleChanged(sessionId, updated);
    return updated;
  }

  @Post(':identity/mute')
  @HttpCode(HttpStatus.NO_CONTENT)
  async mute(
    @Param('sessionId') sessionId: string,
    @Param('identity') identity: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: MuteParticipantDto,
  ) {
    await this.participants.assertCanModerate(sessionId, user.id);
    await this.moderation.muteParticipant(sessionId, identity, dto.trackSid, dto.muted ?? true);
  }

  @Delete(':identity')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('sessionId') sessionId: string,
    @Param('identity') identity: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.participants.assertCanModerate(sessionId, user.id);
    await this.moderation.removeParticipant(sessionId, identity);
  }

  @Patch(':userId/audio-approval')
  async setAudioApproval(
    @Param('sessionId') sessionId: string,
    @Param('userId') userId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: SetAudioApprovalDto,
  ) {
    await this.participants.assertCanModerate(sessionId, user.id);
    const updated = await this.participants.setAudioApproved(sessionId, userId, dto.approved);
    await this.moderation.broadcastAudioApproval(sessionId, userId, dto.approved);
    return updated;
  }
}
