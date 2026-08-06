import { config } from './config.js';
import { app } from './app.js';

// Node entry point. For Cloudflare Workers the entry is src/worker.ts, which
// copies wrangler bindings into process.env before importing the app.
if (config.PLATFORM === 'node') {
  const { serve } = await import('@hono/node-server');
  serve({ fetch: app.fetch, port: config.PORT });
  console.log(`[witnessgrid] api listening on http://localhost:${config.PORT}`);
}

export default app;
