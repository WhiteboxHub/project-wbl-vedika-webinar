import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { IsDateString, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { SchedulingService } from './scheduling.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SessionEntity } from '../database/entities/session.entity';

// ── DTOs ────────────────────────────────────────────────────────────────────

export class RescheduleSessionDto {
  @IsDateString()
  scheduledStartAt: string;

  @IsOptional()
  @IsDateString()
  scheduledEndAt?: string;
}

export class CalendarQueryDto {
  @IsDateString()
  from: string;

  @IsDateString()
  to: string;
}

// ── Controller ──────────────────────────────────────────────────────────────

@Controller('schedule')
@UseGuards(JwtAuthGuard)
export class SchedulingController {
  constructor(private readonly schedulingService: SchedulingService) {}

  /**
   * GET /schedule
   * Returns all upcoming sessions (status=scheduled, scheduledAt > now).
   */
  @Get()
  async getUpcomingSessions(): Promise<SessionEntity[]> {
    return this.schedulingService.getUpcomingSessions();
  }

  /**
   * GET /schedule/calendar?from=...&to=...
   * Returns all sessions within the given date range for a calendar view.
   */
  @Get('calendar')
  async getScheduleCalendar(
    @Query() query: CalendarQueryDto,
  ): Promise<SessionEntity[]> {
    const from = new Date(query.from);
    const to = new Date(query.to);
    return this.schedulingService.getScheduleCalendar(from, to);
  }

  /**
   * PATCH /schedule/:id/reschedule
   * Updates the scheduled start (and optionally end) time for a session.
   */
  @Patch(':id/reschedule')
  async rescheduleSession(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RescheduleSessionDto,
  ): Promise<SessionEntity> {
    const newStartAt = new Date(body.scheduledStartAt);
    const newEndAt = body.scheduledEndAt
      ? new Date(body.scheduledEndAt)
      : undefined;

    return this.schedulingService.rescheduleSession(id, newStartAt, newEndAt);
  }
}
