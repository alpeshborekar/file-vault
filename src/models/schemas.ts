import { z } from 'zod';

//auth 
export const RegisterSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// File Upload 

export const MultipartInitSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  totalSize: z.number().positive(),
  chunkCount: z.number().int().min(1).max(10000),
});

export const MultipartCompleteSchema = z.object({
  parts: z
    .array(
      z.object({
        partNumber: z.number().int().min(1),
        etag: z.string().min(1),
      }),
    )
    .min(1),
});

// ─── File Listing 

export const FileListQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['processing', 'ready', 'infected', 'failed']).optional(),
  sort: z.enum(['created_at', 'name', 'size_bytes']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

//  Share 

export const CreateShareSchema = z.object({
  sharedWithEmail: z.string().email().optional(), // null = public link
  permission: z.enum(['read', 'write']).default('read'),
  expiresInSeconds: z.number().int().positive().optional(),
});

export type RegisterInput        = z.infer<typeof RegisterSchema>;
export type LoginInput           = z.infer<typeof LoginSchema>;
export type MultipartInitInput   = z.infer<typeof MultipartInitSchema>;
export type MultipartCompleteInput = z.infer<typeof MultipartCompleteSchema>;
export type FileListQuery        = z.infer<typeof FileListQuerySchema>;
export type CreateShareInput     = z.infer<typeof CreateShareSchema>;