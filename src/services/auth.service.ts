import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { userRepo } from '../repositories/user.repo';
import { Errors } from '../utils/errors';
import { JwtPayload } from '../models/types';
import { authAttemptsTotal } from '../config/metrics';
import type { RegisterInput, LoginInput } from '../models/schemas';

const SALT_ROUNDS = 12;

export const authService = {
  async register(input: RegisterInput) {
    const existing = await userRepo.findByEmail(input.email);
    if (existing) {
      throw Errors.conflict('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
    const user         = await userRepo.create({ email: input.email, passwordHash });
    const token        = signToken({ userId: user.id, email: user.email });

    return { token, user: sanitize(user) };
  },

  async login(input: LoginInput) {
    const user         = await userRepo.findByEmail(input.email);
    // Always run bcrypt even for unknown emails — prevents timing oracle
    const passwordHash = user?.passwordHash ?? '$2a$12$invalidhashtopreventtiming';
    const valid        = await bcrypt.compare(input.password, passwordHash);

    if (!user || !valid) {
      authAttemptsTotal.inc({ result: 'failure' });
      throw Errors.unauthorized('Invalid email or password');
    }

    authAttemptsTotal.inc({ result: 'success' });
    const token = signToken({ userId: user.id, email: user.email });
    return { token, user: sanitize(user) };
  },

  async getProfile(userId: string) {
    const user = await userRepo.findById(userId);
    if (!user) throw Errors.notFound('User not found');
    return sanitize(user);
  },
};

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
    id:                user.id,
    email:             user.email,
    storageQuotaBytes: user.storageQuotaBytes.toString(),
    storageUsedBytes:  user.storageUsedBytes.toString(),
    createdAt:         user.createdAt,
  };
}