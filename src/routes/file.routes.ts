import { Router } from 'express';
import { fileController } from '../controllers/file.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { readRateLimit, uploadRateLimit } from '../middleware/ratelimit.middleware';
import { upload } from '../middleware/multer.middleware';
import { uploadController } from '../controllers/upload.controller';
import { FileListQuerySchema, CreateShareSchema, MultipartCompleteSchema } from '../models/schemas';

const router = Router();

//Public route (no auth — token IS the credential) 


router.get('/shared/:token', fileController.resolveShare);

router.get(
  '/storage',
  authenticate as any,
  readRateLimit,
  fileController.storageSummary as any,
);

router.get(
  '/',
  authenticate as any,
  readRateLimit,
  validate(FileListQuerySchema, 'query'),
  fileController.list as any,
);


router.get(
  '/:id',
  authenticate as any,
  readRateLimit,
  fileController.getById as any,
);

router.delete(
  '/:id',
  authenticate as any,
  fileController.remove as any,
);


router.get(
  '/:id/versions',
  authenticate as any,
  readRateLimit,
  fileController.versions as any,
);


router.post(
  '/:fileId/versions',
  authenticate as any,
  uploadRateLimit,
  upload.single('file'),
  uploadController.newVersion as any,
);


router.post(
  '/:id/share',
  authenticate as any,
  validate(CreateShareSchema),
  fileController.share as any,
);

export default router;