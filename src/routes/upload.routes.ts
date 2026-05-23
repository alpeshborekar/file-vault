import { Router } from 'express';
import { uploadController } from '../controllers/upload.controller';
import { upload } from '../middleware/multer.middleware';
import { validate } from '../middleware/validate.middleware';
import { uploadRateLimit } from '../middleware/ratelimit.middleware';
import { MultipartInitSchema, MultipartCompleteSchema } from '../models/schemas';

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
 *       - BearerAuth: []
 *     description: |
 *       Accepts multipart/form-data with a `file` field.
 *
 *       **Deduplication:** SHA-256 hash computed while streaming.
 *       If identical content already exists, returns 200 with `deduplicated: true`
 *       and reuses the existing S3 blob — no re-upload, no re-scan.
 *
 *       **Processing:** File is queued for virus scan + thumbnail generation.
 *       Status transitions: `processing` → `ready` (or `infected`/`failed`).
 *
 *       **Rate limit:** 10 uploads per user per minute.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
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
 *       200:
 *         description: Duplicate file — reusing existing blob
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/FileUploadResponse'
 *                 - type: object
 *                   properties:
 *                     deduplicated: { type: boolean, example: true }
 *                     status:       { type: string,  example: ready }
 *       400:
 *         description: No file provided
 *       401:
 *         description: Missing or invalid JWT
 *       413:
 *         description: File exceeds maximum size (500MB)
 *       415:
 *         description: File type not allowed
 *       429:
 *         description: Rate limit exceeded
 */
router.post(
  '/',
  uploadRateLimit,
  upload.single('file'),
  uploadController.single as any,
);

/**
 * @swagger
 * /upload/multipart/init:
 *   post:
 *     summary: Initiate a chunked upload for large files
 *     tags: [Upload]
 *     security:
 *       - BearerAuth: []
 *     description: |
 *       **For files larger than 10MB.**
 *
 *       Returns N pre-signed S3 URLs — one per chunk.
 *       The client uploads each chunk **directly to S3** in parallel.
 *       Your API server handles only metadata — zero binary data passes through it.
 *
 *       After all parts are uploaded, call `POST /upload/multipart/:id/complete`.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MultipartInitInput'
 *     responses:
 *       200:
 *         description: Multipart upload initiated — returns presigned part URLs
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MultipartInitResponse'
 *       400:
 *         description: Validation error
 *       415:
 *         description: File type not allowed
 */
router.post(
  '/multipart/init',
  uploadRateLimit,
  validate(MultipartInitSchema),
  uploadController.multipartInit as any,
);

/**
 * @swagger
 * /upload/multipart/{fileId}/complete:
 *   post:
 *     summary: Complete a chunked upload
 *     tags: [Upload]
 *     security:
 *       - BearerAuth: []
 *     description: |
 *       Called after all parts have been uploaded to S3.
 *       Server calls `S3 CompleteMultipartUpload` and enqueues background processing.
 *     parameters:
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [parts]
 *             properties:
 *               parts:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     partNumber: { type: integer, example: 1 }
 *                     etag:       { type: string,  example: "abc123" }
 *     responses:
 *       201:
 *         description: Upload completed and queued for processing
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FileUploadResponse'
 *       404:
 *         description: Upload session not found or expired (24h TTL)
 */
router.post(
  '/multipart/:fileId/complete',
  validate(MultipartCompleteSchema),
  uploadController.multipartComplete as any,
);

export default router;