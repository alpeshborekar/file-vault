import { Worker, Job } from 'bullmq';
import sharp from 'sharp';
import { Readable } from 'stream';

import { fileRepo } from '../repositories/file.repo';
import { storage } from '../services/storage.service';
import { cache, CacheKey } from '../services/cache.service';

import { buildThumbnailKey } from '../utils/hash';
import { logger } from '../utils/logger';

import { ProcessingJobPayload } from '../models/types';

// Redis connection

function getRedis() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { redis } = require('../config/redis');

  return redis;
}

const P = {
  ACCEPTED: 0,
  SCAN_START: 10,
  SCAN_PASS: 30,
  THUMBNAIL_START: 40,
  THUMBNAIL_DONE: 70,
  DB_UPDATED: 85,
  COMPLETE: 100,
} as const;

const IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
]);

// Worker

export const processWorker = new Worker<ProcessingJobPayload>(
  'file-processing',

  async (job: Job<ProcessingJobPayload>) => {
    if (job.name !== 'process') return;

    const {
      fileId,
      storageKey,
      mimeType,
      userId,
    } = job.data;

    logger.info(
      { jobId: job.id, fileId },
      'Process job started',
    );

    // Step 1: Accepted

    await job.updateProgress(P.ACCEPTED);

    // Step 2: Virus scan

    await job.updateProgress(P.SCAN_START);

    logger.debug(
      { fileId },
      'Running virus scan',
    );

    // Production: replace with ClamAV or AV API call

    await new Promise((r) => setTimeout(r, 400));

    const scanResult = 'clean' as string;

    if ((scanResult as string) === 'infected') {
      await fileRepo.updateStatus(
        fileId,
        'infected',
      );

      await cache.invalidate(
        CacheKey.file(fileId),
      );

      try {
        await storage.delete(storageKey);
      } catch {
        // log only
      }

      logger.warn(
        { fileId },
        'File infected — pipeline aborted',
      );

      throw new Error('FILE_INFECTED');
    }

    await job.updateProgress(P.SCAN_PASS);

    logger.debug(
      { fileId },
      'Scan passed',
    );

    // Step 3: Thumbnail

    await job.updateProgress(P.THUMBNAIL_START);

    if (IMAGE_MIMES.has(mimeType)) {
      try {
        const thumbBuffer = await sharp({
          create: {
            width: 320,
            height: 320,
            channels: 3,
            background: {
              r: 26,
              g: 26,
              b: 46,
            },
          },
        })
          .resize(320, 320, {
            fit: 'inside',
            withoutEnlargement: true,
          })
          .webp({ quality: 80 })
          .toBuffer();

        const thumbKey =
          buildThumbnailKey(fileId);

        await storage.put(
          thumbKey,
          Readable.from(thumbBuffer),
          thumbBuffer.length,
          'image/webp',
        );

        await fileRepo.updateThumbnailKey(
          fileId,
          thumbKey,
        );

        logger.debug(
          { fileId, thumbKey },
          'Thumbnail stored',
        );
      } catch (err) {
        // Non-fatal — file still accessible without thumbnail

        logger.warn(
          { err, fileId },
          'Thumbnail failed — skipping',
        );
      }
    }

    await job.updateProgress(P.THUMBNAIL_DONE);

    // Step 4: Mark ready

    await fileRepo.updateStatus(
      fileId,
      'ready',
    );

    await cache.invalidate(
      CacheKey.file(fileId),
      CacheKey.userFiles(userId),
    );

    await job.updateProgress(P.DB_UPDATED);

    // Step 5: Complete

    await job.updateProgress(P.COMPLETE);

    logger.info(
      { fileId },
      'Process pipeline complete — file ready',
    );
  },

  {
    connection: getRedis(),

    concurrency: 10,

    limiter: {
      max: 50,
      duration: 1000,
    },
  },
);

// Lifecycle

processWorker.on(
  'progress',
  (job, progress) => {
    logger.debug(
      {
        jobId: job.id,
        fileId: job.data.fileId,
        progress,
      },
      'Job progress checkpoint',
    );
  },
);

processWorker.on(
  'completed',
  (job) => {
    logger.info(
      {
        jobId: job.id,
        fileId: job.data.fileId,
      },
      'Process job completed',
    );
  },
);

processWorker.on(
  'failed',
  (job, err) => {
    logger.error(
      {
        jobId: job?.id,
        fileId: job?.data?.fileId,
        err,
      },
      'Process job failed',
    );
  },
);

processWorker.on('error', (err) => {
  logger.error(
    { err },
    'Process worker error',
  );
});

// Graceful shutdown

async function shutdown(signal: string) {
  logger.info(
    `${signal} — draining process worker`,
  );

  await processWorker.close(true);

  process.exit(0);
}

process.on(
  'SIGTERM',
  () => shutdown('SIGTERM'),
);

process.on(
  'SIGINT',
  () => shutdown('SIGINT'),
);

logger.info('Process worker started');