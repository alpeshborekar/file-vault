import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';

import { redis } from '../config/redis';
import { AuthRequest } from '../models/types';

function makeStore(prefix: string) {
  return new RedisStore({
    sendCommand: (...args: string[]) =>
      redis.call(
        args[0],
        ...args.slice(1),
      ) as Promise<any>,

    prefix: `rl:${prefix}:`,
  });
}

/** 10 uploads per user per minute */
export const uploadRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,

  keyGenerator: (req) =>
    (req as AuthRequest).user?.userId ??
    req.ip ??
    'anon',

  store: makeStore('upload'),

  standardHeaders: true,
  legacyHeaders: false,

  message: {
    error: 'RATE_LIMITED',
    message: 'Too many uploads. Retry in 60s.',
  },

  skipSuccessfulRequests: false,
});

/** 5 login attempts per IP per 15 minutes */
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,

  keyGenerator: (req) =>
    req.ip ?? 'anon',

  store: makeStore('auth'),

  standardHeaders: true,
  legacyHeaders: false,

  message: {
    error: 'RATE_LIMITED',
    message:
      'Too many auth attempts. Retry in 15m.',
  },
});

/** 100 reads per user per minute */
export const readRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 100,

  keyGenerator: (req) =>
    (req as AuthRequest).user?.userId ??
    req.ip ??
    'anon',

  store: makeStore('read'),

  standardHeaders: true,
  legacyHeaders: false,

  message: {
    error: 'RATE_LIMITED',
    message: 'Too many requests. Slow down.',
  },
});