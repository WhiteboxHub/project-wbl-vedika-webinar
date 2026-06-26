import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bull';
import { Repository } from 'typeorm';
import { RecordingResponse, RecordingStatus, AuditAction, SessionStatus } from '@webinar/shared';
import { RecordingEntity } from '../database/entities/recording.entity';
import { SessionEntity } from '../database/entities/session.entity';
import { EgressService } from '../livekit/egress.service';
import { AuditService } from '../database/audit.service';
import * as path from 'path';
import * as fs from 'fs/promises';
import { randomUUID } from 'crypto';

@Injectable()
export class RecordingService {
  private readonly logger = new Logger(RecordingService.name);
  private readonly recordingsRoot: string;

  constructor(
    private readonly configService: ConfigService,
    @InjectQueue('recording') private readonly recordingQueue: Queue,
    @InjectRepository(RecordingEntity)
    private readonly recordingRepository: Repository<RecordingEntity>,
    @InjectRepository(SessionEntity)
    private readonly sessionRepository: Repository<SessionEntity>,
    private readonly egressService: EgressService,
    private readonly auditService: AuditService,
  ) {
    this.recordingsRoot = this.configService.get('RECORDINGS_ROOT', '/var/recordings');
  }

  async startRecording(sessionId: string, userId?: string): Promise<RecordingResponse> {
    // Validate session exists and is LIVE
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }

    if (session.status !== SessionStatus.LIVE) {
      throw new BadRequestException(`Session must be LIVE to start recording. Current status: ${session.status}`);
    }

    const existingRecording = await this.recordingRepository.findOne({
      where: {
        sessionId,
        status: RecordingStatus.RECORDING_ACTIVE,
      },
    });

    if (existingRecording) {
      throw new BadRequestException('Recording already in progress for this session');
    }

    const recordingId = randomUUID();
    const egressId = randomUUID();

    const recording = this.recordingRepository.create({
      id: recordingId,
      sessionId,
      status: RecordingStatus.RECORDING_STARTING,
      startedAt: new Date(),
    });

    await this.recordingRepository.save(recording);

    this.logger.log(`Created recording ${recordingId} with status RECORDING_STARTING`);

    try {
      const sessionDir = this.getSessionDirectory(sessionId);
      await this.ensureDirectoryExists(sessionDir);
      await this.ensureDirectoryExists(path.join(sessionDir, 'raw'));

      const rawFilename = `${egressId}.mp4`;
      const rawPath = path.join(sessionDir, 'raw', rawFilename);

      const roomName = session.liveKitRoomName;

      this.logger.log(`Starting LiveKit Egress for room ${roomName}`);

      const egressResult = await this.egressService.startRoomCompositeEgress({
        roomName,
        outputPath: rawPath,
      });

      recording.egressId = egressResult.egressId;
      recording.rawPath = rawPath;
      recording.status = RecordingStatus.RECORDING_ACTIVE;

      await this.recordingRepository.save(recording);

      this.logger.log(`Recording ${recordingId} now RECORDING_ACTIVE with egress ${egressResult.egressId}`);

      await this.auditService.log(AuditAction.RECORDING_START, {
        userId,
        sessionId,
        recordingId,
        metadata: {
          egressId: egressResult.egressId,
          rawPath,
        },
      });

      return this.toResponse(recording);
    } catch (error) {
      this.logger.error(`Failed to start recording ${recordingId}`, error);

      recording.status = RecordingStatus.FAILED;
      recording.error = error.message;
      await this.recordingRepository.save(recording);

      throw new InternalServerErrorException('Failed to start recording');
    }
  }

  async stopRecording(sessionId: string, userId?: string): Promise<RecordingResponse> {
    // Validate session exists
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }

    const recording = await this.recordingRepository.findOne({
      where: {
        sessionId,
        status: RecordingStatus.RECORDING_ACTIVE,
      },
    });

    if (!recording) {
      throw new NotFoundException('No active recording found for this session');
    }

    this.logger.log(`Stopping recording ${recording.id}`);

    try {
      if (recording.egressId) {
        await this.egressService.stopEgress(recording.egressId);
        this.logger.log(`LiveKit Egress ${recording.egressId} stopped`);
      }

      recording.status = RecordingStatus.PROCESSING_QUEUED;
      recording.stoppedAt = new Date();

      await this.recordingRepository.save(recording);

      this.logger.log(`Recording ${recording.id} marked as PROCESSING_QUEUED`);

      await this.recordingQueue.add('process-recording', {
        recordingId: recording.id,
        sessionId: recording.sessionId,
        rawPath: recording.rawPath,
      });

      this.logger.log(`Queued processing job for recording ${recording.id}`);

      await this.auditService.log(AuditAction.RECORDING_STOP, {
        userId,
        sessionId,
        recordingId: recording.id,
        metadata: {
          egressId: recording.egressId,
          duration: recording.stoppedAt.getTime() - recording.startedAt.getTime(),
        },
      });

      return this.toResponse(recording);
    } catch (error) {
      this.logger.error(`Failed to stop recording ${recording.id}`, error);

      recording.status = RecordingStatus.FAILED;
      recording.error = error.message;
      await this.recordingRepository.save(recording);

      throw new InternalServerErrorException('Failed to stop recording');
    }
  }

  async getRecording(sessionId: string): Promise<RecordingResponse> {
    const recording = await this.recordingRepository.findOne({
      where: { sessionId },
      order: { createdAt: 'DESC' },
    });

    if (!recording) {
      throw new NotFoundException('Recording not found for this session');
    }

    return this.toResponse(recording);
  }

  async updateRecordingStatus(
    recordingId: string,
    status: RecordingStatus,
    updates?: Partial<RecordingEntity>,
  ): Promise<void> {
    const recording = await this.recordingRepository.findOne({
      where: { id: recordingId },
    });

    if (!recording) {
      throw new NotFoundException('Recording not found');
    }

    recording.status = status;

    if (updates) {
      Object.assign(recording, updates);
    }

    await this.recordingRepository.save(recording);

    this.logger.log(`Updated recording ${recordingId} status to ${status}`);
  }

  private toResponse(recording: RecordingEntity): RecordingResponse {
    const response: RecordingResponse = {
      id: recording.id,
      status: recording.status,
    };

    if (recording.duration) {
      response.duration = recording.duration;
    }

    if (recording.fileSize) {
      response.fileSize = Number(recording.fileSize);
    }

    if (recording.resolution) {
      response.resolution = recording.resolution;
    }

    if (recording.status === RecordingStatus.READY && recording.finalPath) {
      response.downloadUrl = `/recordings/${recording.id}/download`;
    }

    return response;
  }

  private getSessionDirectory(sessionId: string): string {
    const sanitized = sessionId.replace(/[^a-zA-Z0-9-_]/g, '');
    return path.join(this.recordingsRoot, sanitized);
  }

  private async ensureDirectoryExists(dir: string): Promise<void> {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      this.logger.error(`Failed to create directory ${dir}`, error);
      throw error;
    }
  }
}
