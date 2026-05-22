import { Readable } from 'stream';
import { fileRepo } from '../repositories/file.repo';
import { userRepo } from '../repositories/user.repo';
import { storage } from './storage.service';
import { cache, CacheKey } from './cache.service';
import { enqueueProcessing } from '../workers/queues';
import { hashStream, buildStorageKey, buildVersionKey } from '../utils/hash';
import { Errors } from '../utils/errors';
import { config } from '../config';
import { logger } from '../utils/logger';
import type { MultipartInitInput, MultipartCompleteInput } from '../models/schemas';

//Allowed MIME types 

const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/pdf',
  'video/mp4', 'video/webm',
  'audio/mpeg', 'audio/wav',
  'text/plain', 'text/csv',
  'application/zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

// Single-file upload 

export interface UploadResult {
  fileId: string;
  name: string;
  sizeBytes: string;
  mimeType: string;
  status: string;
  deduplicated: boolean;
  createdAt: Date;
}

export async function uploadFile(
  userId: string,
  filename: string,
  mimeType: string,
  sizeBytes: number,
  stream: Readable,
): Promise<UploadResult> {
  // 1. Validate MIME type
  if (!ALLOWED_MIME.has(mimeType)) {
    throw Errors.unsupported(`File type '${mimeType}' is not allowed`);
  }

  // 2. Validate file size
  if (sizeBytes > config.upload.maxFileSizeBytes) {
    throw Errors.tooLarge(
      `File exceeds maximum size of ${config.upload.maxFileSizeBytes / 1024 / 1024}MB`,
    );
  }

  // 3. Check storage quota
  const hasQuota = await userRepo.hasQuota(userId, BigInt(sizeBytes));
  if (!hasQuota) {
    throw Errors.forbidden('Storage quota exceeded');
  }

  // 4. Hash while streaming — never hold entire file in memory longer than needed
  const { sha256, buffer } = await hashStream(stream);

  // 5. Deduplication check — O(1) indexed lookup by sha256
  const existing = await fileRepo.findByHash(sha256);
  if (existing) {
    logger.info({ sha256, existingId: existing.id, userId }, 'Dedup hit — reusing blob');

    const file = await fileRepo.createDeduped(
      userId,
      filename,
      mimeType,
      BigInt(sizeBytes),
      sha256,
      existing.storageKey,
    );

    // Quota: still counts against user's used bytes (they "own" this copy)
    await userRepo.incrementStorageUsed(userId, BigInt(sizeBytes));
    await cache.invalidate(CacheKey.userFiles(userId));

    return formatResult(file, true);
  }

  // 6. New file — store blob
  const storageKey = buildStorageKey(userId, sha256, filename);
  await storage.put(storageKey, Readable.from(buffer), sizeBytes, mimeType);

  // 7. Persist metadata
  const file = await fileRepo.create({
    userId,
    name:       filename,
    mimeType,
    sizeBytes:  BigInt(sizeBytes),
    sha256Hash: sha256,
    storageKey,
    status:     'processing',
  });

  // 8. Update quota usage
  await userRepo.incrementStorageUsed(userId, BigInt(sizeBytes));

  // 9. Invalidate user file listing cache
  await cache.invalidate(CacheKey.userFiles(userId));

  // 10. Enqueue background processing (scan + thumbnail)
  await enqueueProcessing({ fileId: file.id, storageKey, mimeType, userId });

  logger.info({ fileId: file.id, sha256, sizeBytes }, 'File uploaded');
  return formatResult(file, false);
}

//File versioning 

export async function uploadNewVersion(
  userId: string,
  fileId: string,
  sizeBytes: number,
  stream: Readable,
): Promise<{ versionNum: number; fileId: string }> {
  const file = await fileRepo.findById(fileId);
  if (!file || file.isDeleted) throw Errors.notFound('File not found');
  if (file.userId !== userId)  throw Errors.forbidden('Access denied');

  const hasQuota = await userRepo.hasQuota(userId, BigInt(sizeBytes));
  if (!hasQuota) throw Errors.forbidden('Storage quota exceeded');

  const { sha256, buffer } = await hashStream(stream);

  // Snapshot current storageKey as a version record
  const latest = await fileRepo.getLatestVersion(fileId);
  const versionNum = (latest?.versionNum ?? 0) + 1;

  // Archive the current blob pointer as version N
  await fileRepo.createVersion({
    fileId,
    versionNum,
    storageKey: file.storageKey,
    sizeBytes:  file.sizeBytes,
    sha256Hash: file.sha256Hash,
  });

  // Upload new blob
  const newKey = buildVersionKey(userId, fileId, versionNum + 1);
  await storage.put(newKey, Readable.from(buffer), sizeBytes, file.mimeType);

  // Update the file row to point at the new blob
  await fileRepo.updateStorageKey(fileId, newKey);
  await fileRepo.updateStatus(fileId, 'processing');

  // Quota + cache
  await userRepo.incrementStorageUsed(userId, BigInt(sizeBytes));
  await cache.invalidate(CacheKey.file(fileId), CacheKey.userFiles(userId));

  await enqueueProcessing({ fileId, storageKey: newKey, mimeType: file.mimeType, userId });

  logger.info({ fileId, versionNum: versionNum + 1 }, 'New file version uploaded');
  return { versionNum: versionNum + 1, fileId };
}

