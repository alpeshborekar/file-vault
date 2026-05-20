import { S3Client } from '@aws-sdk/client-s3';
import { config } from './index';

const s3Config: ConstructorParameters<typeof S3Client>[0] = {
  region: config.storage.aws.region,
};

// MinIO 
if (config.storage.aws.endpoint) {
  s3Config.endpoint = config.storage.aws.endpoint;
  s3Config.forcePathStyle = config.storage.aws.forcePathStyle;
}

if (config.storage.aws.accessKeyId && config.storage.aws.secretAccessKey) {
  s3Config.credentials = {
    accessKeyId: config.storage.aws.accessKeyId,
    secretAccessKey: config.storage.aws.secretAccessKey,
  };
}

export const s3Client = new S3Client(s3Config);