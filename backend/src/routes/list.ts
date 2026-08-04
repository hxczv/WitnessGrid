import { Hono } from 'hono';
import { ListIncidentsQuerySchema } from '@witnessgrid/contract';
import { ApiError, errorCodes, validationError } from '../errors.js';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import { getIncident, listIncidents, listUserIncidents } from '../repo.js';
import type { AppEnv } from '../env.js';

export const listRoutes = new Hono<AppEnv>();

listRoutes.get('/incidents', async (c) => {
  const parsed = ListIncidentsQuerySchema.safeParse(c.req.query());
  if (!parsed.success) throw validationError(parsed.error);
  return c.json(await listIncidents(parsed.data));
});

listRoutes.get('/incidents/mine', requireAuth, async (c) => {
  const userId = c.get('userId');
  if (!userId) throw new ApiError(errorCodes.UNAUTHORIZED, 'authentication required');
  const parsed = ListIncidentsQuerySchema.safeParse(c.req.query());
  if (!parsed.success) throw validationError(parsed.error);
  return c.json(await listUserIncidents(userId, parsed.data));
});

listRoutes.get('/incident/:id', optionalAuth, async (c) => {
  const id = c.req.param('id');
  if (!id) throw new ApiError(errorCodes.NOT_FOUND, 'incident not found');
  const incident = await getIncident(id, c.get('userId') ?? null);
  if (!incident) throw new ApiError(errorCodes.NOT_FOUND, 'incident not found');
  return c.json(incident);
});