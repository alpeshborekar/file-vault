import Redis from 'ioredis';
import { config } from './index';
import { logger } from '../utils/logger';

// Shared Redis client
export const redis = new Redis(config.redis.url, {
  maxRetriesPerRequest: null,
});

redis.on('connect', () => {
  logger.info('Redis connected');
});

redis.on('error', (err) => {
  logger.error({ err }, 'Redis error');
});

export async function connectRedis(): Promise<void> {
  return;
}