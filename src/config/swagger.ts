import swaggerJsdoc from 'swagger-jsdoc';
import { config } from './index';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title:       'CloudStash API',
      version:     '1.0.0',
      description: `
Production-grade file storage backend inspired by Google Drive / Dropbox.

## How it works
- **Upload** a file → SHA-256 deduplication check → store in S3 → BullMQ processes it
- **Download** → Redis cache lookup → PostgreSQL fallback → presigned S3 URL returned
- **Large files** → client uploads chunks directly to S3 via presigned URLs (server handles metadata only)

## Authentication
All protected endpoints require a Bearer JWT in the Authorization header.
Get a token from \`POST /auth/login\`.
      `,
      contact: {
        name:  'CloudStash',
        url:   'https://github.com/alpeshborekar/cloudstash',
      },
    },

    servers: [
      {
        url:         `http://localhost:${config.port}`,
        description: 'Local development',
      },
    ],

    // ── Security scheme ──────────────────────────────────────────────────────
    components: {
      securitySchemes: {
        BearerAuth: {
          type:         'http',
          scheme:       'bearer',
          bearerFormat: 'JWT',
          description:  'JWT token from POST /auth/login',
        },
      },

      schemas: {
        // ── Auth ─────────────────────────────────────────────────────────────
        RegisterInput: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email:    { type: 'string', format: 'email', example: 'dev@example.com' },
            password: { type: 'string', minLength: 8,    example: 'Secret123' },
          },
        },
        LoginInput: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email:    { type: 'string', format: 'email', example: 'dev@example.com' },
            password: { type: 'string',                  example: 'Secret123' },
          },
        },
        AuthResponse: {
          type: 'object',
          properties: {
            token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
            user: {
              type: 'object',
              properties: {
                id:                { type: 'string', format: 'uuid' },
                email:             { type: 'string' },
                storageQuotaBytes: { type: 'string', example: '5368709120' },
                storageUsedBytes:  { type: 'string', example: '0' },
                createdAt:         { type: 'string', format: 'date-time' },
              },
            },
          },
        },

        // ── File ─────────────────────────────────────────────────────────────
        FileUploadResponse: {
          type: 'object',
          properties: {
            fileId:       { type: 'string', format: 'uuid' },
            name:         { type: 'string', example: 'report.pdf' },
            mimeType:     { type: 'string', example: 'application/pdf' },
            sizeBytes:    { type: 'string', example: '204800' },
            status:       { type: 'string', enum: ['processing', 'ready'], example: 'processing' },
            deduplicated: { type: 'boolean', example: false },
            createdAt:    { type: 'string', format: 'date-time' },
          },
        },
        FileDetail: {
          type: 'object',
          properties: {
            id:                   { type: 'string', format: 'uuid' },
            name:                 { type: 'string' },
            mimeType:             { type: 'string' },
            sizeBytes:            { type: 'string' },
            status:               { type: 'string', enum: ['processing', 'ready', 'infected', 'failed'] },
            versionCount:         { type: 'number' },
            downloadUrl:          { type: 'string', description: 'Pre-signed S3 URL (expires in 15 min)' },
            downloadUrlExpiresAt: { type: 'string', format: 'date-time' },
            thumbnailUrl:         { type: 'string', nullable: true },
            expiresAt:            { type: 'string', format: 'date-time', nullable: true },
            createdAt:            { type: 'string', format: 'date-time' },
            updatedAt:            { type: 'string', format: 'date-time' },
          },
        },
        FileListResponse: {
          type: 'object',
          properties: {
            data: {
              type:  'array',
              items: { $ref: '#/components/schemas/FileDetail' },
            },
            pagination: {
              type: 'object',
              properties: {
                nextCursor: { type: 'string', nullable: true },
                hasMore:    { type: 'boolean' },
                limit:      { type: 'number' },
              },
            },
          },
        },

        // ── Multipart ─────────────────────────────────────────────────────────
        MultipartInitInput: {
          type: 'object',
          required: ['filename', 'mimeType', 'totalSize', 'chunkCount'],
          properties: {
            filename:   { type: 'string',  example: 'large-video.mp4' },
            mimeType:   { type: 'string',  example: 'video/mp4' },
            totalSize:  { type: 'number',  example: 524288000 },
            chunkCount: { type: 'integer', example: 50 },
          },
        },
        MultipartInitResponse: {
          type: 'object',
          properties: {
            uploadId:   { type: 'string' },
            fileId:     { type: 'string', format: 'uuid' },
            storageKey: { type: 'string' },
            chunkUrls: {
              type:  'array',
              items: {
                type: 'object',
                properties: {
                  partNumber: { type: 'integer' },
                  url:        { type: 'string', description: 'Pre-signed S3 upload URL' },
                },
              },
            },
          },
        },

        // ── Share ─────────────────────────────────────────────────────────────
        ShareInput: {
          type: 'object',
          properties: {
            permission:       { type: 'string', enum: ['read', 'write'], default: 'read' },
            expiresInSeconds: { type: 'integer', example: 3600, description: 'Optional TTL' },
          },
        },
        ShareResponse: {
          type: 'object',
          properties: {
            token:      { type: 'string', example: 'a3f9b2c1d4e5f6a7b8c9d0e1f2a3b4c5' },
            shareUrl:   { type: 'string', example: 'http://localhost:3000/files/shared/a3f9...' },
            permission: { type: 'string' },
            expiresAt:  { type: 'string', format: 'date-time', nullable: true },
          },
        },

        // ── Storage ───────────────────────────────────────────────────────────
        StorageSummary: {
          type: 'object',
          properties: {
            usedBytes:   { type: 'string', example: '10485760' },
            quotaBytes:  { type: 'string', example: '5368709120' },
            usedPercent: { type: 'number', example: 0.2 },
            fileCount:   { type: 'integer', example: 5 },
          },
        },

        // ── Errors ────────────────────────────────────────────────────────────
        ErrorResponse: {
          type: 'object',
          properties: {
            error:   { type: 'string', example: 'UNAUTHORIZED' },
            message: { type: 'string', example: 'Invalid token' },
          },
        },
      },
    },
  },

  // Pick up JSDoc @swagger comments from route files
  apis: ['./src/routes/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);