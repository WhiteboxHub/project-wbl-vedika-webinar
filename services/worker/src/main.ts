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
      // GAP-10: Route exhausted jobs to a dead-letter queue instead of silently dropping.
      // Inspect with: redis-cli LRANGE bull:recording-dlq:failed 0 -1
      removeOnComplete: false, // keep completed jobs for audit
      removeOnFail: false,     // keep failed jobs for inspection
    },
  });

  // GAP-10: Dead-letter queue — jobs land here after exhausting all retries.
  const dlq = new Queue('recording-dlq', workerConfig.redis.url);

  recordingQueue.process(workerConfig.worker.concurrency, processRecording);

  recordingQueue.on('completed', (job) => {
    logger.info(`Job ${job.id} completed`, 'Worker');
  });

  recordingQueue.on('failed', (job, err) => {
    const attemptsLeft = (job.opts.attempts ?? 3) - (job.attemptsMade ?? 0);
    if (attemptsLeft <= 0) {
      // All retries exhausted — move to DLQ with full context.
      logger.error(
        `DEAD LETTER: Job ${job.id} exhausted all retries. Recording may be lost.`,
        err,
        'Worker',
      );
      dlq.add('dead-recording', {
        originalJobId: job.id,
        data: job.data,
        failedAt: new Date().toISOString(),
        error: err.message,
        attemptsMade: job.attemptsMade,
      }).catch((dlqErr) => {
        logger.error(`Failed to push to DLQ: ${dlqErr.message}`, dlqErr, 'Worker');
      });
    } else {
      logger.error(`Job ${job.id} failed (${attemptsLeft} retries left)`, err, 'Worker');
    }
  });

  logger.info(`Worker service started with concurrency ${workerConfig.worker.concurrency}`, 'Bootstrap');

  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down gracefully', 'Bootstrap');
    await recordingQueue.close();
    await dlq.close();
    process.exit(0);
  });
}

bootstrap().catch((error) => {
  logger.error('Failed to start worker service', error, 'Bootstrap');
  process.exit(1);
});
