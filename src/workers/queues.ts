import { Queue, QueueEvents } from 'bullmq';
import { redis } from '../config/redis';
import { ProcessingJobPayload } from '../models/types';
import { logger } from '../utils/logger';


const connection = redis;


export const processingQueue = new Queue<ProcessingJobPayload>('file-processing', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { count: 100 },
    removeOnFail:     { count: 500 },
  },
});

// Queue events (for logging / metrics) 

const queueEvents = new QueueEvents('file-processing', { connection });

queueEvents.on('completed', ({ jobId }) => {
  logger.info({ jobId }, 'Processing job completed');
});

queueEvents.on('failed', ({ jobId, failedReason }) => {
  logger.error({ jobId, reason: failedReason }, 'Processing job failed');
});



export async function enqueueProcessing(payload: ProcessingJobPayload): Promise<void> {
  const job = await processingQueue.add('process', payload, {
    jobId: `process:${payload.fileId}`, // idempotent — safe to re-enqueue
  });
  logger.debug({ jobId: job.id, fileId: payload.fileId }, 'Processing job enqueued');
}

export async function enqueueThumbnail(payload: ProcessingJobPayload): Promise<void> {
  await processingQueue.add('thumbnail', payload, {
    jobId: `thumb:${payload.fileId}`,
    priority: 10, // lower priority than scan
  });
}