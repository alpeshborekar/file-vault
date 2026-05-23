import { Router } from 'express';
import { fileController } from '../controllers/file.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  readRateLimit,
  uploadRateLimit,
} from '../middleware/ratelimit.middleware';
import { upload } from '../middleware/multer.middleware';
import { uploadController } from '../controllers/upload.controller';
import {
  FileListQuerySchema,
  CreateShareSchema,
} from '../models/schemas';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Files
 *   description: File retrieval, management, versioning and sharing
 */

/**
 * @swagger
 * /files/shared/{token}:
 *   get:
 *     summary: Resolve a public share token
 *     tags: [Files]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Share resolved
 *       404:
 *         description: Token not found
 *       410:
 *         description: Share expired
 */
router.get(
  '/shared/:token',
  fileController.resolveShare,
);

/**
 * @swagger
 * /files/storage:
 *   get:
 *     summary: Get storage usage summary
 *     tags: [Files]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Storage summary returned
 */
router.get(
  '/storage',
  authenticate as any,
  readRateLimit,
  fileController.storageSummary as any,
);

/**
 * @swagger
 * /files:
 *   get:
 *     summary: List files
 *     tags: [Files]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [processing, ready, infected, failed]
 *     responses:
 *       200:
 *         description: File list returned
 */
router.get(
  '/',
  authenticate as any,
  readRateLimit,
  validate(FileListQuerySchema, 'query'),
  fileController.list as any,
);

/**
 * @swagger
 * /files/{id}:
 *   get:
 *     summary: Get file metadata
 *     tags: [Files]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: File returned
 *       403:
 *         description: Access denied
 *       404:
 *         description: File not found
 */
router.get(
  '/:id',
  authenticate as any,
  readRateLimit,
  fileController.getById as any,
);

/**
 * @swagger
 * /files/{id}:
 *   delete:
 *     summary: Delete file
 *     tags: [Files]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: File deleted
 *       404:
 *         description: File not found
 */
router.delete(
  '/:id',
  authenticate as any,
  fileController.remove as any,
);

/**
 * @swagger
 * /files/{id}/versions:
 *   get:
 *     summary: List file versions
 *     tags: [Files]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Version list returned
 */
router.get(
  '/:id/versions',
  authenticate as any,
  readRateLimit,
  fileController.versions as any,
);

/**
 * @swagger
 * /files/{fileId}/versions:
 *   post:
 *     summary: Upload a new version
 *     tags: [Files]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Version uploaded
 */
router.post(
  '/:fileId/versions',
  authenticate as any,
  uploadRateLimit,
  upload.single('file'),
  uploadController.newVersion as any,
);

/**
 * @swagger
 * /files/{id}/share:
 *   post:
 *     summary: Create share link
 *     tags: [Files]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               expiresInSeconds:
 *                 type: number
 *     responses:
 *       201:
 *         description: Share link created
 */
router.post(
  '/:id/share',
  authenticate as any,
  validate(CreateShareSchema),
  fileController.share as any,
);

export default router;