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
 *     description: |
 *       Registers a new user account and returns a JWT token.
 *
 *       Password requirements:
 *       - Minimum 8 characters
 *       - At least one uppercase letter
 *       - At least one number
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterInput'
 *           example:
 *             email: dev@example.com
 *             password: Secret123
 *     responses:
 *       201:
 *         description: Account created — returns JWT token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *             example:
 *               token: eyJhbGciOiJIUzI1NiIs...
 *               user:
 *                 id: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                 email: dev@example.com
 *                 storageQuotaBytes: "5368709120"
 *                 storageUsedBytes: "0"
 *                 createdAt: 2026-05-23T13:07:34.947Z
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
 *       Authenticates a user and returns a JWT token.
 *
 *       Uses timing-safe comparison to prevent email enumeration attacks.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginInput'
 *           example:
 *             email: dev@example.com
 *             password: Secret123
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *             example:
 *               token: eyJhbGciOiJIUzI1NiIs...
 *               user:
 *                 id: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                 email: dev@example.com
 *                 storageQuotaBytes: "5368709120"
 *                 storageUsedBytes: "1048576"
 *                 createdAt: 2026-05-23T13:07:34.947Z
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
 *       - bearerAuth: []
 *     description: |
 *       Returns the currently authenticated user's profile,
 *       storage usage, and quota information.
 *     responses:
 *       200:
 *         description: User profile with storage usage
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 email:
 *                   type: string
 *                 storageQuotaBytes:
 *                   type: string
 *                   example: "5368709120"
 *                 storageUsedBytes:
 *                   type: string
 *                   example: "1048576"
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *             example:
 *               id: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *               email: dev@example.com
 *               storageQuotaBytes: "5368709120"
 *               storageUsedBytes: "1048576"
 *               createdAt: 2026-05-23T13:07:34.947Z
 *       401:
 *         description: Missing or invalid JWT
 */
router.get(
  '/me',
  authenticate as any,
  authController.me as any,
);

export default router;