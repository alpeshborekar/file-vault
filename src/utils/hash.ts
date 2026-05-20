import crypto from 'crypto';
import { Readable } from 'stream';

export async function hashStream(
  stream: Readable,
): Promise<{ sha256: string; buffer: Buffer }> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const chunks: Buffer[] = [];

    stream.on('data', (chunk: Buffer) => {
      hash.update(chunk);
      chunks.push(chunk);
    });

    stream.on('end', () => {
      resolve({
        sha256: hash.digest('hex'),
        buffer: Buffer.concat(chunks),
      });
    });

    stream.on('error', reject);
  });
}

/** Deterministic S3 object key for a given user + hash */
export function buildStorageKey(userId: string, sha256: string, filename: string): string {
  const ext = filename.includes('.') ? filename.split('.').pop() : '';
  return `files/${userId}/${sha256.slice(0, 8)}-${Date.now()}${ext ? `.${ext}` : ''}`;
}

export function buildVersionKey(userId: string, fileId: string, versionNum: number): string {
  return `versions/${userId}/${fileId}/v${versionNum}`;
}

export function buildThumbnailKey(fileId: string): string {
  return `thumbs/${fileId}.webp`;
}