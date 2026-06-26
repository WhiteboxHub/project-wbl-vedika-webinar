import { config } from 'dotenv';

config();

export const workerConfig = {
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  database: {
    url: process.env.DATABASE_URL || 'postgresql://webinar:webinar@localhost:5432/webinar_db',
  },
  livekit: {
    url: process.env.LIVEKIT_URL || 'ws://localhost:7880',
    apiKey: process.env.LIVEKIT_API_KEY || 'devkey',
    apiSecret: process.env.LIVEKIT_API_SECRET || 'secret',
  },
  storage: {
    endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
    bucket: process.env.S3_BUCKET || 'webinar-recordings',
    accessKey: process.env.S3_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.S3_SECRET_KEY || 'minioadmin',
    region: process.env.S3_REGION || 'us-east-1',
    recordingsRoot: process.env.RECORDINGS_ROOT || '/var/recordings',
    cleanupRaw: process.env.RECORDING_CLEANUP_RAW === 'true',
    defaultResolution: process.env.RECORDING_DEFAULT_RESOLUTION || '1080p',
  },
  ffmpeg: {
    path: process.env.FFMPEG_PATH || '/usr/bin/ffmpeg',
  },
  worker: {
    concurrency: parseInt(process.env.WORKER_CONCURRENCY || '5', 10),
  },
  env: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
};
