import { Controller, Post, Body, Param, UseGuards } from '@nestjs/common';
import { InvitesService } from './invites.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateInviteDto } from './dto/create-invite.dto';
import { ResolveInviteDto } from './dto/resolve-invite.dto';

@Controller()
export class InvitesController {
  constructor(private readonly invitesService: InvitesService) {}

  @Post('classes/:id/invites')
  @UseGuards(JwtAuthGuard)
  async createInvite(
    @Param('id') sessionId: string,
    @Body() dto: CreateInviteDto,
  ) {
    return await this.invitesService.createInvite(
      sessionId,
      dto.expiresInHours,
    );
  }

  @Post('join/resolve')
  async resolveInvite(@Body() dto: ResolveInviteDto) {
    return await this.invitesService.resolveInvite(dto.token);
  }
}
