import { Router } from 'express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { config } from '../config';

const router = Router();

// Lazy-load the queue to avoid circular dependency at startup
function getQueue() {
  const { processingQueue } = require('../workers/queues');
  return processingQueue;
}

if (config.isDev) {
  const serverAdapter = new ExpressAdapter();

  serverAdapter.setBasePath('/admin/queues');

  createBullBoard({
    queues: [
      new BullMQAdapter(getQueue() as any) as any,
    ],
    serverAdapter,
  });

  router.use('/queues', serverAdapter.getRouter());
} else {
  router.use('/queues', (_req, res) => {
    res.status(403).json({
      error: 'FORBIDDEN',
      message: 'Admin UI disabled in production',
    });
  });
}

export default router;