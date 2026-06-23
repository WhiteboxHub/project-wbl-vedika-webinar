import {
  Controller,
  Post,
  Get,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { RecordingService } from './recording.service';
import { ApiResponse, RecordingResponse, AuthUser } from '@webinar/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('classes')
export class RecordingController {
  constructor(private readonly recordingService: RecordingService) {}

  /** Start recording — host only (JWT required) */
  @Post(':id/recording/start')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async startRecording(
    @Param('id') sessionId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<ApiResponse<RecordingResponse>> {
    const recording = await this.recordingService.startRecording(sessionId, user.id);
    return { success: true, data: recording };
  }

  /** Stop recording — host only (JWT required) */
  @Post(':id/recording/stop')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async stopRecording(
    @Param('id') sessionId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<ApiResponse<RecordingResponse>> {
    const recording = await this.recordingService.stopRecording(sessionId, user.id);
    return { success: true, data: recording };
  }

  /**
   * Get current recording status — no auth required so attendees can
   * display a "REC" indicator without needing a JWT.
   */
  @Get(':id/recording')
  async getRecording(
    @Param('id') sessionId: string,
  ): Promise<ApiResponse<RecordingResponse>> {
    const recording = await this.recordingService.getRecording(sessionId);
    return { success: true, data: recording };
  }
}
