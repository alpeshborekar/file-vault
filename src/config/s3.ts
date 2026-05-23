import { S3Client } from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { config } from './index';

const s3Config: ConstructorParameters<typeof S3Client>[0] = {
  region: config.storage.aws.region,

  requestHandler: new NodeHttpHandler({
    connectionTimeout: 3000,
    socketTimeout: 3000,
  }),
};

// MinIO
if (config.storage.aws.endpoint) {
  s3Config.endpoint = config.storage.aws.endpoint;

  // REQUIRED for MinIO
  s3Config.forcePathStyle = true;
}

// Explicit credentials
if (
  config.storage.aws.accessKeyId &&
  config.storage.aws.secretAccessKey
) {
  s3Config.credentials = {
    accessKeyId: config.storage.aws.accessKeyId,
    secretAccessKey: config.storage.aws.secretAccessKey,
  };
}

export const s3Client = new S3Client(s3Config);