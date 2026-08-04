import { Hono, type Handler } from 'hono';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ApiError, errorCodes } from '../errors.js';
import { verifyMediaToken } from './token.js';
import {
  assertSafeKey,
  store,
  type LocalObjectStore,
  type R2ObjectStore,
} from './store.js';
import { config } from '../config.js';

export const mediaServeRoutes = new Hono();

async function sinkBody(c: Parameters<Handler>[0]): Promise<Uint8Array> {
  const body = c.req.raw.body;
  if (!body) throw new ApiError(errorCodes.VALIDATION, 'request body required');
  const chunks: Uint8Array[] = [];
  const reader = body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const total = chunks.reduce((n, chunk) => n + chunk.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
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

  const bytes = await sinkBody(c);
  const filePath = path.join(config.LOCAL_MEDIA_DIR, ...key.split('/'));
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, bytes);
  return new Response(null, { status: 200 });
};

mediaServeRoutes.get('/media/upload', handleMediaUpload);
mediaServeRoutes.put('/media/upload', handleMediaUpload);
mediaServeRoutes.post('/media/upload', handleMediaUpload);

const handleMediaGet: Handler = async (c) => {
  const key = decodeURIComponent(c.req.path.slice('/media/'.length));
  assertSafeKey(key);

  if (store.mode === 'local') {
    const local = store as LocalObjectStore;
    const { contentType, body } = await local.read(key);
    return new Response(body as unknown as BodyInit, {
      status: 200,
      headers: { 'content-type': contentType },
    });
  }

  const r2 = store as R2ObjectStore;
  const url = await r2.presignedGetUrl(key);
  return Response.redirect(url, 302);
};

mediaServeRoutes.get('/media/*', handleMediaGet);