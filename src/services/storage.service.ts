import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';
import fs from 'fs/promises';
import fss from 'fs';
import path from 'path';
import { s3Client } from '../config/s3';
import { config } from '../config';
import { logger } from '../utils/logger';

// Interface 

export interface StorageDriver {
  // Upload a stream to storage. Used for single-file uploads.
  put(key: string, stream: Readable, size: number, mimeType: string): Promise<void>;

  getSignedDownloadUrl(key: string, ttlSeconds: number): Promise<string>;

  
  initiateMultipart(key: string, mimeType: string): Promise<string>;


  uploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
    body: Buffer,
  ): Promise<string>;

  //Generate pre-signed URLs so the client uploads parts directly to S3.
  getPresignedPartUrls(
    key: string,
    uploadId: string,
    partCount: number,
    ttlSeconds: number,
  ): Promise<{ partNumber: number; url: string }[]>;

  //Finalise a multipart upload after all parts are received.
  completeMultipart(
    key: string,
    uploadId: string,
    parts: { PartNumber: number; ETag: string }[],
  ): Promise<void>;

  //Abort an in-progress multipart upload (cleanup orphaned parts)
  abortMultipart(key: string, uploadId: string): Promise<void>;

  //Delete a stored object. 
  delete(key: string): Promise<void>;

  //Check whether a key exists
  exists(key: string): Promise<boolean>;
}

//S3 / MinIO Driver 

class S3Driver implements StorageDriver {
  private readonly bucket = config.storage.aws.bucket;

  async put(key: string, stream: Readable, size: number, mimeType: string) {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: stream,
        ContentLength: size,
        ContentType: mimeType,
      }),
    );
    logger.debug({ key, size }, 'S3 put complete');
  }

  async getSignedDownloadUrl(key: string, ttlSeconds: number): Promise<string> {
    return getSignedUrl(
      s3Client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: ttlSeconds },
    );
  }

  async initiateMultipart(key: string, mimeType: string): Promise<string> {
    const res = await s3Client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: mimeType,
      }),
    );
    return res.UploadId!;
  }

  async uploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
    body: Buffer,
  ): Promise<string> {
    const res = await s3Client.send(
      new UploadPartCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
        Body: body,
        ContentLength: body.length,
      }),
    );
    return res.ETag!;
  }

  async getPresignedPartUrls(
    key: string,
    uploadId: string,
    partCount: number,
    ttlSeconds: number,
  ): Promise<{ partNumber: number; url: string }[]> {
    const urls = await Promise.all(
      Array.from({ length: partCount }, (_, i) => i + 1).map(async (partNumber) => {
        const url = await getSignedUrl(
          s3Client,
          new UploadPartCommand({
            Bucket: this.bucket,
            Key: key,
            UploadId: uploadId,
            PartNumber: partNumber,
          }),
          { expiresIn: ttlSeconds },
        );
        return { partNumber, url };
      }),
    );
    return urls;
  }

  async completeMultipart(
    key: string,
    uploadId: string,
    parts: { PartNumber: number; ETag: string }[],
  ): Promise<void> {
    await s3Client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: { Parts: parts },
      }),
    );
    logger.debug({ key, uploadId }, 'S3 multipart complete');
  }

  async abortMultipart(key: string, uploadId: string): Promise<void> {
    await s3Client.send(
      new AbortMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
      }),
    );
    logger.warn({ key, uploadId }, 'S3 multipart aborted');
  }

  async delete(key: string): Promise<void> {
    await s3Client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    logger.debug({ key }, 'S3 object deleted');
  }

  async exists(key: string): Promise<boolean> {
    try {
      await s3Client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return true;
    } catch {
      return false;
    }
  }
}

//Local Disk Driver (dev / test fallback) 

class LocalDriver implements StorageDriver {
  private readonly base = path.resolve(config.storage.localDir);

  private filePath(key: string) {
    return path.join(this.base, key);
  }

  private async ensureDir(filePath: string) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
  }

  async put(key: string, stream: Readable, _size: number, _mimeType: string) {
    const dest = this.filePath(key);
    await this.ensureDir(dest);
    const ws = fss.createWriteStream(dest);
    await new Promise<void>((resolve, reject) => {
      stream.pipe(ws);
      ws.on('finish', resolve);
      ws.on('error', reject);
    });
  }

  async getSignedDownloadUrl(key: string, ttlSeconds: number): Promise<string> {
    // Local: return a signed path token (HMAC-based) served by a static endpoint
    const crypto = await import('crypto');
    const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
    const sig = crypto
      .createHmac('sha256', config.jwt.secret)
      .update(`${key}:${expires}`)
      .digest('hex')
      .slice(0, 16);
    return `http://localhost:${config.port}/internal/files/${encodeURIComponent(key)}?expires=${expires}&sig=${sig}`;
  }

  // Multipart not supported locally — fall back to single-put
  async initiateMultipart(_key: string, _mimeType: string): Promise<string> {
    return `local-${Date.now()}`;
  }

  async uploadPart(_key: string, _uploadId: string, _partNumber: number, body: Buffer): Promise<string> {
    return Buffer.from(body).toString('base64').slice(0, 16); // fake ETag
  }

  async getPresignedPartUrls(
    key: string,
    uploadId: string,
    partCount: number,
    _ttlSeconds: number,
  ): Promise<{ partNumber: number; url: string }[]> {
    return Array.from({ length: partCount }, (_, i) => ({
      partNumber: i + 1,
      url: `http://localhost:${config.port}/upload/multipart/${uploadId}/part/${i + 1}?key=${key}`,
    }));
  }

  async completeMultipart(_key: string, _uploadId: string, _parts: { PartNumber: number; ETag: string }[]): Promise<void> {
    // No-op for local
  }

  async abortMultipart(_key: string, _uploadId: string): Promise<void> {
    // No-op for local
  }

  async delete(key: string): Promise<void> {
    try {
      await fs.unlink(this.filePath(key));
    } catch {
      // Already gone — idempotent
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.filePath(key));
      return true;
    } catch {
      return false;
    }
  }
}

//Export correct driver based on config 

export const storage: StorageDriver =
  config.storage.driver === 's3' ? new S3Driver() : new LocalDriver();