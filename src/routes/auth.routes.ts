import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { authRateLimit } from '../middleware/ratelimit.middleware';
import { RegisterSchema, LoginSchema } from '../models/schemas';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication and user management
 */

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Create a new account
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterInput'
 *     responses:
 *       201:
 *         description: Account created — returns JWT token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Validation error (weak password, invalid email)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Email already registered
 */
router.post(
  '/register',
  authRateLimit,
  validate(RegisterSchema),
  authController.register,
);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login and receive a JWT token
 *     tags: [Auth]
 *     description: |
 *       Uses timing-safe comparison — response time is identical
 *       whether the email exists or not (prevents email enumeration).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginInput'
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       401:
 *         description: Invalid email or password
 */
router.post(
  '/login',
  authRateLimit,
  validate(LoginSchema),
  authController.login,
);

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Get current user profile and storage stats
 *     tags: [Auth]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: User profile with storage usage
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:                { type: string }
 *                 email:             { type: string }
 *                 storageQuotaBytes: { type: string, example: "5368709120" }
 *                 storageUsedBytes:  { type: string, example: "1048576" }
 *                 createdAt:         { type: string, format: date-time }
 *       401:
 *         description: Missing or invalid JWT
 */
router.get(
  '/me',
  authenticate as any,
  authController.me as any,
);

export default router;