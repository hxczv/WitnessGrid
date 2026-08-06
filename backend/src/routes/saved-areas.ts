import { Hono } from 'hono';
import { SavedAreaCreateSchema } from '@witnessgrid/contract';
import { assertUuid, validationError } from '../errors.js';
import { jsonBodyLimit } from '../middleware/body-limit.js';
import { authedUserId, requireAuth } from '../middleware/auth.js';
import { mutateRateLimit, savedAreaRateLimit } from '../rate-limit.js';
import { createSavedArea, deleteSavedArea, listAlerts, listSavedAreas } from '../repo/areas.js';
import type { AppEnv } from '../env.js';

export const savedAreaRoutes = new Hono<AppEnv>();

savedAreaRoutes.get('/saved-areas', requireAuth, async (c) => {
  return c.json(await listSavedAreas(authedUserId(c)));
});

savedAreaRoutes.post('/saved-areas', requireAuth, savedAreaRateLimit, jsonBodyLimit, async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = SavedAreaCreateSchema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error);

  return c.json(await createSavedArea(authedUserId(c), parsed.data));
});

savedAreaRoutes.delete('/saved-areas/:id', requireAuth, mutateRateLimit, async (c) => {
  const id = assertUuid(c.req.param('id'));
  await deleteSavedArea(id, authedUserId(c));
  return c.json({ ok: true });
});

savedAreaRoutes.get('/alerts', requireAuth, async (c) => {
  return c.json(await listAlerts(authedUserId(c)));
});
