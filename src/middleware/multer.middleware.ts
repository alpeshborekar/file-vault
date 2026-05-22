import multer from 'multer';
import { config } from '../config';
import { Errors } from '../utils/errors';

//Allowed MIME types 

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

//Multer config
export const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: config.upload.maxFileSizeBytes,
    files:    1,   // one file per request
    fields:   5,   // max non-file fields
  },

  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(
        Errors.unsupported(`File type '${file.mimetype}' is not allowed`) as any,
      );
    }
    cb(null, true);
  },
});