import {
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { UploadRequest, UploadResponse } from '@witnessgrid/contract';
import { rm } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import path from 'node:path';
import { config } from '../config.js';
import { ApiError, errorCodes } from '../errors.js';
import { signMediaToken } from './token.js';

const EXT_CONTENT_TYPE: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  webm: 'video/webm',
  mp4: 'video/mp4',
};

export interface ObjectStore {
  readonly mode: 'local' | 'r2';
  createUpload(request: UploadRequest): Promise<UploadResponse>;
  delete(keys: string[]): Promise<void>;
}

export interface LocalObjectStore extends ObjectStore {
  readonly mode: 'local';
  read(key: string): Promise<{ contentType: string; body: import('node:stream/web').ReadableStream }>;
}

export interface R2ObjectStore extends ObjectStore {
  readonly mode: 'r2';
  presignedGetUrl(key: string): Promise<string>;
}

function sanitizeFilename(filename: string): string {
  const cleaned = filename
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/\.{2,}/g, '.')
    .slice(-120);
  if (!cleaned) throw new ApiError(errorCodes.VALIDATION, 'filename cannot be used as an object key');
  return cleaned;
}

export function contentTypeForKey(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase() ?? '';
  return EXT_CONTENT_TYPE[ext] ?? 'application/octet-stream';
}

export function assertSafeKey(key: string): void {
  if (
    !key ||
    key.startsWith('/') ||
    key.includes('\\') ||
    key.includes('..') ||
    /^[a-zA-Z]:/.test(key)
  ) {
    throw new ApiError(errorCodes.VALIDATION, 'unsafe object key');
  }
}

// Absolute filesystem path for a local-mode object key. Also used by the
// upload handler so the served key and the stored file stay in sync.
export function localPathForKey(key: string): string {
  assertSafeKey(key);
  return path.join(config.LOCAL_MEDIA_DIR, ...key.split('/'));
}

class LocalStore implements LocalObjectStore {
  readonly mode = 'local' as const;

  async createUpload(request: UploadRequest): Promise<UploadResponse> {
    const key = `media/${crypto.randomUUID()}/${sanitizeFilename(request.filename)}`;
    const token = await signMediaToken(key);
    return {
      key,
      upload_url: `${config.BASE_URL}/media/upload`,
      headers: {
        'x-media-key': key,
        'x-media-token': token,
        'content-type': request.contentType,
      },
    };
  }

  async delete(keys: string[]): Promise<void> {
    for (const key of keys) {
      const filePath = localPathForKey(key);
      await rm(filePath, { force: true }).catch(() => undefined);
      const parent = path.dirname(filePath);
      await rm(parent, { force: true, recursive: false }).catch(() => undefined);
    }
  }

  async read(key: string): Promise<{ contentType: string; body: import('node:stream/web').ReadableStream }> {
    const filePath = localPathForKey(key);
    const stream = createReadStream(filePath);
    return new Promise((resolve, reject) => {
      stream.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'ENOENT') reject(new ApiError(errorCodes.NOT_FOUND, 'media object not found'));
        else reject(err);
      });
      stream.once('open', () => {
        resolve({ contentType: contentTypeForKey(key), body: Readable.toWeb(stream) });
      });
    });
  }
}

class R2Store implements R2ObjectStore {
  readonly mode = 'r2' as const;
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = config;
    if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
      throw new Error('OBJECT_STORE=r2 requires R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET');
    }
    this.bucket = R2_BUCKET;
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });
  }

  async createUpload(request: UploadRequest): Promise<UploadResponse> {
    const key = `media/${crypto.randomUUID()}/${sanitizeFilename(request.filename)}`;
    const uploadUrl = await getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: request.contentType }),
      { expiresIn: 300 },
    );
    return { key, upload_url: uploadUrl, headers: { 'content-type': request.contentType } };
  }

  async delete(keys: string[]): Promise<void> {
    for (let i = 0; i < keys.length; i += 1000) {
      const chunk = keys.slice(i, i + 1000).map((key) => ({ Key: key }));
      await this.client.send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: chunk } }));
    }
  }

  async presignedGetUrl(key: string): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: 3600 },
    );
  }
}

function createObjectStore(cfg: typeof config): ObjectStore {
  if (cfg.OBJECT_STORE === 'r2') return new R2Store();
  return new LocalStore();
}

export const store: ObjectStore = createObjectStore(config);