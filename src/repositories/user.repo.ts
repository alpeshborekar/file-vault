import { prisma } from '../config/db';
import { User } from '@prisma/client';

export const userRepo = {
  async findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { email } });
  },

  async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  },

  async create(data: { email: string; passwordHash: string }): Promise<User> {
    return prisma.user.create({
      data: {
        email: data.email,
        passwordHash: data.passwordHash,
      },
    });
  },

  async incrementStorageUsed(userId: string, bytes: bigint): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { storageUsedBytes: { increment: bytes } },
    });
  },

  async decrementStorageUsed(userId: string, bytes: bigint): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { storageUsedBytes: { decrement: bytes } },
    });
  },

  /** Returns true if user has enough quota remaining */
  async hasQuota(userId: string, requiredBytes: bigint): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { storageQuotaBytes: true, storageUsedBytes: true },
    });
    if (!user) return false;
    return user.storageUsedBytes + requiredBytes <= user.storageQuotaBytes;
  },
};