import { Worker, Job } from 'bullmq';
import { redis } from '../config/redis';
import { fileRepo } from '../repositories/file.repo';
import { cache, CacheKey } from '../services/cache.service';
import { logger } from '../utils/logger';
import { ProcessingJobPayload } from '../models/types';

const IMAGE_MIMES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
]);

export const processWorker = new Worker<ProcessingJobPayload>(
  'file-processing',
  async (job: Job<ProcessingJobPayload>) => {
    if (job.name !== 'process') return;

    const { fileId, storageKey, mimeType, userId } = job.data;
    logger.info({ jobId: job.id, fileId }, 'Process job started');

    //Step 1: Virus scan 
    await job.updateProgress(10);
    logger.debug({ fileId }, 'Step 1/3: virus scan');

    // Simulate scan — replace with real ClamAV call
    await new Promise((r) => setTimeout(r, 400));
    const scanResult: 'clean' | 'infected' = 'clean';

    if (scanResult === 'infected') {
      await fileRepo.updateStatus(fileId, 'infected');
      await cache.invalidate(CacheKey.file(fileId));
      logger.warn({ fileId }, 'File infected — aborting pipeline');
      return; // Don't proceed to thumbnail
    }

    //Step 2: Thumbnail 
    await job.updateProgress(50);
    logger.debug({ fileId }, 'Step 2/3: thumbnail generation');

    if (IMAGE_MIMES.has(mimeType)) {
      await new Promise((r) => setTimeout(r, 200)); // simulate sharp processing
      logger.debug({ fileId }, 'Thumbnail generated');
    }

    //Step 3: Mark ready 
    await job.updateProgress(90);
    logger.debug({ fileId }, 'Step 3/3: marking file ready');

    await fileRepo.updateStatus(fileId, 'ready');
    await cache.invalidate(CacheKey.file(fileId), CacheKey.userFiles(userId));

    await job.updateProgress(100);
    logger.info({ fileId }, 'Process pipeline complete — file ready');
  },
  {
    connection:  redis,
    concurrency: 10,
    limiter: {
      max:      50,   // max 50 jobs processed per
      duration: 1000, // 1 second
    },
  },
);

//Lifecycle 

processWorker.on('progress', (job, progress) => {
  logger.debug({ jobId: job.id, fileId: job.data.fileId, progress }, 'Job progress');
});

processWorker.on('completed', (job) => {
  logger.info({ jobId: job.id, fileId: job.data.fileId }, 'Process job completed');
});

processWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, fileId: job?.data?.fileId, err }, 'Process job failed');
});

processWorker.on('error', (err) => {
  logger.error({ err }, 'Process worker error');
});

async function shutdown(signal: string) {
  logger.info(`${signal} — draining process worker`);
  // close(true) = wait for active jobs to finish before exiting
  await processWorker.close(true);
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

logger.info('Process worker started');