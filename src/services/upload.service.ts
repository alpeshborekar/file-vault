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
import { broadcastProgress } from './progress.service';
import {
  uploadsTotal,
  uploadBytesTotal,
  dedupHitsTotal,
} from '../config/metrics';
import type { MultipartInitInput, MultipartCompleteInput } from '../models/schemas';

// Allowed MIME types 

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

//Single-file upload 

export interface UploadResult {
  fileId:       string;
  name:         string;
  sizeBytes:    string;
  mimeType:     string;
  status:       string;
  deduplicated: boolean;
  createdAt:    Date;
}

export async function uploadFile(
  userId: string,
  filename: string,
  mimeType: string,
  sizeBytes: number,
  stream: Readable,
): Promise<UploadResult> {
  if (!ALLOWED_MIME.has(mimeType)) {
    throw Errors.unsupported(`File type '${mimeType}' is not allowed`);
  }

  if (sizeBytes > config.upload.maxFileSizeBytes) {
    throw Errors.tooLarge(
      `File exceeds maximum size of ${config.upload.maxFileSizeBytes / 1024 / 1024}MB`,
    );
  }

  const hasQuota = await userRepo.hasQuota(userId, BigInt(sizeBytes));
  if (!hasQuota) throw Errors.forbidden('Storage quota exceeded');

  // Hash while streaming — single pass, no double read
  const { sha256, buffer } = await hashStream(stream);

  // Deduplication check
  const existing = await fileRepo.findByHash(sha256);
  if (existing) {
    logger.info({ sha256, existingId: existing.id, userId }, 'Dedup hit');
    dedupHitsTotal.inc();
    uploadsTotal.inc({ type: 'single', deduplicated: 'true' });

    const file = await fileRepo.createDeduped(
      userId, filename, mimeType, BigInt(sizeBytes), sha256, existing.storageKey,
    );

    await userRepo.incrementStorageUsed(userId, BigInt(sizeBytes));
    await cache.invalidate(CacheKey.userFiles(userId));
    return formatResult(file, true);
  }

  // New file — store blob
  const storageKey = buildStorageKey(userId, sha256, filename);
  await storage.put(storageKey, Readable.from(buffer), sizeBytes, mimeType);

  const file = await fileRepo.create({
    userId, name: filename, mimeType,
    sizeBytes: BigInt(sizeBytes), sha256Hash: sha256,
    storageKey, status: 'processing',
  });

  await userRepo.incrementStorageUsed(userId, BigInt(sizeBytes));
  await cache.invalidate(CacheKey.userFiles(userId));

  uploadsTotal.inc({ type: 'single', deduplicated: 'false' });
  uploadBytesTotal.inc(sizeBytes);

  await enqueueProcessing({ fileId: file.id, storageKey, mimeType, userId });

  broadcastProgress(userId, file.id, 0);

  logger.info({ fileId: file.id, sha256, sizeBytes }, 'File uploaded');
  return formatResult(file, false);
}

// File versioning 

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
  const latest             = await fileRepo.getLatestVersion(fileId);
  const versionNum         = (latest?.versionNum ?? 0) + 1;

  // Snapshot current blob as a version record
  await fileRepo.createVersion({
    fileId,
    versionNum,
    storageKey: file.storageKey,
    sizeBytes:  file.sizeBytes,
    sha256Hash: file.sha256Hash,
  });

  const newKey = buildVersionKey(userId, fileId, versionNum + 1);
  await storage.put(newKey, Readable.from(buffer), sizeBytes, file.mimeType);

  await fileRepo.updateStorageKey(fileId, newKey);
  await fileRepo.updateStatus(fileId, 'processing');

  await userRepo.incrementStorageUsed(userId, BigInt(sizeBytes));
  await cache.invalidate(CacheKey.file(fileId), CacheKey.userFiles(userId));

  await enqueueProcessing({ fileId, storageKey: newKey, mimeType: file.mimeType, userId });
  broadcastProgress(userId, fileId, 0);

  logger.info({ fileId, versionNum: versionNum + 1 }, 'New version uploaded');
  return { versionNum: versionNum + 1, fileId };
}

//Multipart upload 

export interface MultipartInitResult {
  uploadId:   string;
  fileId:     string;
  storageKey: string;
  chunkUrls:  { partNumber: number; url: string }[];
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

  const placeholder = await fileRepo.create({
    userId,
    name:       input.filename,
    mimeType:   input.mimeType,
    sizeBytes:  BigInt(input.totalSize),
    sha256Hash: 'pending',
    storageKey: 'pending',
    status:     'processing',
  });

  const storageKey = buildStorageKey(userId, placeholder.id, input.filename);
  const uploadId   = await storage.initiateMultipart(storageKey, input.mimeType);

  const chunkUrls = await storage.getPresignedPartUrls(
    storageKey, uploadId, input.chunkCount, 3600,
  );

  await fileRepo.updateStorageKey(placeholder.id, storageKey);

  const { redis } = require('../config/redis');
  await redis.set(
    `multipart:${placeholder.id}`,
    JSON.stringify({ uploadId, storageKey, userId }),
    'EX',
    86400,
  );

  logger.info(
    { fileId: placeholder.id, uploadId, chunkCount: input.chunkCount },
    'Multipart initiated',
  );

  return { uploadId, fileId: placeholder.id, storageKey, chunkUrls };
}

export async function completeMultipartUpload(
  userId: string,
  fileId: string,
  input: MultipartCompleteInput,
): Promise<UploadResult> {
  const { redis } = require('../config/redis');
  const raw = await redis.get(`multipart:${fileId}`);
  if (!raw) throw Errors.notFound('Upload session not found or expired');

  const session = JSON.parse(raw) as {
    uploadId: string; storageKey: string; userId: string;
  };
  if (session.userId !== userId) throw Errors.forbidden('Access denied');

  const parts = input.parts.map((p) => ({
    PartNumber: p.partNumber,
    ETag:       p.etag,
  }));

  await storage.completeMultipart(session.storageKey, session.uploadId, parts);
  await fileRepo.updateStatus(fileId, 'processing');
  await redis.del(`multipart:${fileId}`);
  await cache.invalidate(CacheKey.userFiles(userId));

  const file = await fileRepo.findById(fileId);
  if (!file) throw Errors.notFound('File not found');

  await enqueueProcessing({
    fileId, storageKey: session.storageKey, mimeType: file.mimeType, userId,
  });

  logger.info({ fileId, parts: parts.length }, 'Multipart completed');
  return formatResult(file, false);
}

//Helpers 

function formatResult(
  file: {
    id: string; name: string; sizeBytes: bigint;
    mimeType: string; status: string; createdAt: Date;
  },
  deduplicated: boolean,
): UploadResult {
  return {
    fileId:       file.id,
    name:         file.name,
    sizeBytes:    file.sizeBytes.toString(),
    mimeType:     file.mimeType,
    status:       file.status,
    deduplicated,
    createdAt:    file.createdAt,
  };
}