import { Hono } from 'hono';
import { ListIncidentsQuerySchema } from '@witnessgrid/contract';
import { ApiError, errorCodes, assertUuid, validationError } from '../errors.js';
import { authedUserId, optionalAuth, requireAuth } from '../middleware/auth.js';
import { getIncident, listIncidents, listUserIncidents } from '../repo/incidents.js';
import { getRatingSummary } from '../repo/ratings.js';
import type { AppEnv } from '../env.js';

export const listRoutes = new Hono<AppEnv>();

listRoutes.get('/incidents', async (c) => {
  const parsed = ListIncidentsQuerySchema.safeParse(c.req.query());
  if (!parsed.success) throw validationError(parsed.error);
  return c.json(await listIncidents(parsed.data));
});

listRoutes.get('/incidents/mine', requireAuth, async (c) => {
  const parsed = ListIncidentsQuerySchema.safeParse(c.req.query());
  if (!parsed.success) throw validationError(parsed.error);
  return c.json(await listUserIncidents(authedUserId(c), parsed.data));
});

listRoutes.get('/incident/:id', optionalAuth, async (c) => {
  const id = assertUuid(c.req.param('id'));
  // ?incrementView=0 lets image-preview fetchers (e.g. the OG route) read a
  // record without counting a human view.
  const incrementView = c.req.query('incrementView') !== '0';
  const incident = await getIncident(id, c.get('userId') ?? null, { incrementView });
  if (!incident) throw new ApiError(errorCodes.NOT_FOUND, 'incident not found');
  const summary = await getRatingSummary(id, c.get('userId') ?? null);
  const body = summary.count > 0 ? { ...incident, rating_summary: summary } : incident;
  return c.json(body);
});
