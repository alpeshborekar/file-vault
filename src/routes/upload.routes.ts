import { Router } from 'express';

const router = Router();

router.get('/', (_req, res) => {
  res.json({
    message: 'Upload routes working',
  });
});

export default router;