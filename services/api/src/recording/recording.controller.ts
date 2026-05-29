import { Controller, Post, Get, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { RecordingService } from './recording.service';
import { ApiResponse, RecordingResponse } from '@webinar/shared';

@Controller('classes')
export class RecordingController {
  constructor(private readonly recordingService: RecordingService) {}

  @Post(':id/recording/start')
  @HttpCode(HttpStatus.OK)
  async startRecording(@Param('id') sessionId: string): Promise<ApiResponse<RecordingResponse>> {
    const recording = await this.recordingService.startRecording(sessionId);
    return {
      success: true,
      data: recording,
    };
  }

  @Post(':id/recording/stop')
  @HttpCode(HttpStatus.OK)
  async stopRecording(@Param('id') sessionId: string): Promise<ApiResponse<RecordingResponse>> {
    const recording = await this.recordingService.stopRecording(sessionId);
    return {
      success: true,
      data: recording,
    };
  }

  @Get(':id/recording')
  async getRecording(@Param('id') sessionId: string): Promise<ApiResponse<RecordingResponse>> {
    const recording = await this.recordingService.getRecording(sessionId);
    return {
      success: true,
      data: recording,
    };
  }
}
