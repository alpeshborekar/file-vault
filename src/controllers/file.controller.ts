import { Request, Response, NextFunction } from 'express';
import {
  getFileById,
  listFiles,
  deleteFile,
  listVersions,
  createShareLink,
  resolveShareToken,
  getStorageSummary,
} from '../services/file.service';
import { AuthRequest } from '../models/types';
import type { FileListQuery, CreateShareInput } from '../models/schemas';

export const fileController = {
  async list(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await listFiles(
        req.user.userId,
        req.query as unknown as FileListQuery,
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  async storageSummary(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const result = await getStorageSummary(req.user.userId);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  async getById(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await getFileById(req.user.userId, req.params.id);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  async remove(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      await deleteFile(req.user.userId, req.params.id);
      res.status(200).json({
        id:      req.params.id,
        deleted: true,
        message: 'File deleted. Storage will be reclaimed shortly.',
      });
    } catch (err) {
      next(err);
    }
  },

  async versions(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await listVersions(req.user.userId, req.params.id);
      res.status(200).json({ fileId: req.params.id, versions: result });
    } catch (err) {
      next(err);
    }
  },

  async share(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await createShareLink(
        req.user.userId,
        req.params.id,
        req.body as CreateShareInput,
      );
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },

  async resolveShare(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await resolveShareToken(req.params.token);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
};