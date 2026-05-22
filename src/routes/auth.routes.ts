import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { authRateLimit } from '../middleware/ratelimit.middleware';
import { RegisterSchema, LoginSchema } from '../models/schemas';

const router = Router();


router.post(
  '/register',
  authRateLimit,
  validate(RegisterSchema),
  authController.register,
);


router.post(
  '/login',
  authRateLimit,
  validate(LoginSchema),
  authController.login,
);


router.get(
  '/me',
  authenticate as any,
  authController.me as any,
);

export default router;