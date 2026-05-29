import { Controller, Post, Body } from '@nestjs/common';
import { JoinService } from './join.service';
import { JoinRequestDto } from './dto/join-request.dto';

@Controller('join')
export class JoinController {
  constructor(private readonly joinService: JoinService) {}

  @Post('token')
  async requestJoinToken(@Body() dto: JoinRequestDto) {
    return await this.joinService.requestJoin(dto.inviteToken, dto.userName);
  }
}
