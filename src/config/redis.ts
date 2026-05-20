import Redis from 'ioredis';
import { config } from './index';
import { logger } from '../utils/logger';

// Single Redis client shared across the app (cache + BullMQ)
export const redis = new Redis(config.redis.url, {
  maxRetriesPerRequest: null,   // required by BullMQ
  lazyConnect: true,
  enableReadyCheck: true,
});

redis.on('connect', () => logger.info('Redis connected'));
redis.on('error', (err) => logger.error({ err }, 'Redis error'));

export async function connectRedis(): Promise<void> {
  await redis.connect();
}