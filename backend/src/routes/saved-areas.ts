import { Hono } from 'hono';
import { SavedAreaCreateSchema } from '@witnessgrid/contract';
import { ApiError, errorCodes, validationError } from '../errors.js';
import { jsonBodyLimit } from '../middleware/body-limit.js';
import { requireAuth } from '../middleware/auth.js';
import { mutateRateLimit } from '../rate-limit.js';
import { createSavedArea, deleteSavedArea, listAlerts, listSavedAreas } from '../repo.js';
import type { AppEnv } from '../env.js';

export const savedAreaRoutes = new Hono<AppEnv>();

savedAreaRoutes.get('/saved-areas', requireAuth, async (c) => {
  const userId = c.get('userId');
  if (!userId) throw new ApiError(errorCodes.UNAUTHORIZED, 'authentication required');
  return c.json(await listSavedAreas(userId));
});

savedAreaRoutes.post('/saved-areas', requireAuth, mutateRateLimit, jsonBodyLimit, async (c) => {
  const userId = c.get('userId');
  if (!userId) throw new ApiError(errorCodes.UNAUTHORIZED, 'authentication required');

  const body = await c.req.json().catch(() => null);
  const parsed = SavedAreaCreateSchema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error);

  return c.json(await createSavedArea(userId, parsed.data));
});

savedAreaRoutes.delete('/saved-areas/:id', requireAuth, mutateRateLimit, async (c) => {
  const userId = c.get('userId');
  if (!userId) throw new ApiError(errorCodes.UNAUTHORIZED, 'authentication required');

  const id = c.req.param('id');
  if (!id) throw new ApiError(errorCodes.NOT_FOUND, 'saved area not found');
  await deleteSavedArea(id, userId);
  return c.json({ ok: true });
});

savedAreaRoutes.get('/alerts', requireAuth, async (c) => {
  const userId = c.get('userId');
  if (!userId) throw new ApiError(errorCodes.UNAUTHORIZED, 'authentication required');
  return c.json(await listAlerts(userId));
});
