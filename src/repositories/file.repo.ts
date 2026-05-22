import { prisma } from '../config/db';
import { File, FileVersion, FileStatus, Prisma } from '@prisma/client';

// Types 

export interface CreateFileInput {
  userId: string;
  name: string;
  mimeType: string;
  sizeBytes: bigint;
  sha256Hash: string;
  storageKey: string;
  status?: FileStatus;
  expiresAt?: Date;
}

export interface FileListOptions {
  userId: string;
  cursor?: string;
  limit: number;
  status?: FileStatus;
  sort: 'created_at' | 'name' | 'size_bytes';
  order: 'asc' | 'desc';
}

//Repository 

export const fileRepo = {
  //Single file 

  async findById(id: string): Promise<File | null> {
    return prisma.file.findUnique({ where: { id } });
  },

  async findByHash(sha256Hash: string): Promise<File | null> {
    // Dedup: find any non-deleted file with this hash (any owner)
    return prisma.file.findFirst({
      where: { sha256Hash, isDeleted: false },
    });
  },

  async create(data: CreateFileInput): Promise<File> {
    return prisma.file.create({
      data: {
        userId:     data.userId,
        name:       data.name,
        mimeType:   data.mimeType,
        sizeBytes:  data.sizeBytes,
        sha256Hash: data.sha256Hash,
        storageKey: data.storageKey,
        status:     data.status ?? 'processing',
        expiresAt:  data.expiresAt,
      },
    });
  },


  async createDeduped(
    userId: string,
    name: string,
    mimeType: string,
    sizeBytes: bigint,
    sha256Hash: string,
    storageKey: string,
  ): Promise<File> {
    return prisma.file.create({
      data: {
        userId,
        name,
        mimeType,
        sizeBytes,
        sha256Hash,
        storageKey,
        status: 'ready', // blob already scanned — reuse result
      },
    });
  },

  async updateStatus(id: string, status: FileStatus): Promise<void> {
    await prisma.file.update({ where: { id }, data: { status } });
  },

  async updateStorageKey(id: string, storageKey: string): Promise<void> {
    await prisma.file.update({ where: { id }, data: { storageKey } });
  },

  async updateThumbnailKey(id: string, thumbnailKey: string): Promise<void> {
    await prisma.file.update({ where: { id }, data: { thumbnailKey } });
  },

  async softDelete(id: string, userId: string): Promise<File | null> {
    return prisma.file.updateMany({
      where: { id, userId, isDeleted: false },
      data:  { isDeleted: true },
    }) as unknown as File | null;
  },

  //Listing 
  async listByUser(opts: FileListOptions): Promise<File[]> {
    const sortField: Record<string, keyof Prisma.FileOrderByWithRelationInput> = {
      created_at: 'createdAt',
      name:       'name',
      size_bytes: 'sizeBytes',
    };

    return prisma.file.findMany({
      where: {
        userId:    opts.userId,
        isDeleted: false,
        ...(opts.status && { status: opts.status }),
        // Cursor: only return records after the cursor ID
        ...(opts.cursor && {
          createdAt: {
            [opts.order === 'desc' ? 'lt' : 'gt']: await prisma.file
              .findUnique({ where: { id: opts.cursor }, select: { createdAt: true } })
              .then((f) => f?.createdAt),
          },
        }),
      },
      orderBy: { [sortField[opts.sort]]: opts.order },
      take:    opts.limit + 1, // fetch one extra to detect hasMore
    });
  },

  async countByUser(userId: string): Promise<number> {
    return prisma.file.count({ where: { userId, isDeleted: false } });
  },

  // Versions 

  async getLatestVersion(fileId: string): Promise<FileVersion | null> {
    return prisma.fileVersion.findFirst({
      where:   { fileId },
      orderBy: { versionNum: 'desc' },
    });
  },

  async listVersions(fileId: string): Promise<FileVersion[]> {
    return prisma.fileVersion.findMany({
      where:   { fileId },
      orderBy: { versionNum: 'asc' },
    });
  },

  async createVersion(data: {
    fileId:     string;
    versionNum: number;
    storageKey: string;
    sizeBytes:  bigint;
    sha256Hash: string;
  }): Promise<FileVersion> {
    return prisma.fileVersion.create({ data });
  },


  async hasShareAccess(fileId: string, userId: string): Promise<boolean> {
    const share = await prisma.fileShare.findFirst({
      where: {
        fileId,
        sharedWithId: userId,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
    });
    return !!share;
  },

  async createPublicShare(
    fileId: string,
    token: string,
    expiresAt?: Date,
  ) {
    return prisma.fileShare.create({
      data: { fileId, token, expiresAt },
    });
  },

  async findByShareToken(token: string) {
    return prisma.fileShare.findUnique({
      where: { token },
      include: { file: true },
    });
  },

  // Expired file cleanup (used by cron) 

  async findExpired(): Promise<File[]> {
    return prisma.file.findMany({
      where: {
        isDeleted: false,
        expiresAt: { lt: new Date() },
      },
    });
  },
};