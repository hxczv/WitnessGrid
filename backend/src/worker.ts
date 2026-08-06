// Cloudflare Workers entry. Wrangler delivers secrets and vars as bindings on
// the `env` argument, not on process.env; copy them across before the app
// module graph (which reads config at import time) is loaded. The dynamic
// import is evaluated once per isolate, so config parses exactly once.
export default {
  async fetch(request: Request, env: Record<string, string>): Promise<Response> {
    for (const [key, value] of Object.entries(env)) {
      if (typeof value === 'string') process.env[key] = value;
    }
    process.env.PLATFORM = 'workers';
    const { app } = await import('./app.js');
    return app.fetch(request, env);
  },
};
