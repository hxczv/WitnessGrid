import { Hono } from 'hono';
import { UploadRequestSchema } from '@witnessgrid/contract';
import { validationError } from '../errors.js';
import { authedUserId, requireAuth } from '../middleware/auth.js';
import { mutateRateLimit } from '../rate-limit.js';
import { jsonBodyLimit } from '../middleware/body-limit.js';
import { createUploadGrant } from '../repo/upload-grants.js';
import { store } from './store.js';
import type { AppEnv } from '../env.js';

export const uploadRoutes = new Hono<AppEnv>();

uploadRoutes.post('/upload', requireAuth, mutateRateLimit, jsonBodyLimit, async (c) => {
  const userId = authedUserId(c);
  const body = await c.req.json().catch(() => null);
  const parsed = UploadRequestSchema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error);

  const upload = await store.createUpload(parsed.data);
  // Bind the issued key to this user; incident creation checks the grant so
  // nobody can attach media they did not upload.
  await createUploadGrant(upload.key, userId, parsed.data.contentType);
  return c.json(upload);
});
