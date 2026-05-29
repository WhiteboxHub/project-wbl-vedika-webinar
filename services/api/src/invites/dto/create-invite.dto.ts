import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { CreateInviteRequest } from '@webinar/shared';

export class CreateInviteDto implements Omit<CreateInviteRequest, 'sessionId'> {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(168) // Max 1 week
  expiresInHours?: number;
}
