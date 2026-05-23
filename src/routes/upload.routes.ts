import { Router } from 'express';
import { uploadController } from '../controllers/upload.controller';
import { upload } from '../middleware/multer.middleware';
import { validate } from '../middleware/validate.middleware';
import { uploadRateLimit } from '../middleware/ratelimit.middleware';
import { authenticate } from '../middleware/auth.middleware';

import {
  MultipartInitSchema,
  MultipartCompleteSchema,
} from '../models/schemas';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Upload
 *   description: File upload endpoints (single + chunked multipart)
 */

/**
 * @swagger
 * /upload:
 *   post:
 *     summary: Upload a single file
 *     tags: [Upload]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       Accepts multipart/form-data with a `file` field.
 *
 *       ## Deduplication
 *       SHA-256 hash is computed while streaming.
 *       If identical content already exists:
 *       - returns HTTP 200
 *       - `deduplicated: true`
 *       - reuses existing S3/MinIO object
 *       - avoids duplicate storage + rescanning
 *
 *       ## Processing Pipeline
 *       Uploaded files are queued for:
 *       - virus scanning
 *       - thumbnail generation
 *       - metadata extraction
 *
 *       Status flow:
 *       `processing → ready`
 *       or
 *       `processing → infected/failed`
 *
 *       ## Architecture
 *       - Metadata stored in PostgreSQL
 *       - Binary objects stored in MinIO/S3
 *       - Background jobs handled by BullMQ
 *       - Redis used for queues + caching
 *
 *       ## Rate Limit
 *       10 uploads per user per minute.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: File to upload (max 500MB)
 *     responses:
 *       201:
 *         description: New file uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FileUploadResponse'
 *             example:
 *               fileId: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *               name: report.pdf
 *               mimeType: application/pdf
 *               sizeBytes: "204800"
 *               status: processing
 *               deduplicated: false
 *               createdAt: 2026-05-23T13:07:34.947Z
 *
 *       200:
 *         description: Duplicate file — existing object reused
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/FileUploadResponse'
 *                 - type: object
 *                   properties:
 *                     deduplicated:
 *                       type: boolean
 *                       example: true
 *                     status:
 *                       type: string
 *                       example: ready
 *             example:
 *               fileId: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *               name: report.pdf
 *               mimeType: application/pdf
 *               sizeBytes: "204800"
 *               status: ready
 *               deduplicated: true
 *               createdAt: 2026-05-23T13:07:34.947Z
 *
 *       400:
 *         description: No file provided
 *
 *       401:
 *         description: Missing or invalid JWT
 *
 *       413:
 *         description: File exceeds maximum size (500MB)
 *
 *       415:
 *         description: File type not allowed
 *
 *       429:
 *         description: Rate limit exceeded
 */
router.post(
  '/',
  authenticate as any,
  uploadRateLimit,
  upload.single('file'),
  uploadController.single as any,
);

/**
 * @swagger
 * /upload/multipart/init:
 *   post:
 *     summary: Initiate a multipart upload for large files
 *     tags: [Upload]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       Used for files larger than 10MB.
 *
 *       The server generates:
 *       - multipart upload session
 *       - pre-signed upload URLs
 *       - upload metadata
 *
 *       Client uploads chunks directly to MinIO/S3.
 *
 *       Benefits:
 *       - resumable uploads
 *       - parallel chunk uploads
 *       - lower backend memory usage
 *       - supports very large files
 *
 *       After uploading all parts:
 *       call `POST /upload/multipart/{fileId}/complete`
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MultipartInitInput'
 *           example:
 *             fileName: movie.mp4
 *             mimeType: video/mp4
 *             sizeBytes: "104857600"
 *             totalParts: 10
 *     responses:
 *       200:
 *         description: Multipart upload initialized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MultipartInitResponse'
 *
 *       400:
 *         description: Validation error
 *
 *       401:
 *         description: Missing or invalid JWT
 *
 *       415:
 *         description: File type not allowed
 */
router.post(
  '/multipart/init',
  authenticate as any,
  uploadRateLimit,
  validate(MultipartInitSchema),
  uploadController.multipartInit as any,
);

/**
 * @swagger
 * /upload/multipart/{fileId}/complete:
 *   post:
 *     summary: Complete a multipart upload
 *     tags: [Upload]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       Finalizes multipart upload after all chunks
 *       have been uploaded to MinIO/S3.
 *
 *       Server performs:
 *       - CompleteMultipartUpload
 *       - database persistence
 *       - queue enqueueing
 *       - background processing trigger
 *     parameters:
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Multipart upload file ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - parts
 *             properties:
 *               parts:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     partNumber:
 *                       type: integer
 *                       example: 1
 *                     etag:
 *                       type: string
 *                       example: abc123etag
 *           example:
 *             parts:
 *               - partNumber: 1
 *                 etag: abc123etag
 *               - partNumber: 2
 *                 etag: def456etag
 *     responses:
 *       201:
 *         description: Multipart upload completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FileUploadResponse'
 *             example:
 *               fileId: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *               name: movie.mp4
 *               mimeType: video/mp4
 *               sizeBytes: "104857600"
 *               status: processing
 *               deduplicated: false
 *               createdAt: 2026-05-23T13:07:34.947Z
 *
 *       401:
 *         description: Missing or invalid JWT
 *
 *       404:
 *         description: Upload session not found or expired
 */
router.post(
  '/multipart/:fileId/complete',
  authenticate as any,
  validate(MultipartCompleteSchema),
  uploadController.multipartComplete as any,
);

export default router;