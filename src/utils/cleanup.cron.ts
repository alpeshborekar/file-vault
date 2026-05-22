import { fileRepo } from '../repositories/file.repo';
import { storage } from '../services/storage.service';
import { cache, CacheKey } from '../services/cache.service';
import { redis } from '../config/redis';
import { logger } from './logger';


export async function purgeDeletedBlobs(): Promise<void> {

  const deleted = await (async () => {
    const { prisma } = await import('../config/db');
    return prisma.$queryRaw<{ id: string; storageKey: string }[]>`
      SELECT id, storage_key AS "storageKey"
      FROM files
      WHERE is_deleted = true
        AND storage_key NOT IN (
          SELECT storage_key FROM files WHERE is_deleted = false
        )
      LIMIT 100
    `;
  })();

  for (const file of deleted) {
    try {
      await storage.delete(file.storageKey);
      const { prisma } = await import('../config/db');
      await prisma.file.delete({ where: { id: file.id } });
      logger.info({ fileId: file.id }, 'Blob purged');
    } catch (err) {
      logger.error({ err, fileId: file.id }, 'Failed to purge blob');
    }
  }

  logger.info({ count: deleted.length }, 'Blob purge sweep complete');
}

export async function expireFiles(): Promise<void> {
  const expired = await fileRepo.findExpired();

  for (const file of expired) {
    await fileRepo.softDelete(file.id, file.userId);
    await cache.invalidate(CacheKey.file(file.id), CacheKey.userFiles(file.userId));
    logger.info({ fileId: file.id }, 'File expired and soft-deleted');
  }

  logger.info({ count: expired.length }, 'File expiry sweep complete');
}

export async function abortOrphanedMultiparts(): Promise<void> {


  const keys = await redis.keys('multipart:*');
  logger.info({ count: keys.length }, 'Multipart keys still active (not yet expired)');
}


export async function markStaleProcessingAsFailed(): Promise<void> {
  const STALE_THRESHOLD_MINUTES = 30;

  const { prisma } = await import('../config/db');
  const staleCount = await prisma.file.updateMany({
    where: {
      status: 'processing',
      updatedAt: {
        lt: new Date(Date.now() - STALE_THRESHOLD_MINUTES * 60 * 1000),
      },
    },
    data: { status: 'failed' },
  });

  if (staleCount.count > 0) {
    logger.warn({ count: staleCount.count }, 'Stale processing files marked as failed');
  }
}

//Runner 

export async function runAllCleanup(): Promise<void> {
  logger.info('Cleanup cron started');
  await Promise.allSettled([
    expireFiles(),
    markStaleProcessingAsFailed(),
    abortOrphanedMultiparts(),
  ]);
  // Blob purge runs after soft-deletes are committed
  await purgeDeletedBlobs();
  logger.info('Cleanup cron finished');
}

// Run directly: ts-node src/utils/cleanup.cron.ts
if (require.main === module) {
  runAllCleanup()
    .then(() => process.exit(0))
    .catch((err) => { logger.error(err); process.exit(1); });
}