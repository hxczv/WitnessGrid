import { Hono } from 'hono';
import { RatingCreateSchema } from '@witnessgrid/contract';
import { ApiError, errorCodes, validationError } from '../errors.js';
import { jsonBodyLimit } from '../middleware/body-limit.js';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import { mutateRateLimit } from '../rate-limit.js';
import { getRatingSummary, upsertRating } from '../repo.js';
import type { AppEnv } from '../env.js';

export const ratingRoutes = new Hono<AppEnv>();

ratingRoutes.get('/ratings/:incidentId', optionalAuth, async (c) => {
  const incidentId = c.req.param('incidentId');
  if (!incidentId) throw new ApiError(errorCodes.NOT_FOUND, 'incident not found');
  return c.json(await getRatingSummary(incidentId, c.get('userId') ?? null));
});

ratingRoutes.patch('/ratings/:incidentId', requireAuth, mutateRateLimit, jsonBodyLimit, async (c) => {
  const userId = c.get('userId');
  if (!userId) throw new ApiError(errorCodes.UNAUTHORIZED, 'authentication required');
  const incidentId = c.req.param('incidentId');
  if (!incidentId) throw new ApiError(errorCodes.NOT_FOUND, 'incident not found');

  const body = await c.req.json().catch(() => null);
  const parsed = RatingCreateSchema.safeParse({ ...(body ?? {}), incident_id: incidentId });
  if (!parsed.success) throw validationError(parsed.error);

  const result = await upsertRating(incidentId, userId, {
    appropriateness: parsed.data.appropriateness,
    professionalism: parsed.data.professionalism,
    safety: parsed.data.safety,
  });
  return c.json(result);
});
