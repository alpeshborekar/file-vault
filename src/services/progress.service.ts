import { QueueEvents } from 'bullmq';
import { getIO, buildRoom, ProgressEvent, UploadStage } from '../config/socket';
import { logger } from '../utils/logger';

function percentToStage(percent: number): { stage: UploadStage; message: string } {
  if (percent === 0)   return { stage: 'queued',     message: 'Waiting in queue…' };
  if (percent <= 30)   return { stage: 'scanning',   message: 'Scanning for malware…' };
  if (percent <= 70)   return { stage: 'thumbnail',  message: 'Generating preview…' };
  if (percent < 100)   return { stage: 'finalising', message: 'Finalising upload…' };
  return                      { stage: 'complete',   message: 'File ready' };
}

//Broadcaster 

export function broadcastProgress(
  userId: string,
  fileId: string,
  percent: number,
  overrides: Partial<ProgressEvent> = {},
): void {
  try {
    const io   = getIO();
    const room = buildRoom(userId, fileId);
    const { stage, message } = percentToStage(percent);

    const event: ProgressEvent = {
      fileId,
      stage,
      percent,
      message,
      ...overrides,
    };

    io.to(room).emit('file:progress', event);
    logger.debug({ room, percent, stage }, 'Progress broadcast');
  } catch (err) {
    logger.warn({ err, fileId }, 'Progress broadcast skipped');
  }
}


let bridgeInitialised = false;

export function initProgressBridge(): void {
  if (bridgeInitialised) return;
  bridgeInitialised = true;

  const { redis } = require('../config/redis');
  const queueEvents = new QueueEvents('file-processing', { connection: redis });

  queueEvents.on('progress', ({ jobId, data }) => {
    const percent = typeof data === 'number' ? data : 0;
    extractJobMeta(jobId).then(({ userId, fileId }) => {
      if (!userId || !fileId) return;
      broadcastProgress(userId, fileId, percent);
    });
  });

  queueEvents.on('completed', ({ jobId }) => {
    extractJobMeta(jobId).then(({ userId, fileId }) => {
      if (!userId || !fileId) return;
      broadcastProgress(userId, fileId, 100, {
        stage:   'complete',
        message: 'File is ready',
        status:  'ready',
      });
    });
  });

  queueEvents.on('failed', ({ jobId, failedReason }) => {
    extractJobMeta(jobId).then(({ userId, fileId }) => {
      if (!userId || !fileId) return;
      broadcastProgress(userId, fileId, 0, {
        stage:   'failed',
        message: 'Processing failed',
        status:  'failed',
        error:   failedReason,
      });
    });
  });

  queueEvents.on('stalled', ({ jobId }) => {
    logger.warn({ jobId }, 'Job stalled — will retry');
    extractJobMeta(jobId).then(({ userId, fileId }) => {
      if (!userId || !fileId) return;
      broadcastProgress(userId, fileId, 0, {
        stage:   'queued',
        message: 'Processing restarted…',
      });
    });
  });

  queueEvents.on('error', (err) => {
    logger.error({ err }, 'QueueEvents error');
  });

  logger.info('Progress bridge initialised (QueueEvents → Socket.IO)');
}


async function extractJobMeta(
  jobId: string,
): Promise<{ userId: string; fileId: string }> {
  try {
    const { processingQueue } = require('../workers/queues');
    const job = await processingQueue.getJob(jobId);
    if (!job) return { userId: '', fileId: '' };
    return {
      userId: job.data.userId ?? '',
      fileId: job.data.fileId ?? '',
    };
  } catch {
    return { userId: '', fileId: '' };
  }
}