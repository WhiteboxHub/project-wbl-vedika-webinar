import { IsString, MinLength, MaxLength } from 'class-validator';

export class JoinRequestDto {
  @IsString()
  inviteToken: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  userName: string;
}
