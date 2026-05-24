import multer from 'multer';

import fs from 'fs';
import path from 'path';

import { config } from '../config';

import { Errors } from '../utils/errors';

// Ensure temp upload dir exists
const tempDir = path.resolve('temp');

if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, {
    recursive: true,
  });
}

// Allowed MIME types
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',

  'application/pdf',

  'video/mp4',
  'video/webm',

  'audio/mpeg',
  'audio/wav',

  'text/plain',
  'text/csv',

  'application/zip',

  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',

  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

// Multer config
export const upload = multer({
  storage: multer.diskStorage({
    destination: (
      _req,
      _file,
      cb,
    ) => {
      cb(null, tempDir);
    },

    filename: (
      _req,
      file,
      cb,
    ) => {
      const unique =
        `${Date.now()}-${file.originalname}`;

      cb(null, unique);
    },
  }),

  limits: {
    fileSize:
      config.upload.maxFileSizeBytes,

    files: 1,

    fields: 5,
  },

  fileFilter: (
    _req,
    file,
    cb,
  ) => {
    if (
      !ALLOWED_MIME.has(
        file.mimetype,
      )
    ) {
      return cb(
        Errors.unsupported(
          `File type '${file.mimetype}' is not allowed`,
        ) as any,
      );
    }

    cb(null, true);
  },
});