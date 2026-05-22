import { Worker, Job } from 'bullmq';
import sharp from 'sharp';
import { Readable } from 'stream';
import { fileRepo } from '../repositories/file.repo';
import { storage } from '../services/storage.service';
import { cache, CacheKey } from '../services/cache.service';
import { buildThumbnailKey } from '../utils/hash';
import { logger } from '../utils/logger';
import { ProcessingJobPayload } from '../models/types';

function getRedis() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { redis } = require('../config/redis');
  return redis;
}

const IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
]);

const THUMB_WIDTH   = 320;
const THUMB_HEIGHT  = 320;
const THUMB_QUALITY = 80;

//Thumbnail generator 

async function generateThumbnail(mimeType: string): Promise<Buffer | null> {
  if (!IMAGE_MIMES.has(mimeType)) return null;
  const buffer = await sharp({
    create: {
      width:      THUMB_WIDTH,
      height:     THUMB_HEIGHT,
      channels:   3,
      background: { r: 26, g: 26, b: 46 }, // dark background
    },
  })
    .resize(THUMB_WIDTH, THUMB_HEIGHT, {
      fit:                  'inside',
      withoutEnlargement:   true,
    })
    .webp({ quality: THUMB_QUALITY })
    .toBuffer();

  return buffer;
}

//Worker 

export const thumbnailWorker = new Worker<ProcessingJobPayload>(
  'file-processing',
  async (job: Job<ProcessingJobPayload>) => {
    if (job.name !== 'process' && job.name !== 'thumbnail') return;

    const { fileId, storageKey, mimeType } = job.data;

    if (!IMAGE_MIMES.has(mimeType)) {
      logger.debug({ fileId, mimeType }, 'Skipping thumbnail — not an image');
      return;
    }

    logger.info({ jobId: job.id, fileId }, 'Thumbnail job started');

    try {
      const thumbBuffer = await generateThumbnail(mimeType);
      if (!thumbBuffer) return;

      const thumbKey = buildThumbnailKey(fileId);

      await storage.put(
        thumbKey,
        Readable.from(thumbBuffer),
        thumbBuffer.length,
        'image/webp',
      );

      await fileRepo.updateThumbnailKey(fileId, thumbKey);
      await cache.invalidate(CacheKey.file(fileId));

      logger.info({ fileId, thumbKey }, 'Thumbnail generated and stored');
    } catch (err) {
      // Thumbnail failure is non-fatal — log and continue
      // The file is still accessible, just without a preview
      logger.warn({ err, fileId }, 'Thumbnail generation failed — skipping');
    }
  },
  {
    connection:  getRedis(),
    concurrency: 3, // thumbnail generation is CPU-bound — keep lower
  },
);

//Lifecycle events 

thumbnailWorker.on('completed', (job) => {
  logger.info({ jobId: job.id, fileId: job.data.fileId }, 'Thumbnail job completed');
});

thumbnailWorker.on('failed', (job, err) => {
  logger.error(
    { jobId: job?.id, fileId: job?.data?.fileId, err },
    'Thumbnail job failed',
  );
});

thumbnailWorker.on('error', (err) => {
  logger.error({ err }, 'Thumbnail worker error');
});

//Graceful shutdown 

async function shutdown(signal: string) {
  logger.info(`${signal} — closing thumbnail worker`);
  await thumbnailWorker.close();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

logger.info('Thumbnail worker started');