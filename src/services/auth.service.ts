import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { userRepo } from '../repositories/user.repo';
import { Errors } from '../utils/errors';
import { JwtPayload } from '../models/types';
import type { RegisterInput, LoginInput } from '../models/schemas';

const SALT_ROUNDS = 12;

export const authService = {
  async register(input: RegisterInput) {
    // 1. Check email uniqueness
    const existing = await userRepo.findByEmail(input.email);
    if (existing) {
      throw Errors.conflict('An account with this email already exists');
    }

    // 2. Hash password — bcrypt with cost factor 12
    const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

    // 3. Persist
    const user = await userRepo.create({ email: input.email, passwordHash });

    // 4. Issue token
    const token = signToken({ userId: user.id, email: user.email });

    return {
      token,
      user: sanitize(user),
    };
  },

  async login(input: LoginInput) {
    // 1. Lookup user — constant-time compare regardless of existence
    const user = await userRepo.findByEmail(input.email);
    const passwordHash = user?.passwordHash ?? '$2a$12$invalidhashtopreventtiming';

    const valid = await bcrypt.compare(input.password, passwordHash);

    // Reject after compare (prevents timing oracle on email existence)
    if (!user || !valid) {
      throw Errors.unauthorized('Invalid email or password');
    }

    const token = signToken({ userId: user.id, email: user.email });

    return {
      token,
      user: sanitize(user),
    };
  },

  async getProfile(userId: string) {
    const user = await userRepo.findById(userId);
    if (!user) throw Errors.notFound('User not found');
    return sanitize(user);
  },
};

// Helpers 

function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn as jwt.SignOptions['expiresIn'],
  });
}

function sanitize(user: {
  id: string;
  email: string;
  storageQuotaBytes: bigint;
  storageUsedBytes: bigint;
  createdAt: Date;
}) {
  return {
    id: user.id,
    email: user.email,
    storageQuotaBytes: user.storageQuotaBytes.toString(),
    storageUsedBytes: user.storageUsedBytes.toString(),
    createdAt: user.createdAt,
  };
}