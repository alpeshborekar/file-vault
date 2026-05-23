import { fileRepo } from '../repositories/file.repo';
import { userRepo } from '../repositories/user.repo';
import { storage } from './storage.service';
import { cache, CacheKey, TTL } from './cache.service';
import { Errors } from '../utils/errors';
import { config } from '../config';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

import type { File } from '@prisma/client';
import type {
  FileListQuery,
  CreateShareInput,
} from '../models/schemas';

import type { CursorPage } from '../models/types';

// FILE RETRIEVAL

export interface FileDetail {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: string;
  status: string;
  versionCount: number;
  thumbnailUrl: string | null;
  downloadUrl: string;
  downloadUrlExpiresAt: Date;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function getFileById(
  requestingUserId: string,
  fileId: string,
): Promise<FileDetail> {

  logger.info('STEP 1');

  const file = await cache.getOrSet<File>(
    CacheKey.file(fileId),
    () => fileRepo.findById(fileId) as Promise<File>,
    TTL.FILE_META,
  );

  logger.info('STEP 2');

  if (!file || file.isDeleted) {
    throw Errors.notFound('File not found');
  }

  const isOwner = file.userId === requestingUserId;

  const isShared =
    !isOwner &&
    (await fileRepo.hasShareAccess(fileId, requestingUserId));

  if (!isOwner && !isShared) {
    throw Errors.forbidden(
      'You do not have access to this file',
    );
  }

  logger.info('STEP 3');

  if (
    file.expiresAt &&
    new Date(file.expiresAt) < new Date()
  ) {
    throw Errors.gone(
      'This file has expired and is no longer available',
    );
  }

  if (file.status === 'infected') {
    throw Errors.forbidden(
      'This file has been flagged and is unavailable',
    );
  }

  logger.info('STEP 4');

  const downloadUrl =
    await storage.getSignedDownloadUrl(
      file.storageKey,
      config.upload.signedUrlTtlSeconds,
    );

  logger.info('STEP 5');

  const downloadUrlExpiresAt = new Date(
    Date.now() +
    config.upload.signedUrlTtlSeconds * 1000,
  );

  const thumbnailUrl = file.thumbnailKey
    ? await storage.getSignedDownloadUrl(
        file.thumbnailKey,
        config.upload.signedUrlTtlSeconds,
      )
    : null;

  logger.info('STEP 6');

  const versions = await fileRepo.listVersions(fileId);

  logger.info('STEP 7');

  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes.toString(),
    status: file.status,
    versionCount: versions.length + 1,
    thumbnailUrl,
    downloadUrl,
    downloadUrlExpiresAt,
    expiresAt: file.expiresAt,
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
  };
}

// FILE LISTING

export interface FileListItem {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: string;
  status: string;
  thumbnailUrl: string | null;
  expiresAt: Date | null;
  createdAt: Date;
}

export async function listFiles(
  userId: string,
  query: FileListQuery,
): Promise<CursorPage<FileListItem>> {

  const rows = await fileRepo.listByUser({
    userId,
    cursor: query.cursor,
    limit: query.limit,
    status: query.status,
    sort: query.sort,
    order: query.order,
  });

  const hasMore = rows.length > query.limit;

  const items = hasMore
    ? rows.slice(0, query.limit)
    : rows;

  const nextCursor = hasMore
    ? items[items.length - 1].id
    : null;

  const data: FileListItem[] = await Promise.all(
    items.map(async (f) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      sizeBytes: f.sizeBytes.toString(),
      status: f.status,

      thumbnailUrl: f.thumbnailKey
        ? await storage.getSignedDownloadUrl(
            f.thumbnailKey,
            config.upload.signedUrlTtlSeconds,
          )
        : null,

      expiresAt: f.expiresAt,
      createdAt: f.createdAt,
    })),
  );

  return {
    data,
    pagination: {
      nextCursor,
      hasMore,
      limit: query.limit,
    },
  };
}

// SOFT DELETE

