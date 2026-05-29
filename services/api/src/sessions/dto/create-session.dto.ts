import { IsString, IsOptional, IsDate, IsInt, Min, Max, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateSessionRequest } from '@webinar/shared';

export class CreateSessionDto implements CreateSessionRequest {
  @IsString()
  @MaxLength(255)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsDate()
  @Type(() => Date)
  scheduledAt: Date;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  maxAttendees?: number;
}
