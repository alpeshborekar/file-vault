import { Router, Request, Response } from 'express';
import { healthController } from '../controllers/health.controller';
import { register } from '../config/metrics';
import { config } from '../config';

const router = Router();

router.get('/', healthController.liveness);


router.get('/ready', healthController.readiness);

router.get('/metrics', async (_req: Request, res: Response) => {
  if (config.isProd) {
    const allowed  = (process.env.METRICS_ALLOWED_IPS ?? '127.0.0.1').split(',');
    const clientIp = _req.ip ?? '';
    if (!allowed.some((ip) => clientIp.includes(ip.trim()))) {
      res.status(403).json({ error: 'FORBIDDEN' });
      return;
    }
  }

  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch {
    res.status(500).end();
  }
});

export default router;