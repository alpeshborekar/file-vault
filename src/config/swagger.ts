import swaggerJsdoc from 'swagger-jsdoc';
import { config } from './index';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',

    info: {
      title: 'FileVault API',

      version: '1.0.0',

      description: `
Production-grade distributed file storage backend inspired by Google Drive / Dropbox.

## Features
- JWT authentication
- SHA-256 file deduplication
- S3 / MinIO object storage
- BullMQ background processing
- Redis caching
- Multipart uploads
- Pre-signed download URLs
- Rate limiting
- Swagger API documentation
- Prometheus metrics

## Architecture
- Upload → SHA-256 deduplication → S3/MinIO storage → BullMQ processing
- Download → Redis cache lookup → PostgreSQL fallback → pre-signed S3 URL
- Large files → direct multipart upload to S3-compatible storage

## Authentication
Protected endpoints require a Bearer JWT.

Get token from:
\`POST /auth/login\`
      `,

      contact: {
        name: 'FileVault',
        url: 'https://github.com/alpeshborekar/file-vault',
      },
    },

    servers: [
      {
        url: `http://localhost:${config.port}`,
        description: 'Local development',
      },
    ],

    components: {
      // ─────────────────────────────────────────────────────────────
      // SECURITY
      // ─────────────────────────────────────────────────────────────
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token from POST /auth/login',
        },
      },

      // ─────────────────────────────────────────────────────────────
      // SCHEMAS
      // ─────────────────────────────────────────────────────────────
      schemas: {
        // ── AUTH ──────────────────────────────────────────────────
        RegisterInput: {
          type: 'object',

          required: ['email', 'password'],

          properties: {
            email: {
              type: 'string',
              format: 'email',
              example: 'dev@example.com',
            },

            password: {
              type: 'string',
              minLength: 8,
              example: 'Secret123',
            },
          },
        },

        LoginInput: {
          type: 'object',

          required: ['email', 'password'],

          properties: {
            email: {
              type: 'string',
              format: 'email',
              example: 'dev@example.com',
            },

            password: {
              type: 'string',
              example: 'Secret123',
            },
          },
        },

        AuthResponse: {
          type: 'object',

          properties: {
            token: {
              type: 'string',
              example: 'eyJhbGciOiJIUzI1NiIs...',
            },

            user: {
              type: 'object',

              properties: {
                id: {
                  type: 'string',
                  format: 'uuid',
                },

                email: {
                  type: 'string',
                },

                storageQuotaBytes: {
                  type: 'string',
                  example: '5368709120',
                },

                storageUsedBytes: {
                  type: 'string',
                  example: '0',
                },

                createdAt: {
                  type: 'string',
                  format: 'date-time',
                },
              },
            },
          },
        },

        // ── FILES ─────────────────────────────────────────────────
        FileUploadResponse: {
          type: 'object',

          properties: {
            fileId: {
              type: 'string',
              format: 'uuid',
            },

            name: {
              type: 'string',
              example: 'report.pdf',
            },

            mimeType: {
              type: 'string',
              example: 'application/pdf',
            },

            sizeBytes: {
              type: 'string',
              example: '204800',
            },

            status: {
              type: 'string',
              enum: ['processing', 'ready'],
              example: 'processing',
            },

            deduplicated: {
              type: 'boolean',
              example: false,
            },

            createdAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },

        FileDetail: {
          type: 'object',

          properties: {
            id: {
              type: 'string',
              format: 'uuid',
            },

            name: {
              type: 'string',
            },

            mimeType: {
              type: 'string',
            },

            sizeBytes: {
              type: 'string',
            },

            status: {
              type: 'string',
              enum: [
                'processing',
                'ready',
                'infected',
                'failed',
              ],
            },

            versionCount: {
              type: 'number',
            },

            downloadUrl: {
              type: 'string',
              description: 'Pre-signed S3 URL',
            },

            downloadUrlExpiresAt: {
              type: 'string',
              format: 'date-time',
            },

            thumbnailUrl: {
              type: 'string',
              nullable: true,
            },

            expiresAt: {
              type: 'string',
              format: 'date-time',
              nullable: true,
            },

            createdAt: {
              type: 'string',
              format: 'date-time',
            },

            updatedAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },

        FileListResponse: {
          type: 'object',

          properties: {
            data: {
              type: 'array',

              items: {
                $ref: '#/components/schemas/FileDetail',
              },
            },

            pagination: {
              type: 'object',

              properties: {
                nextCursor: {
                  type: 'string',
                  nullable: true,
                },

                hasMore: {
                  type: 'boolean',
                },

                limit: {
                  type: 'number',
                },
              },
            },
          },
        },

        // ── MULTIPART ─────────────────────────────────────────────
        MultipartInitInput: {
          type: 'object',

          required: [
            'filename',
            'mimeType',
            'totalSize',
            'chunkCount',
          ],

          properties: {
            filename: {
              type: 'string',
              example: 'large-video.mp4',
            },

            mimeType: {
              type: 'string',
              example: 'video/mp4',
            },

            totalSize: {
              type: 'number',
              example: 524288000,
            },

            chunkCount: {
              type: 'integer',
              example: 50,
            },
          },
        },

        MultipartInitResponse: {
          type: 'object',

          properties: {
            uploadId: {
              type: 'string',
            },

            fileId: {
              type: 'string',
              format: 'uuid',
            },

            storageKey: {
              type: 'string',
            },

            chunkUrls: {
              type: 'array',

              items: {
                type: 'object',

                properties: {
                  partNumber: {
                    type: 'integer',
                  },

                  url: {
                    type: 'string',
                    description: 'Pre-signed upload URL',
                  },
                },
              },
            },
          },
        },

        // ── SHARING ───────────────────────────────────────────────
        ShareInput: {
          type: 'object',

          properties: {
            permission: {
              type: 'string',
              enum: ['read', 'write'],
              default: 'read',
            },

            expiresInSeconds: {
              type: 'integer',
              example: 3600,
            },
          },
        },

        ShareResponse: {
          type: 'object',

          properties: {
            token: {
              type: 'string',
              example: 'a3f9b2c1d4e5',
            },

            shareUrl: {
              type: 'string',
              example:
                'http://localhost:3000/files/shared/token',
            },

            permission: {
              type: 'string',
            },

            expiresAt: {
              type: 'string',
              format: 'date-time',
              nullable: true,
            },
          },
        },

        // ── STORAGE ───────────────────────────────────────────────
        StorageSummary: {
          type: 'object',

          properties: {
            usedBytes: {
              type: 'string',
              example: '10485760',
            },

            quotaBytes: {
              type: 'string',
              example: '5368709120',
            },

            usedPercent: {
              type: 'number',
              example: 0.2,
            },

            fileCount: {
              type: 'integer',
              example: 5,
            },
          },
        },

        // ── ERRORS ────────────────────────────────────────────────
        ErrorResponse: {
          type: 'object',

          properties: {
            error: {
              type: 'string',
              example: 'UNAUTHORIZED',
            },

            message: {
              type: 'string',
              example: 'Invalid token',
            },
          },
        },
      },
    },
  },

  apis: ['./src/routes/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);