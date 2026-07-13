import { IsString, IsOptional, IsDate, IsInt, Min, Max, MaxLength, IsBoolean } from 'class-validator';
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

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  scheduledStartAt?: Date;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  scheduledEndAt?: Date;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  duration?: number;

  @IsOptional()
  @IsBoolean()
  autoStart?: boolean;
}
