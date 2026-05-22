import { totalStorageUsedBytes, activeUsersGauge } from '../config/metrics';
import { logger } from './logger';

export async function refreshAggregateMetrics(): Promise<void> {
  try {
    const { prisma } = require('../config/db');

    const [storageResult, userCount] = await Promise.all([
      prisma.user.aggregate({ _sum: { storageUsedBytes: true } }),
      prisma.user.count(),
    ]);

    const totalBytes = Number(storageResult._sum.storageUsedBytes ?? 0n);
    totalStorageUsedBytes.set(totalBytes);
    activeUsersGauge.set(userCount);

    logger.debug({ totalBytes, userCount }, 'Aggregate metrics refreshed');
  } catch (err) {
    logger.warn({ err }, 'Failed to refresh aggregate metrics');
  }
}

export function startMetricsCron(intervalMs = 60_000): NodeJS.Timeout {
  refreshAggregateMetrics(); // run immediately on boot
  return setInterval(refreshAggregateMetrics, intervalMs);
}