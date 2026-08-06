import { Hono } from 'hono';
import { StatsQuerySchema } from '@witnessgrid/contract';
import { validationError } from '../errors.js';
import { authedUserId, requireAuth } from '../middleware/auth.js';
import { getStatsMe, getStatsPublic } from '../repo/stats.js';
import type { AppEnv } from '../env.js';

export const statsRoutes = new Hono<AppEnv>();

statsRoutes.get('/stats', async (c) => {
  const parsed = StatsQuerySchema.safeParse(c.req.query());
  if (!parsed.success) throw validationError(parsed.error);
  return c.json(await getStatsPublic(parsed.data.period));
});

statsRoutes.get('/stats/me', requireAuth, async (c) => {
  return c.json(await getStatsMe(authedUserId(c)));
});
