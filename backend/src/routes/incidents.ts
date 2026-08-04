import { Hono } from 'hono';
import { IncidentCreateSchema, ReportFlagCreateSchema } from '@witnessgrid/contract';
import { ApiError, errorCodes, validationError } from '../errors.js';
import { jsonBodyLimit } from '../middleware/body-limit.js';
import { requireAuth } from '../middleware/auth.js';
import { mutateRateLimit } from '../rate-limit.js';
import { createIncident, createReportFlag, deleteIncident } from '../repo.js';
import { store } from '../media/store.js';
import type { AppEnv } from '../env.js';

export const incidentRoutes = new Hono<AppEnv>();

incidentRoutes.post('/incident', requireAuth, mutateRateLimit, jsonBodyLimit, async (c) => {
  const userId = c.get('userId');
  if (!userId) throw new ApiError(errorCodes.UNAUTHORIZED, 'authentication required');

  const body = await c.req.json().catch(() => null);
  const parsed = IncidentCreateSchema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error);

  const incident = await createIncident(parsed.data, userId);
  return c.json(incident);
});

incidentRoutes.delete('/incident/:id', requireAuth, mutateRateLimit, async (c) => {
  const userId = c.get('userId');
  if (!userId) throw new ApiError(errorCodes.UNAUTHORIZED, 'authentication required');

  const id = c.req.param('id');
  if (!id) throw new ApiError(errorCodes.NOT_FOUND, 'incident not found');
  const keys = await deleteIncident(id, userId);
  try {
    await store.delete(keys);
  } catch (err) {
    console.error('[media] failed to delete objects for incident', id, err);
  }
  return c.json({ ok: true });
});

incidentRoutes.post('/report', requireAuth, mutateRateLimit, jsonBodyLimit, async (c) => {
  const userId = c.get('userId');
  if (!userId) throw new ApiError(errorCodes.UNAUTHORIZED, 'authentication required');

  const body = await c.req.json().catch(() => null);
  const parsed = ReportFlagCreateSchema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error);

  await createReportFlag(parsed.data.incident_id, userId, parsed.data.reason, parsed.data.detail);
  return c.json({ ok: true });
});