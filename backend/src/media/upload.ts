import { Hono } from 'hono';
import { UploadRequestSchema } from '@witnessgrid/contract';
import { validationError } from '../errors.js';
import { requireAuth } from '../middleware/auth.js';
import { mutateRateLimit } from '../rate-limit.js';
import { jsonBodyLimit } from '../middleware/body-limit.js';
import { store } from './store.js';
import type { AppEnv } from '../env.js';

export const uploadRoutes = new Hono<AppEnv>();

uploadRoutes.post('/upload', requireAuth, mutateRateLimit, jsonBodyLimit, async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = UploadRequestSchema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error);
  return c.json(await store.createUpload(parsed.data));
});