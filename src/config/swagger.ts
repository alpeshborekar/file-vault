import swaggerJsdoc from 'swagger-jsdoc';
import { config } from './index';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',

    info: {
      title: 'CloudStash API',

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
- Real-time upload progress via WebSockets

## Architecture
- Upload → SHA-256 deduplication → S3-compatible storage → BullMQ processing
- Download → Redis cache lookup → PostgreSQL fallback → pre-signed URL generation
- Large files → direct multipart upload flow

## Authentication
Protected endpoints require a Bearer JWT.

Get token from:
\`POST /auth/login\`
      `,

      contact: {
        name: 'CloudStash',
        url: 'https://github.com/alpeshborekar/cloudstash',
      },
    },

    servers: [
      {
        url: 'https://cloudstash-4cb1.onrender.com',
        description: 'Production server',
      },

      {
        url: `http://localhost:${config.port}`,
        description: 'Local development',
      },
    ],

    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token from POST /auth/login',
        },
      },

      schemas: {
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