import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { Errors } from '../utils/errors';
import { AuthRequest, JwtPayload } from '../models/types';

/**
 * Verifies the Bearer JWT in the Authorization header.
 * Attaches decoded payload to req.user on success.
 * Throws 401 on missing / expired / tampered tokens.
 */
export function authenticate(
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    throw Errors.unauthorized('Authorization header missing or malformed');
  }

  const token = header.split(' ')[1];

  try {
    const payload = jwt.verify(token, config.jwt.secret) as JwtPayload;
    req.user = payload;
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw Errors.unauthorized('Token expired');
    }
    throw Errors.unauthorized('Invalid token');
  }
}

/** Optional auth — populates req.user if token present, never throws */
export function optionalAuth(
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next();

  try {
    const token = header.split(' ')[1];
    req.user = jwt.verify(token, config.jwt.secret) as JwtPayload;
  } catch {
    // Swallow — optional auth never blocks the request
  }

  next();
}