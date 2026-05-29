import Queue from 'bull';
import { workerConfig } from './config/config';
import { logger } from './common/logger';
import { processRecording } from './jobs/recording.processor';

async function bootstrap() {
  logger.info('Starting worker service', 'Bootstrap');

  const recordingQueue = new Queue('recording', workerConfig.redis.url, {
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    },
  });

  recordingQueue.process(workerConfig.worker.concurrency, processRecording);

  recordingQueue.on('completed', (job) => {
    logger.info(`Job ${job.id} completed`, 'Worker');
  });

  recordingQueue.on('failed', (job, err) => {
    logger.error(`Job ${job.id} failed`, err, 'Worker');
  });

  logger.info(`Worker service started with concurrency ${workerConfig.worker.concurrency}`, 'Bootstrap');

  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down gracefully', 'Bootstrap');
    await recordingQueue.close();
    process.exit(0);
  });
}

bootstrap().catch((error) => {
  logger.error('Failed to start worker service', error, 'Bootstrap');
  process.exit(1);
});
