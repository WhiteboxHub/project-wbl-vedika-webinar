import { IsString, IsOptional, IsDate, IsInt, IsEnum, Min, Max, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { UpdateSessionRequest, SessionStatus } from '@webinar/shared';

export class UpdateSessionDto implements UpdateSessionRequest {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  scheduledAt?: Date;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  maxAttendees?: number;

  @IsOptional()
  @IsEnum(SessionStatus)
  status?: SessionStatus;
}