export async function deleteFile(
  userId: string,
  fileId: string,
): Promise<void> {

  const file = await fileRepo.findById(fileId);

  if (!file || file.isDeleted) {
    throw Errors.notFound('File not found');
  }

  if (file.userId !== userId) {
    throw Errors.forbidden('Access denied');
  }

  await fileRepo.softDelete(fileId, userId);

  await userRepo.decrementStorageUsed(
    userId,
    file.sizeBytes,
  );

  await cache.invalidate(
    CacheKey.file(fileId),
    CacheKey.userFiles(userId),
  );

  logger.info(
    { fileId, userId },
    'File soft-deleted',
  );
}

// FILE VERSIONS

export interface VersionItem {
  id: string;
  versionNum: number;
  sizeBytes: string;
  sha256Hash: string;
  downloadUrl: string;
  createdAt: Date;
}

export async function listVersions(
  userId: string,
  fileId: string,
): Promise<VersionItem[]> {

  const file = await fileRepo.findById(fileId);

  if (!file || file.isDeleted) {
    throw Errors.notFound('File not found');
  }

  if (file.userId !== userId) {
    throw Errors.forbidden('Access denied');
  }

  const versions = await fileRepo.listVersions(fileId);

  return Promise.all(
    versions.map(async (v) => ({
      id: v.id,
      versionNum: v.versionNum,
      sizeBytes: v.sizeBytes.toString(),
      sha256Hash: v.sha256Hash,

      downloadUrl:
        await storage.getSignedDownloadUrl(
          v.storageKey,
          config.upload.signedUrlTtlSeconds,
        ),

      createdAt: v.createdAt,
    })),
  );
}

// FILE SHARING

export interface ShareResult {
  token: string;
  shareUrl: string;
  permission: string;
  expiresAt: Date | null;
}

export async function createShareLink(
  userId: string,
  fileId: string,
  input: CreateShareInput,
): Promise<ShareResult> {

  const file = await fileRepo.findById(fileId);

  if (!file || file.isDeleted) {
    throw Errors.notFound('File not found');
  }

  if (file.userId !== userId) {
    throw Errors.forbidden(
      'Only the owner can share this file',
    );
  }

  const token = uuidv4().replace(/-/g, '');

  const expiresAt = input.expiresInSeconds
    ? new Date(
        Date.now() +
        input.expiresInSeconds * 1000,
      )
    : null;

  await fileRepo.createPublicShare(
    fileId,
    token,
    expiresAt ?? undefined,
  );

  const shareUrl =
    `${process.env.APP_BASE_URL ?? `http://localhost:${config.port}`}` +
    `/files/shared/${token}`;

  logger.info(
    { fileId, token, expiresAt },
    'Share link created',
  );

  return {
    token,
    shareUrl,
    permission: input.permission,
    expiresAt,
  };
}

// RESOLVE SHARE TOKEN

export async function resolveShareToken(token: string) {

  const share = await fileRepo.findByShareToken(token);

  if (!share) {
    throw Errors.notFound('Share link not found');
  }

  if (
    share.expiresAt &&
    new Date(share.expiresAt) < new Date()
  ) {
    throw Errors.gone(
      'This share link has expired',
    );
  }

  const file = share.file;

  if (
    file.isDeleted ||
    file.status === 'infected'
  ) {
    throw Errors.gone(
      'The shared file is no longer available',
    );
  }

  const downloadUrl =
    await storage.getSignedDownloadUrl(
      file.storageKey,
      config.upload.signedUrlTtlSeconds,
    );

  return {
    file: {
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes.toString(),
      status: file.status,
      thumbnailUrl: null,
      expiresAt: file.expiresAt,
      createdAt: file.createdAt,
    },

    downloadUrl,

    downloadUrlExpiresAt: new Date(
      Date.now() +
      config.upload.signedUrlTtlSeconds * 1000,
    ),
  };
}

// STORAGE SUMMARY

export async function getStorageSummary(
  userId: string,
) {

  const user = await userRepo.findById(userId);

  if (!user) {
    throw Errors.notFound('User not found');
  }

  const fileCount =
    await fileRepo.countByUser(userId);

  return {
    usedBytes: user.storageUsedBytes.toString(),
    quotaBytes: user.storageQuotaBytes.toString(),

    usedPercent: Number(
      (user.storageUsedBytes * 100n) /
      user.storageQuotaBytes,
    ),

    fileCount,
  };
}