// Multipart / chunked upload 

export interface MultipartInitResult {
  uploadId: string;
  fileId: string;
  storageKey: string;
  chunkUrls: { partNumber: number; url: string }[];
}


export async function initMultipartUpload(
  userId: string,
  input: MultipartInitInput,
): Promise<MultipartInitResult> {
  if (!ALLOWED_MIME.has(input.mimeType)) {
    throw Errors.unsupported(`File type '${input.mimeType}' is not allowed`);
  }
  if (input.totalSize > config.upload.maxFileSizeBytes) {
    throw Errors.tooLarge('File too large');
  }

  const hasQuota = await userRepo.hasQuota(userId, BigInt(input.totalSize));
  if (!hasQuota) throw Errors.forbidden('Storage quota exceeded');

  // Create a placeholder file row so we can track state
  const placeholder = await fileRepo.create({
    userId,
    name:       input.filename,
    mimeType:   input.mimeType,
    sizeBytes:  BigInt(input.totalSize),
    sha256Hash: 'pending',   // computed on complete
    storageKey: 'pending',
    status:     'processing',
  });

  const storageKey = buildStorageKey(userId, placeholder.id, input.filename);
  const uploadId   = await storage.initiateMultipart(storageKey, input.mimeType);

  // Pre-sign URLs for all parts — client uploads in parallel
  const PART_URL_TTL = 3600; // 1 hour — enough for large uploads
  const chunkUrls = await storage.getPresignedPartUrls(
    storageKey,
    uploadId,
    input.chunkCount,
    PART_URL_TTL,
  );

  // Persist uploadId so complete endpoint can verify it
  await fileRepo.updateStorageKey(placeholder.id, storageKey);

  // Stash multipart state in Redis (TTL: 24h — abort orphans after that)
  const { redis } = await import('../config/redis');
  await redis.set(
    `multipart:${placeholder.id}`,
    JSON.stringify({ uploadId, storageKey, userId }),
    'EX',
    86400,
  );

  logger.info({ fileId: placeholder.id, uploadId, chunkCount: input.chunkCount }, 'Multipart initiated');

  return {
    uploadId,
    fileId:     placeholder.id,
    storageKey,
    chunkUrls,
  };
}


export async function completeMultipartUpload(
  userId: string,
  fileId: string,
  input: MultipartCompleteInput,
): Promise<UploadResult> {
  const { redis } = await import('../config/redis');
  const raw = await redis.get(`multipart:${fileId}`);
  if (!raw) throw Errors.notFound('Upload session not found or expired');

  const session = JSON.parse(raw) as { uploadId: string; storageKey: string; userId: string };
  if (session.userId !== userId) throw Errors.forbidden('Access denied');

  const parts = input.parts.map((p) => ({
    PartNumber: p.partNumber,
    ETag:       p.etag,
  }));

  await storage.completeMultipart(session.storageKey, session.uploadId, parts);

  // Update file row: mark status ready-ish, real status set by worker
  await fileRepo.updateStatus(fileId, 'processing');
  await redis.del(`multipart:${fileId}`);

  await userRepo.incrementStorageUsed(userId, BigInt(0)); // will be set properly by worker
  await cache.invalidate(CacheKey.userFiles(userId));

  const file = await fileRepo.findById(fileId);
  if (!file) throw Errors.notFound('File not found after completion');

  await enqueueProcessing({
    fileId,
    storageKey: session.storageKey,
    mimeType:   file.mimeType,
    userId,
  });

  logger.info({ fileId, parts: parts.length }, 'Multipart upload completed');
  return formatResult(file, false);
}

// Helpers 

function formatResult(
  file: { id: string; name: string; sizeBytes: bigint; mimeType: string; status: string; createdAt: Date },
  deduplicated: boolean,
): UploadResult {
  return {
    fileId:      file.id,
    name:        file.name,
    sizeBytes:   file.sizeBytes.toString(),
    mimeType:    file.mimeType,
    status:      file.status,
    deduplicated,
    createdAt:   file.createdAt,
  };
}