import { Hono, type Handler } from 'hono';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { once } from 'node:events';
import path from 'node:path';
import { ApiError, errorCodes } from '../errors.js';
import { getUploadGrant, setUploadGrantHash } from '../repo/upload-grants.js';
import { verifyMediaToken } from './token.js';
import {
  assertSafeKey,
  localPathForKey,
  store,
  type LocalObjectStore,
  type R2ObjectStore,
} from './store.js';

export const mediaServeRoutes = new Hono();

export const MAX_LOCAL_UPLOAD_BYTES = 500 * 1024 * 1024;

// Streams the request body straight to disk in chunks and computes the SHA-256
// as it goes — memory stays flat regardless of file size, and the resulting
// digest is stored on the upload grant so incident creation can verify the
// client-declared hash against the actual bytes.
async function streamBodyToFile(c: Parameters<Handler>[0], filePath: string): Promise<string> {
  const body = c.req.raw.body;
  if (!body) throw new ApiError(errorCodes.VALIDATION, 'request body required');

  await mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.part`;
  const writer = createWriteStream(tmpPath);
  const hash = createHash('sha256');
  const reader = body.getReader();
  let received = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_LOCAL_UPLOAD_BYTES) {
        throw new ApiError(errorCodes.VALIDATION, `upload exceeds the ${Math.floor(MAX_LOCAL_UPLOAD_BYTES / 1024 / 1024)}MB limit`);
      }
      hash.update(value);
      if (!writer.write(value)) await once(writer, 'drain');
    }
    writer.end();
    await once(writer, 'close');
    await rename(tmpPath, filePath);
    return hash.digest('hex');
  } catch (err) {
    writer.destroy();
    await rm(tmpPath, { force: true }).catch(() => undefined);
    throw err;
  }
}

const handleMediaUpload: Handler = async (c) => {
  if (store.mode !== 'local') {
    throw new ApiError(errorCodes.NOT_FOUND, 'media upload endpoint only exists in local mode');
  }
  const key = c.req.header('x-media-key') ?? '';
  const token = c.req.header('x-media-token') ?? '';
  assertSafeKey(key);
  const valid = await verifyMediaToken(key, token);
  if (!valid) throw new ApiError(errorCodes.UNAUTHORIZED, 'invalid or expired media token');

  const grant = await getUploadGrant(key);
  if (!grant) throw new ApiError(errorCodes.UNAUTHORIZED, 'unknown media key');
  const declared = (c.req.header('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
  if (!declared) {
    throw new ApiError(errorCodes.VALIDATION, 'content-type header is required for upload');
  }
  if (declared !== grant.content_type.toLowerCase()) {
    throw new ApiError(errorCodes.VALIDATION, 'media content-type does not match the upload grant');
  }

  const digest = await streamBodyToFile(c, localPathForKey(key));
  await setUploadGrantHash(key, digest);
  return new Response(null, { status: 200 });
};

mediaServeRoutes.put('/media/upload', handleMediaUpload);
mediaServeRoutes.post('/media/upload', handleMediaUpload);

const handleMediaGet: Handler = async (c) => {
  let key: string;
  try {
    key = decodeURIComponent(c.req.path.slice('/media/'.length));
  } catch {
    throw new ApiError(errorCodes.VALIDATION, 'invalid media path');
  }
  assertSafeKey(key);

  if (store.mode === 'local') {
    const local = store as LocalObjectStore;
    const { contentType, body } = await local.read(key);
    return new Response(body as unknown as BodyInit, {
      status: 200,
      headers: {
        'content-type': contentType,
        'x-content-type-options': 'nosniff',
        'content-disposition': 'inline',
        'cache-control': 'public, max-age=86400',
      },
    });
  }

  const r2 = store as R2ObjectStore;
  const url = await r2.presignedGetUrl(key);
  return Response.redirect(url, 302);
};

mediaServeRoutes.get('/media/*', handleMediaGet);
