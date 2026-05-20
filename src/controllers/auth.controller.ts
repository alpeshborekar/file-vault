import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.service';
import { AuthRequest } from '../models/types';
import type { RegisterInput, LoginInput } from '../models/schemas';

export const authController = {
  /**
   * POST /auth/register
   * Body: { email, password }
   */
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.register(req.body as RegisterInput);
      res.status(201).json({
        message: 'Account created successfully',
        ...result,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /auth/login
   * Body: { email, password }
   */
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.login(req.body as LoginInput);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /auth/me
   * Returns authenticated user's profile + storage stats
   */
  async me(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const profile = await authService.getProfile(req.user.userId);
      res.status(200).json(profile);
    } catch (err) {
      next(err);
    }
  },
};