import { Queue, QueueEvents } from 'bullmq';
import { redis } from '../config/redis';
import { ProcessingJobPayload } from '../models/types';
import { logger } from '../utils/logger';

// Shared Redis connection
const connection = redis;

// Main processing queue
export const processingQueue = new Queue<ProcessingJobPayload>(
  'file-processing',
  {
    connection,

    defaultJobOptions: {
      attempts: 3,

      backoff: {
        type: 'exponential',
        delay: 2000,
      },

      // Keep jobs visible in Bull Board
      removeOnComplete: false,
      removeOnFail: false,
    },
  },
);

// Queue events (logging / metrics)
const queueEvents = new QueueEvents(
  'file-processing',
  { connection },
);

queueEvents.on('completed', ({ jobId }) => {
  logger.info(
    { jobId },
    'Processing job completed',
  );
});

queueEvents.on('failed', ({ jobId, failedReason }) => {
  logger.error(
    {
      jobId,
      reason: failedReason,
    },
    'Processing job failed',
  );
});

// Enqueue file processing job
export async function enqueueProcessing(
  payload: ProcessingJobPayload,
): Promise<void> {

  const job = await processingQueue.add(
    'process',
    payload,
    {
      // BullMQ does NOT allow ":" in custom IDs
      jobId: `process-${payload.fileId}`,
    },
  );

  logger.debug(
    {
      jobId: job.id,
      fileId: payload.fileId,
    },
    'Processing job enqueued',
  );
}

// Enqueue thumbnail generation job
export async function enqueueThumbnail(
  payload: ProcessingJobPayload,
): Promise<void> {

  const job = await processingQueue.add(
    'thumbnail',
    payload,
    {
      jobId: `thumb-${payload.fileId}`,

      priority: 10,
    },
  );

  logger.debug(
    {
      jobId: job.id,
      fileId: payload.fileId,
    },
    'Thumbnail job enqueued',
  );
}