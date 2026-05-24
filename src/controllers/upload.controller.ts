import {
  Response,
  NextFunction,
} from 'express';

import fs from 'fs';

import {
  uploadFile,
  uploadNewVersion,
  initMultipartUpload,
  completeMultipartUpload,
} from '../services/upload.service';

import { AuthRequest } from '../models/types';

import type {
  MultipartInitInput,
  MultipartCompleteInput,
} from '../models/schemas';

export const uploadController = {
  async single(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const file = req.file;

      if (!file) {
        res.status(400).json({
          error: 'BAD_REQUEST',
          message: 'No file provided',
        });

        return;
      }

      // IMPORTANT FIX:
      // use file stream instead of file.buffer
      const stream =
        fs.createReadStream(file.path);

      const result =
        await uploadFile(
          req.user.userId,
          file.originalname,
          file.mimetype,
          file.size,
          stream,
        );

      res
        .status(
          result.deduplicated
            ? 200
            : 201,
        )
        .json(result);

    } catch (err) {
      next(err);
    }
  },

  async multipartInit(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const result =
        await initMultipartUpload(
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
      const result =
        await completeMultipartUpload(
          req.user.userId,
          req.params.fileId,
          req.body as MultipartCompleteInput,
        );

      res.status(201).json(result);

    } catch (err) {
      next(err);
    }
  },

  async newVersion(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const file = req.file;

      if (!file) {
        res.status(400).json({
          error: 'BAD_REQUEST',
          message: 'No file provided',
        });

        return;
      }

      const stream =
        fs.createReadStream(file.path);

      const result =
        await uploadNewVersion(
          req.user.userId,
          req.params.fileId,
          file.size,
          stream,
        );

      res.status(201).json(result);

    } catch (err) {
      next(err);
    }
  },
};