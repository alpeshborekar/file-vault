import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { authRateLimit } from '../middleware/ratelimit.middleware';
import { RegisterSchema, LoginSchema } from '../models/schemas';

const router = Router();

/**
 * POST /auth/register
 * Rate limited to prevent account spam
 */
router.post(
  '/register',
  authRateLimit,
  validate(RegisterSchema),
  authController.register,
);

/**
 * POST /auth/login
 * Rate limited to prevent brute force
 */
router.post(
  '/login',
  authRateLimit,
  validate(LoginSchema),
  authController.login,
);

/**
 * GET /auth/me
 * Returns current user profile + storage usage
 */
router.get(
  '/me',
  authenticate as any,
  authController.me as any,
);

export default router;