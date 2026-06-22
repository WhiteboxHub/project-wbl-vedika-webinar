import { IsEnum, IsBoolean, IsOptional } from 'class-validator';
import { SessionRole } from '@webinar/shared';

export class UpdateParticipantRoleDto {
  @IsEnum(SessionRole)
  role: SessionRole;
}

export class SetAudioApprovalDto {
  @IsBoolean()
  approved: boolean;
}

export class MuteParticipantDto {
  trackSid: string;

  @IsOptional()
  @IsBoolean()
  muted?: boolean = true;
}
