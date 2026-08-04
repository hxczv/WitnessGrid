import { describe, it, expect } from 'vitest';
import { ApiErrorSchema } from '@witnessgrid/contract';
import { app } from '../src/app.js';

const ORIGIN = 'http://localhost:3000';

describe('app surface', () => {
  it('serves the health endpoint', async () => {
    const res = await app.request(`http://localhost:8787/`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, service: 'witnessgrid-api' });
  });

  it('returns ApiError shape for an unknown route', async () => {
    const res = await app.request('http://localhost:8787/does-not-exist');
    expect(res.status).toBe(404);
    const payload = ApiErrorSchema.safeParse(await res.json());
    expect(payload.success).toBe(true);
    expect(payload.data?.error.code).toBe('not_found');
  });

  it('sets CORS headers for an allowed origin', async () => {
    const res = await app.request(`http://localhost:8787/`, { headers: { origin: ORIGIN } });
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
  });

  it('does not set CORS headers for a disallowed origin', async () => {
    const res = await app.request('http://localhost:8787/', { headers: { origin: 'http://evil.example' } });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('rejects an unauthenticated POST /incident with 401', async () => {
    const res = await app.request('http://localhost:8787/incident', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
    const payload = ApiErrorSchema.safeParse(await res.json());
    expect(payload.success).toBe(true);
    expect(payload.data?.error.code).toBe('unauthorized');
  });
});