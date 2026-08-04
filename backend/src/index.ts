import { config } from './config.js';
import { app } from './app.js';

const isNode =
  typeof process !== 'undefined' &&
  typeof process.env === 'object' &&
  typeof process.env.PLATFORM !== 'string';

if (isNode) {
  const { serve } = await import('@hono/node-server');
  serve({ fetch: app.fetch, port: config.PORT });
  console.log(`[witnessgrid] api listening on http://localhost:${config.PORT}`);
}

export default app;