import { Router } from 'express';
import { fileController } from '../controllers/file.controller';
import { progressController } from '../controllers/progress.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { readRateLimit, uploadRateLimit } from '../middleware/ratelimit.middleware';
import { upload } from '../middleware/multer.middleware';
import { uploadController } from '../controllers/upload.controller';
import { FileListQuerySchema, CreateShareSchema } from '../models/schemas';

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
 *     summary: Resolve a public share token — no auth required
 *     tags: [Files]
 *     description: |
 *       The share token IS the credential. No JWT needed.
 *       Returns a pre-signed S3 download URL valid for 15 minutes.
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *           example: a3f9b2c1d4e5f6a7b8c9d0e1f2a3b4c5
 *     responses:
 *       200:
 *         description: Share resolved — download URL returned
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 file:        { $ref: '#/components/schemas/FileDetail' }
 *                 downloadUrl: { type: string }
 *                 downloadUrlExpiresAt: { type: string, format: date-time }
 *       404:
 *         description: Token not found
 *       410:
 *         description: Share link has expired
 */
router.get('/shared/:token', fileController.resolveShare);

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
 *         description: Quota and usage breakdown
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StorageSummary'
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
 *     summary: List files (cursor-paginated)
 *     tags: [Files]
 *     security:
 *       - BearerAuth: []
 *     description: |
 *       Uses cursor-based pagination (not offset) to avoid drift on concurrent inserts.
 *       The cursor is the `createdAt` of the last item on the current page.
 *     parameters:
 *       - in: query
 *         name: cursor
 *         schema: { type: string, format: uuid }
 *         description: ID of last item from previous page
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 100 }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [processing, ready, infected, failed] }
 *       - in: query
 *         name: sort
 *         schema: { type: string, enum: [created_at, name, size_bytes], default: created_at }
 *       - in: query
 *         name: order
 *         schema: { type: string, enum: [asc, desc], default: desc }
 *     responses:
 *       200:
 *         description: Paginated file list
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FileListResponse'
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
 * /files/{id}/progress:
 *   get:
 *     summary: Get upload processing progress (REST fallback)
 *     tags: [Files]
 *     security:
 *       - BearerAuth: []
 *     description: |
 *       REST fallback for environments where WebSocket is unavailable.
 *       For real-time progress, use the Socket.IO `file:progress` event instead.
 *       Poll every 2-3 seconds if WebSocket is not connected.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Current processing state
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 fileId:    { type: string }
 *                 status:    { type: string }
 *                 jobState:  { type: string, enum: [waiting, active, completed, failed] }
 *                 percent:   { type: number, example: 70 }
 *                 stage:     { type: string, enum: [queued, scanning, thumbnail, finalising, complete, failed] }
 *                 message:   { type: string, example: "Generating preview..." }
 */
router.get(
  '/:id/progress',
  authenticate as any,
  readRateLimit,
  progressController.getProgress as any,
);

/**
 * @swagger
 * /files/{id}:
 *   get:
 *     summary: Get file metadata + presigned download URL
 *     tags: [Files]
 *     security:
 *       - BearerAuth: []
 *     description: |
 *       Metadata served from Redis cache (5 min TTL).
 *       Returns a **pre-signed S3 URL** valid for 15 minutes.
 *       The client downloads the file directly from S3 — bytes never proxy through this server.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: File metadata with download URL
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FileDetail'
 *       403:
 *         description: Access denied or file infected
 *       404:
 *         description: File not found
 *       410:
 *         description: File has expired
 *   delete:
 *     summary: Soft-delete a file
 *     tags: [Files]
 *     security:
 *       - BearerAuth: []
 *     description: |
 *       Marks the file as deleted. S3 blob removal is deferred to the cleanup cron.
 *       Dedup-safe: blob only deleted when no other user references the same storageKey.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: File deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:      { type: string }
 *                 deleted: { type: boolean, example: true }
 *                 message: { type: string }
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

router.delete(
  '/:id',
  authenticate as any,
  fileController.remove as any,
);

/**
 * @swagger
 * /files/{id}/versions:
 *   get:
 *     summary: List all archived versions of a file
 *     tags: [Files]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Version list with per-version download URLs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 fileId:   { type: string }
 *                 versions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:          { type: string }
 *                       versionNum:  { type: integer }
 *                       sizeBytes:   { type: string }
 *                       downloadUrl: { type: string }
 *                       createdAt:   { type: string, format: date-time }
 *   post:
 *     summary: Upload a new version of an existing file
 *     tags: [Files]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file: { type: string, format: binary }
 *     responses:
 *       201:
 *         description: New version uploaded
 */
router.get(
  '/:id/versions',
  authenticate as any,
  readRateLimit,
  fileController.versions as any,
);

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
 *     summary: Create a public share link
 *     tags: [Files]
 *     security:
 *       - BearerAuth: []
 *     description: |
 *       Generates a 32-char hex token. Anyone with the token can download
 *       the file without a JWT. Optionally set a TTL via `expiresInSeconds`.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ShareInput'
 *     responses:
 *       201:
 *         description: Share link created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ShareResponse'
 */
router.post(
  '/:id/share',
  authenticate as any,
  validate(CreateShareSchema),
  fileController.share as any,
);

export default router;