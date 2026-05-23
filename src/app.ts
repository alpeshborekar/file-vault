import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';

import { config } from './config';
import { connectDB } from './config/db';
import { connectRedis } from './config/redis';

import { logger } from './utils/logger';

import {
  errorHandler,
  notFoundHandler,
} from './middleware/error.middleware';

import { authenticate } from './middleware/auth.middleware';

import authRoutes from './routes/auth.routes';
import uploadRoutes from './routes/upload.routes';
import fileRoutes from './routes/file.routes';
import healthRoutes from './routes/health.routes';
import adminRoutes from './routes/admin.routes';

import { initSocketServer } from './config/socket';
import { register } from './config/metrics';

import { initProgressBridge } from './services/progress.service';

import { metricsMiddleware } from './middleware/metrics.middleware';

import { startMetricsCron } from './utils/metrics.cron';
import './workers/process.worker';
import swaggerRoutes from './routes/swagger.routes';


export function createApp() {
  const app = express();

  // Security headers
  app.use(helmet());

  // CORS
  app.use(
    cors({
      origin: config.isDev
        ? '*'
        : process.env.ALLOWED_ORIGINS?.split(',') ?? [],

      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],

      allowedHeaders: ['Authorization', 'Content-Type'],
    }),
  );

  // Request logging
  app.use(
    morgan(config.isDev ? 'dev' : 'combined', {
      stream: {
        write: (msg) => logger.info(msg.trim()),
      },
    }),
  );

  // Prometheus metrics middleware
  app.use(metricsMiddleware);

  // Body parsers
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({
    extended: true,
    limit: '1mb',
  }));

  // Health route
  app.use('/health', healthRoutes);

  // Metrics endpoint
  app.get('/metrics', async (_req, res) => {
    res.setHeader('Content-Type', register.contentType);
    res.send(await register.metrics());
  });

  // API routes
  app.use('/auth', authRoutes);

  app.use(
    '/upload',
    authenticate as any,
    uploadRoutes,
  );

  app.use('/files', fileRoutes);

  // BullMQ dashboard
  app.use('/admin', adminRoutes);

  app.use('/api-docs', swaggerRoutes);


  // 404 handler
  app.use(notFoundHandler);

  // Global error handler
  app.use(errorHandler);

  return app;
}

async function bootstrap() {
  try {
    await connectDB();
    logger.info('PostgreSQL connected');

    await connectRedis();
    logger.info('Redis connected');

    const app = createApp();

    // Shared HTTP server for Express + Socket.IO
    const { createServer } = await import('http');

    const httpServer = createServer(app);

    // Socket.IO
    initSocketServer(httpServer);

    // Queue progress → WebSocket bridge
    initProgressBridge();

    // Background metrics aggregation
    startMetricsCron(60_000);

    const server = httpServer.listen(config.port, () => {
      logger.info(
        `🚀 Server running on http://localhost:${config.port}`,
      );

      logger.info(
        `🔌 WebSocket ready on ws://localhost:${config.port}`,
      );

      logger.info(
        `📊 Metrics at http://localhost:${config.port}/metrics`,
      );
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(
        `${signal} received — shutting down gracefully`,
      );

      server.close(async () => {
        const { disconnectDB } = await import('./config/db');

        const { redis } = await import('./config/redis');

        await disconnectDB();

        await redis.quit();

        logger.info('Server closed');

        process.exit(0);
      });

      // Force exit after 10s
      setTimeout(() => process.exit(1), 10_000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (err) {
    logger.error({ err }, 'Failed to start server');

    process.exit(1);
  }
}

bootstrap();