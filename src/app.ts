import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import { config } from './config';
import { connectDB } from './config/db';
import { connectRedis } from './config/redis';
import { logger } from './utils/logger';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { authenticate } from './middleware/auth.middleware';

import authRoutes from './routes/auth.routes';


export function createApp() {
  const app = express();

  // Security headers
  app.use(helmet());

  // CORS — tighten origins in production
  app.use(
    cors({
      origin: config.isDev ? '*' : process.env.ALLOWED_ORIGINS?.split(',') ?? [],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Authorization', 'Content-Type'],
    }),
  );

  // Request logging
  app.use(
    morgan(config.isDev ? 'dev' : 'combined', {
      stream: { write: (msg) => logger.info(msg.trim()) },
    }),
  );

  

  // ── Body parsers (not used for multipart — multer handles that)
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // ── Health + metrics (no auth — IP-restricted in prod for /metrics)

  app.use('/auth',   authRoutes);

  // ── 404 + global error handler (must be last)
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

//Bootstrap
async function bootstrap() {
  try {
    await connectDB();
    logger.info('PostgreSQL connected');

    await connectRedis();
    logger.info('Redis connected');

    const app = createApp();

    const { createServer } = await import('http');
    const httpServer = createServer(app);

    const server = httpServer.listen(config.port, () => {
      logger.info(`🚀  Server running on http://localhost:${config.port}`);
      logger.info(`🔌  WebSocket ready on ws://localhost:${config.port}`);
    });

    // ── Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`${signal} received — shutting down gracefully`);
      server.close(async () => {
        const { disconnectDB } = await import('./config/db');
        const { redis } = await import('./config/redis');
        await disconnectDB();
        await redis.quit();
        logger.info('Server closed');
        process.exit(0);
      });

      // Force exit after 10s if connections hang
      setTimeout(() => process.exit(1), 10_000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT',  () => shutdown('SIGINT'));

  } catch (err) {
    logger.error({ err }, 'Failed to start server');
    process.exit(1);
  }
}

bootstrap();