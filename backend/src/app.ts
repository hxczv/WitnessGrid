import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { ApiError, errorCodes } from './errors.js';
import { config } from './config.js';
import type { AppEnv } from './env.js';
import { authRoutes } from './routes/auth.js';
import { incidentRoutes } from './routes/incidents.js';
import { listRoutes } from './routes/list.js';
import { ratingRoutes } from './routes/ratings.js';
import { savedAreaRoutes } from './routes/saved-areas.js';
import { statsRoutes } from './routes/stats.js';
import { uploadRoutes } from './media/upload.js';
import { mediaServeRoutes } from './media/serve.js';

export const app = new Hono<AppEnv>();

app.use(
  '*',
  cors({
    origin: (origin) => {
      if (!origin) return undefined;
      if (origin === config.PUBLIC_ORIGIN || origin === 'http://localhost:3000') return origin;
      return undefined;
    },
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['content-type', 'authorization', 'x-media-key', 'x-media-token'],
    exposeHeaders: ['retry-after'],
    maxAge: 86400,
  }),
);

app.get('/', (c) => c.json({ ok: true, service: 'witnessgrid-api' }));

app.route('/', listRoutes);
app.route('/', authRoutes);
app.route('/', incidentRoutes);
app.route('/', ratingRoutes);
app.route('/', savedAreaRoutes);
app.route('/', statsRoutes);
app.route('/', uploadRoutes);
app.route('/', mediaServeRoutes);

app.notFound((c) => c.json({ error: { code: errorCodes.NOT_FOUND, message: 'not found' } }, 404));

app.onError((err, c) => {
  if (err instanceof ApiError) {
    return c.json({ error: { code: err.code, message: err.message } }, err.status as 400 | 401 | 403 | 404 | 409 | 429 | 500);
  }
  console.error('[error]', err);
  return c.json({ error: { code: errorCodes.STORAGE, message: 'internal server error' } }, 500);
});