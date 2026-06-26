import { IsString } from 'class-validator';
import { ResolveInviteRequest } from '@webinar/shared';

export class ResolveInviteDto implements ResolveInviteRequest {
  @IsString()
  token: string;
}
