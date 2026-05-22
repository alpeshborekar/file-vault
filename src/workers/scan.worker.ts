import { Worker, Job } from 'bullmq';
import { fileRepo } from '../repositories/file.repo';
import { storage } from '../services/storage.service';
import { cache, CacheKey } from '../services/cache.service';
import { logger } from '../utils/logger';
import { ProcessingJobPayload } from '../models/types';

//Redis connection 

function getRedis() {
  const { redis } = require('../config/redis');
  return redis;
}



async function simulateVirusScan(_storageKey: string): Promise<'clean' | 'infected'> {
  logger.debug({ _storageKey }, 'Running virus scan (simulated)');
  await new Promise((r) => setTimeout(r, 300 + Math.random() * 200));
  return 'clean'; // always clean in dev — change to 'infected' to test quarantine flow
}


export const scanWorker = new Worker<ProcessingJobPayload>(
  'file-processing',
  async (job: Job<ProcessingJobPayload>) => {
    // This worker only handles 'process' named jobs
    if (job.name !== 'process') return;

    const { fileId, storageKey } = job.data;
    logger.info({ jobId: job.id, fileId }, 'Scan job started');

    const result = await simulateVirusScan(storageKey);

    if (result === 'infected') {
      logger.warn({ fileId, storageKey }, 'File infected — quarantining');

      // Mark as infected in DB so GET /files/:id returns 403
      await fileRepo.updateStatus(fileId, 'infected');

      // Delete the blob — never serve infected content
      try {
        await storage.delete(storageKey);
      } catch (err) {
        logger.error({ err, storageKey }, 'Failed to delete infected blob');
      }
    } else {
      // Mark file as ready — visible to the user
      await fileRepo.updateStatus(fileId, 'ready');
      logger.info({ fileId }, 'Scan passed — file marked ready');
    }

    // Invalidate cached metadata so next GET reflects the new status
    await cache.invalidate(CacheKey.file(fileId));
  },
  {
    connection:  getRedis(),
    concurrency: 5,
  },
);

//Lifecycle events 

scanWorker.on('completed', (job) => {
  logger.info({ jobId: job.id, fileId: job.data.fileId }, 'Scan job completed');
});

scanWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, fileId: job?.data?.fileId, err }, 'Scan job failed');
});

scanWorker.on('error', (err) => {
  logger.error({ err }, 'Scan worker error');
});

// Graceful shutdown 

async function shutdown(signal: string) {
  logger.info(`${signal} — closing scan worker`);
  await scanWorker.close();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

logger.info('Scan worker started');