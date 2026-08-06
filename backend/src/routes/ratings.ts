import { Hono } from 'hono';
import { RatingCreateSchema } from '@witnessgrid/contract';
import { assertUuid, validationError } from '../errors.js';
import { jsonBodyLimit } from '../middleware/body-limit.js';
import { authedUserId, optionalAuth, requireAuth } from '../middleware/auth.js';
import { mutateRateLimit } from '../rate-limit.js';
import { getRatingSummary, upsertRating } from '../repo/ratings.js';
import type { AppEnv } from '../env.js';

export const ratingRoutes = new Hono<AppEnv>();

ratingRoutes.get('/ratings/:incidentId', optionalAuth, async (c) => {
  const incidentId = assertUuid(c.req.param('incidentId'));
  return c.json(await getRatingSummary(incidentId, c.get('userId') ?? null));
});

ratingRoutes.patch('/ratings/:incidentId', requireAuth, mutateRateLimit, jsonBodyLimit, async (c) => {
  const incidentId = assertUuid(c.req.param('incidentId'));

  const body = await c.req.json().catch(() => null);
  const parsed = RatingCreateSchema.safeParse({ ...(body ?? {}), incident_id: incidentId });
  if (!parsed.success) throw validationError(parsed.error);

  const result = await upsertRating(incidentId, authedUserId(c), {
    appropriateness: parsed.data.appropriateness,
    professionalism: parsed.data.professionalism,
    safety: parsed.data.safety,
  });
  return c.json(result);
});
