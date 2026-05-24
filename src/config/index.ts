import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config({
  path: '../.env',
});

const envSchema = z.object({
  NODE_ENV: z
    .enum([
      'development',
      'production',
      'test',
    ])
    .default('development'),

  PORT: z.coerce
    .number()
    .default(3000),

  APP_URL: z.string().url().optional(),

  DATABASE_URL: z.string().url(),

  REDIS_URL: z.string().url(),

  JWT_SECRET: z.string().min(16),

  JWT_EXPIRES_IN: z
    .string()
    .default('7d'),

  STORAGE_DRIVER: z
    .enum(['s3', 'local'])
    .default('local'),

  AWS_REGION: z
    .string()
    .default('us-east-1'),

  AWS_ACCESS_KEY_ID:
    z.string().optional(),

  AWS_SECRET_ACCESS_KEY:
    z.string().optional(),

  AWS_S3_BUCKET:
    z.string().optional(),

  S3_ENDPOINT:
    z.string().url().optional(),

  S3_FORCE_PATH_STYLE: z.coerce
    .boolean()
    .default(false),

  MAX_FILE_SIZE_MB: z.coerce
    .number()
    .default(500),

  SIGNED_URL_TTL_SECONDS:
    z.coerce.number().default(900),

  CHUNK_SIZE_MB: z.coerce
    .number()
    .default(10),
});

const parsed =
  envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    '❌  Invalid environment variables:',
  );

  console.error(
    parsed.error.flatten().fieldErrors,
  );

  process.exit(1);
}

const env = parsed.data;

// Validate S3 vars only if using S3
if (env.STORAGE_DRIVER === 's3') {
  if (
    !env.AWS_ACCESS_KEY_ID ||
    !env.AWS_SECRET_ACCESS_KEY ||
    !env.AWS_S3_BUCKET
  ) {
    console.error(
      '❌ Missing required S3 environment variables',
    );

    process.exit(1);
  }
}

export const config = {
  env: env.NODE_ENV,

  port: env.PORT,

  appUrl:
    env.APP_URL ||
    `http://localhost:${env.PORT}`,

  db: {
    url: env.DATABASE_URL,
  },

  redis: {
    url: env.REDIS_URL,
  },

  jwt: {
    secret: env.JWT_SECRET,

    expiresIn: env.JWT_EXPIRES_IN,
  },

  storage: {
    driver: env.STORAGE_DRIVER,

    aws: {
      region: env.AWS_REGION,

      accessKeyId:
        env.AWS_ACCESS_KEY_ID,

      secretAccessKey:
        env.AWS_SECRET_ACCESS_KEY,

      bucket: env.AWS_S3_BUCKET,

      endpoint: env.S3_ENDPOINT,

      forcePathStyle:
        env.S3_FORCE_PATH_STYLE,
    },

    localDir: 'uploads',
  },

  upload: {
    maxFileSizeBytes:
      env.MAX_FILE_SIZE_MB *
      1024 *
      1024,

    signedUrlTtlSeconds:
      env.SIGNED_URL_TTL_SECONDS,

    chunkSizeBytes:
      env.CHUNK_SIZE_MB *
      1024 *
      1024,
  },

  isDev:
    env.NODE_ENV === 'development',

  isProd:
    env.NODE_ENV === 'production',
};