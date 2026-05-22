import { Response, NextFunction } from 'express';
import { Readable } from 'stream';
import {
  uploadFile,
  uploadNewVersion,
  initMultipartUpload,
  completeMultipartUpload,
} from '../services/upload.service';
import { AuthRequest } from '../models/types';
import type { MultipartInitInput, MultipartCompleteInput } from '../models/schemas';

export const uploadController = {
  async single(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'No file provided' });
        return;
      }

      const result = await uploadFile(
        req.user.userId,
        file.originalname,
        file.mimetype,
        file.size,
        Readable.from(file.buffer),
      );

      // 200 for dedup (file already exists), 201 for new upload
      res.status(result.deduplicated ? 200 : 201).json(result);
    } catch (err) {
      next(err);
    }
  },
  async multipartInit(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await initMultipartUpload(
        req.user.userId,
        req.body as MultipartInitInput,
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
  async multipartComplete(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const result = await completeMultipartUpload(
        req.user.userId,
        req.params.fileId,
        req.body as MultipartCompleteInput,
      );
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },

  async newVersion(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'No file provided' });
        return;
      }

      const result = await uploadNewVersion(
        req.user.userId,
        req.params.fileId,
        file.size,
        Readable.from(file.buffer),
      );

      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
};