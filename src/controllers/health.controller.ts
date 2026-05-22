import { Request, Response } from 'express';
import { HeadBucketCommand } from '@aws-sdk/client-s3';
import { config } from '../config';
import { queueDepth } from '../config/metrics';
import { logger } from '../utils/logger';

type CheckStatus = 'ok' | 'degraded' | 'down';

interface ComponentHealth {
  status:     CheckStatus;
  latencyMs?: number;
  detail?:    string;
}

//Individual checks 

async function checkPostgres(): Promise<ComponentHealth> {
  const start = Date.now();
  try {
    const { prisma } = require('../config/db');
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch (err) {
    logger.error({ err }, 'Health: Postgres failed');
    return { status: 'down', latencyMs: Date.now() - start, detail: 'Query failed' };
  }
}

async function checkRedis(): Promise<ComponentHealth> {
  const start = Date.now();
  try {
    const { redis } = require('../config/redis');
    const pong = await redis.ping();
    return {
      status:    pong === 'PONG' ? 'ok' : 'degraded',
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    logger.error({ err }, 'Health: Redis failed');
    return { status: 'down', latencyMs: Date.now() - start, detail: 'Ping failed' };
  }
}

async function checkS3(): Promise<ComponentHealth> {
  const start = Date.now();
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { s3Client } = require('../config/s3');
    await s3Client.send(
      new HeadBucketCommand({ Bucket: config.storage.aws.bucket }),
    );
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch (err: any) {
    if (err?.name === 'AccessDenied' || err?.$metadata?.httpStatusCode === 403) {
      return { status: 'ok', latencyMs: Date.now() - start };
    }
    logger.error({ err }, 'Health: S3 failed');
    return { status: 'down', latencyMs: Date.now() - start, detail: 'Bucket unreachable' };
  }
}

async function checkQueue(): Promise<ComponentHealth & { depth?: Record<string, number> }> {
  const start = Date.now();
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { processingQueue } = require('../workers/queues');
    const [waiting, active, delayed, failed] = await Promise.all([
      processingQueue.getWaitingCount(),
      processingQueue.getActiveCount(),
      processingQueue.getDelayedCount(),
      processingQueue.getFailedCount(),
    ]);

    const depth = { waiting, active, delayed, failed };

    queueDepth.set({ queue: 'file-processing', state: 'waiting' }, waiting);
    queueDepth.set({ queue: 'file-processing', state: 'active' },  active);
    queueDepth.set({ queue: 'file-processing', state: 'delayed' }, delayed);
    queueDepth.set({ queue: 'file-processing', state: 'failed' },  failed);

    return {
      status:    failed > 100 ? 'degraded' : 'ok',
      latencyMs: Date.now() - start,
      depth,
    };
  } catch (err) {
    logger.error({ err }, 'Health: Queue failed');
    return { status: 'down', latencyMs: Date.now() - start, detail: 'Queue unreachable' };
  }
}

//Controller 

export const healthController = {
  
  liveness(_req: Request, res: Response): void {
    res.status(200).json({
      status:    'ok',
      uptime:    Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  },

 

  async readiness(_req: Request, res: Response): Promise<void> {
    const [postgres, redis, s3, queue] = await Promise.all([
      checkPostgres(),
      checkRedis(),
      checkS3(),
      checkQueue(),
    ]);

    const components = { postgres, redis, s3, queue };

    const criticalDown = postgres.status === 'down' || redis.status === 'down';
    const anyDegraded  = Object.values(components).some((c) => c.status !== 'ok');

    const overallStatus: CheckStatus = criticalDown
      ? 'down'
      : anyDegraded ? 'degraded' : 'ok';

    const httpStatus = criticalDown ? 503 : anyDegraded ? 207 : 200;

    res.status(httpStatus).json({
      status:     overallStatus,
      version:    process.env.npm_package_version ?? '0.0.0',
      uptime:     Math.floor(process.uptime()),
      timestamp:  new Date().toISOString(),
      components,
    });
  },
};