import { Job } from 'bull';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';
import { Pool } from 'pg';
import { logger } from '../common/logger';
import { workerConfig } from '../config/config';
import { buildFFmpegCommand, getFullCommand } from '../utils/ffmpeg';
import { RecordingResolution, RECORDING_CONSTANTS, RecordingStatus } from '@webinar/shared';

const execAsync = promisify(exec);

export interface RecordingJobData {
  recordingId: string;
  sessionId: string;
  rawPath: string;
}

interface RecordingRow {
  id: string;
  session_id: string;
  status: RecordingStatus;
  raw_path: string;
  started_at: Date;
  stopped_at: Date;
}

let dbPool: Pool | null = null;

function getDbPool(): Pool {
  if (!dbPool) {
    dbPool = new Pool({
      connectionString: workerConfig.database.url,
    });
  }
  return dbPool;
}

export async function processRecording(job: Job<RecordingJobData>): Promise<void> {
  const { recordingId, sessionId, rawPath } = job.data;

  logger.info(`Processing recording ${recordingId} for session ${sessionId}`, 'RecordingProcessor');

  const pool = getDbPool();
  let ffmpegLogs = '';

  try {
    const recordingResult = await pool.query<RecordingRow>(
      'SELECT id, session_id, status, raw_path, started_at, stopped_at FROM recordings WHERE id = $1',
      [recordingId],
    );

    if (recordingResult.rows.length === 0) {
      throw new Error(`Recording ${recordingId} not found in database`);
    }

    const recording = recordingResult.rows[0];

    if (recording.status !== RecordingStatus.PROCESSING_QUEUED) {
      logger.warn(
        `Recording ${recordingId} has status ${recording.status}, expected PROCESSING_QUEUED`,
        'RecordingProcessor',
      );
    }

    await pool.query(
      'UPDATE recordings SET status = $1, updated_at = NOW() WHERE id = $2',
      [RecordingStatus.PROCESSING, recordingId],
    );

    logger.info(`Recording ${recordingId} status updated to PROCESSING`, 'RecordingProcessor');

    await job.progress(10);

    const fullRawPath = path.isAbsolute(rawPath)
      ? rawPath
      : path.join(workerConfig.storage.recordingsRoot, rawPath);

    await verifyRawFile(fullRawPath);

    await job.progress(20);

    const sessionDir = path.dirname(path.dirname(fullRawPath));
    const processingDir = path.join(sessionDir, 'processing');
    const finalDir = path.join(sessionDir, 'final');

    await fs.mkdir(processingDir, { recursive: true });
    await fs.mkdir(finalDir, { recursive: true });

    const processingPath = path.join(processingDir, `${recordingId}.mp4`);
    const finalPath = path.join(finalDir, 'youtube-ready.mp4');

    await job.progress(30);

    const resolution = (workerConfig.storage.defaultResolution ||
      RECORDING_CONSTANTS.DEFAULT_RESOLUTION) as RecordingResolution;

    logger.info(
      `Starting FFmpeg conversion: ${fullRawPath} -> ${processingPath}`,
      'RecordingProcessor',
    );

    const ffmpegCmd = buildFFmpegCommand({
      inputPath: fullRawPath,
      outputPath: processingPath,
      resolution,
      ffmpegPath: workerConfig.ffmpeg.path,
    });

    const fullCommand = getFullCommand(ffmpegCmd);
    logger.debug(`FFmpeg command: ${fullCommand}`, 'RecordingProcessor');

    await job.progress(40);

    const startTime = Date.now();
    const { stdout, stderr } = await execAsync(fullCommand, {
      maxBuffer: 10 * 1024 * 1024,
    });

    const duration = Math.floor((Date.now() - startTime) / 1000);

    ffmpegLogs = `STDOUT:\n${stdout}\n\nSTDERR:\n${stderr}`;

    logger.debug(`FFmpeg completed in ${duration}s`, 'RecordingProcessor');

    await job.progress(80);

    const stats = await fs.stat(processingPath);
    if (stats.size === 0) {
      throw new Error('FFmpeg produced empty output file');
    }

    await fs.rename(processingPath, finalPath);

    logger.info(`Final recording: ${finalPath} (${stats.size} bytes)`, 'RecordingProcessor');

    await job.progress(90);

    const recordingDuration = Math.floor(
      (new Date(recording.stopped_at).getTime() - new Date(recording.started_at).getTime()) / 1000,
    );

    await pool.query(
      `UPDATE recordings
       SET status = $1,
           final_path = $2,
           duration = $3,
           file_size = $4,
           resolution = $5,
           ffmpeg_logs = $6,
           processed_at = NOW(),
           updated_at = NOW()
       WHERE id = $7`,
      [RecordingStatus.READY, finalPath, recordingDuration, stats.size, resolution, ffmpegLogs, recordingId],
    );

    logger.info(`Recording ${recordingId} status updated to READY`, 'RecordingProcessor');

    await pool.query(
      `INSERT INTO audit_logs (action, session_id, recording_id, metadata, timestamp)
       VALUES ($1, $2, $3, $4, NOW())`,
      [
        'recording_processing_success',
        sessionId,
        recordingId,
        JSON.stringify({
          finalPath,
          fileSize: stats.size,
          resolution,
          processingDurationSeconds: duration,
        }),
      ],
    );

    if (workerConfig.storage.cleanupRaw) {
      await fs.unlink(fullRawPath);
      logger.info(`Cleaned up raw file: ${fullRawPath}`, 'RecordingProcessor');
    }

    await job.progress(100);

    logger.info(
      `Recording ${recordingId} processed successfully: ${stats.size} bytes, ${recordingDuration}s duration`,
      'RecordingProcessor',
    );
  } catch (error) {
    logger.error(
      `Failed to process recording ${recordingId}`,
      error as Error,
      'RecordingProcessor',
    );

    const errorMessage = error instanceof Error ? error.message : String(error);

    await pool.query(
      `UPDATE recordings
       SET status = $1,
           error = $2,
           ffmpeg_logs = $3,
           updated_at = NOW()
       WHERE id = $4`,
      [RecordingStatus.FAILED, errorMessage, ffmpegLogs, recordingId],
    );

    await pool.query(
      `INSERT INTO audit_logs (action, session_id, recording_id, metadata, timestamp)
       VALUES ($1, $2, $3, $4, NOW())`,
      [
        'recording_processing_failure',
        sessionId,
        recordingId,
        JSON.stringify({
          error: errorMessage,
          ffmpegLogs: ffmpegLogs.substring(0, 1000),
        }),
      ],
    );

    throw error;
  }
}

async function verifyRawFile(filePath: string): Promise<void> {
  try {
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) {
      throw new Error('Raw path is not a file');
    }
    if (stats.size === 0) {
      throw new Error('Raw file is empty');
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Raw file not found: ${filePath}`);
    }
    throw error;
  }
}
