import { Hono } from 'hono';
import { IncidentCreateSchema, ReportFlagCreateSchema } from '@witnessgrid/contract';
import { assertUuid, validationError } from '../errors.js';
import { jsonBodyLimit } from '../middleware/body-limit.js';
import { authedUserId, requireAuth } from '../middleware/auth.js';
import { mutateRateLimit } from '../rate-limit.js';
import { createIncident, deleteIncident } from '../repo/incidents.js';
import { createReportFlag } from '../repo/flags.js';
import { store } from '../media/store.js';
import type { AppEnv } from '../env.js';

export const incidentRoutes = new Hono<AppEnv>();

incidentRoutes.post('/incident', requireAuth, mutateRateLimit, jsonBodyLimit, async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = IncidentCreateSchema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error);

  const incident = await createIncident(parsed.data, authedUserId(c));
  return c.json(incident);
});

incidentRoutes.delete('/incident/:id', requireAuth, mutateRateLimit, async (c) => {
  const id = assertUuid(c.req.param('id'));
  const keys = await deleteIncident(id, authedUserId(c));
  try {
    await store.delete(keys);
  } catch (err) {
    console.error('[media] failed to delete objects for incident', id, err);
  }
  return c.json({ ok: true });
});

incidentRoutes.post('/report', requireAuth, mutateRateLimit, jsonBodyLimit, async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = ReportFlagCreateSchema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error);

  await createReportFlag(parsed.data.incident_id, authedUserId(c), parsed.data.reason, parsed.data.detail);
  return c.json({ ok: true });
});
