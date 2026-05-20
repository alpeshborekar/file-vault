import { Request } from 'express';

// JWT token payload
export interface JwtPayload {
  userId: string;
  email: string;
  iat?: number;
  exp?: number;
}

// Request with authenticated user
export interface AuthRequest extends Request {
  user: JwtPayload;
}

// Cursor-based pagination response
export interface CursorPage<T> {
  data: T[];
  pagination: {
    nextCursor: string | null;
    hasMore: boolean;
    limit: number;
  };
}

// Background file processing job
export interface ProcessingJobPayload {
  fileId: string;
  storageKey: string;
  mimeType: string;
  userId: string;
}

// Multipart upload initialization
export interface MultipartInitPayload {
  filename: string;
  mimeType: string;
  totalSize: number;
  chunkCount: number;
}

// Multipart upload completion
export interface MultipartCompletePayload {
  parts: { partNumber: number; etag: string }[];
}