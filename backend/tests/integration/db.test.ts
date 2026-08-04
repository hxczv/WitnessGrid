import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { IncidentCreate } from '@witnessgrid/contract';
import { app } from '../../src/app.js';
import { db } from '../../src/db.js';
import { signSessionJwt } from '../../src/auth/jwt.js';
import { createUser, ensureRateLimitTable } from '../../src/repo.js';
import type { UserRow } from '../../src/repo.js';

const enabled = process.env.RUN_DB_TESTS === '1';

console.log(
  enabled
    ? '[db-tests] RUN_DB_TESTS=1 — running integration suite against live Postgres'
    : '[db-tests] SKIPPED — set RUN_DB_TESTS=1 (and DATABASE_URL) to run integration tests against live Postgres',
);

describe.skipIf(!enabled)('db integration', () => {
  const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const createdUsers: string[] = [];

  const emailFor = (label: string) => `it_${runId}_${label}@example.com`;
  const usernameFor = (label: string) => `it_${label}_${runId.slice(0, 8)}`;

  const jsonHeaders = (token?: string): Record<string, string> => ({
    'content-type': 'application/json',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  });

  async function makeUser(label: string): Promise<{ user: UserRow; token: string }> {
    const user = await createUser(emailFor(label), usernameFor(label));
    createdUsers.push(user.id);
    const token = await signSessionJwt({ sub: user.id, username: user.username, email: user.email });
    return { user, token };
  }

  function incidentPayload(overrides: Partial<IncidentCreate> = {}): IncidentCreate {
    return {
      incident_type: 'arrest',
      police_force: 'metropolitan',
      timestamp: new Date().toISOString(),
      location: { lon: -0.1276, lat: 51.5072 },
      description: 'integration test incident',
      media: [
        {
          key: `media/${crypto.randomUUID()}/clip.jpg`,
          type: 'image/jpeg',
          hash: 'a'.repeat(64),
          thumbnail_key: null,
        },
      ],
      client_id: crypto.randomUUID(),
      ...overrides,
    };
  }

  async function postIncident(token: string, payload: IncidentCreate): Promise<Response> {
    return app.request('http://localhost:8787/incident', {
      method: 'POST',
      headers: jsonHeaders(token),
      body: JSON.stringify(payload),
    });
  }

  beforeAll(async () => {
    await ensureRateLimitTable();
    try {
      await db`SELECT 1 FROM users LIMIT 1`;
    } catch (err) {
      throw new Error(
        `integration suite could not reach the WitnessGrid schema: ${(err as Error).message}. ` +
          'Run `node infra/db/migrate.ts` against DATABASE_URL first.',
      );
    }
  });

  afterAll(async () => {
    if (createdUsers.length > 0) {
      await db`DELETE FROM users WHERE id IN ${db(createdUsers)}`;
    }
    await db.end();
  });

  it('rejects an unauthenticated POST /incident with 401', async () => {
    const res = await postIncident('', incidentPayload());
    expect(res.status).toBe(401);
  });

  it('creates an incident and it appears in the public list', async () => {
    const { token } = await makeUser('owner');
    const payload = incidentPayload({ description: 'should appear in list' });
    const createdRes = await postIncident(token, payload);
    expect(createdRes.status).toBe(200);
    const created = await createdRes.json();
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.client_id).toBe(payload.client_id);
    expect(created.latitude).toBeCloseTo(payload.location.lat, 5);
    expect(created.longitude).toBeCloseTo(payload.location.lon, 5);
    expect(created.media[0]?.hash).toBe(payload.media[0]?.hash);

    const listRes = await app.request('http://localhost:8787/incidents');
    expect(listRes.status).toBe(200);
    const list = await listRes.json();
    expect(list.items.some((item: { id: string }) => item.id === created.id)).toBe(true);
    expect(list.items.find((item: { id: string }) => item.id === created.id)?.username).toBeTruthy();
  });

  it('rejects a duplicate client_id with CONFLICT', async () => {
    const { token } = await makeUser('dup');
    const payload = incidentPayload();
    const first = await postIncident(token, payload);
    expect(first.status).toBe(200);
    const second = await postIncident(token, payload);
    expect(second.status).toBe(409);
    const body = await second.json();
    expect(body.error.code).toBe('conflict');
  });

  it('forbids deletion by a non-owner', async () => {
    const { token: ownerToken } = await makeUser('del_owner');
    const { token: otherToken } = await makeUser('del_other');
    const created = await postIncident(ownerToken, incidentPayload());
    const id = (await created.json()).id;

    const res = await app.request(`http://localhost:8787/incident/${id}`, {
      method: 'DELETE',
      headers: jsonHeaders(otherToken),
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('forbidden');
  });

  it('lets the owner delete and the incident is gone', async () => {
    const { token } = await makeUser('del_ok');
    const created = await postIncident(token, incidentPayload());
    const id = (await created.json()).id;

    const res = await app.request(`http://localhost:8787/incident/${id}`, {
      method: 'DELETE',
      headers: jsonHeaders(token),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const detail = await app.request(`http://localhost:8787/incident/${id}`);
    expect(detail.status).toBe(404);
  });

  it('filters by bounding box to only in-polygon points', async () => {
    const { token } = await makeUser('bbox');
    // Distinct region so rows created by earlier tests never fall inside.
    const center = incidentPayload({ location: { lon: 1.7, lat: 51.3 }, description: 'inside bbox' });
    const west = incidentPayload({ location: { lon: 0.5, lat: 51.3 }, description: 'west outside' });
    const north = incidentPayload({ location: { lon: 1.7, lat: 53 }, description: 'north outside' });
    const centerId = (await (await postIncident(token, center)).json()).id;
    await postIncident(token, west);
    await postIncident(token, north);

    const res = await app.request(
      `http://localhost:8787/incidents?minLon=1&minLat=51&maxLon=2&maxLat=52`,
    );
    const list = await res.json();
    expect(list.items.length).toBe(1);
    expect(list.items[0].id).toBe(centerId);
  });

  it('paginates with a cursor that returns a distinct second page', async () => {
    const { token } = await makeUser('page');
    // Restrict to a unique bbox so only this test's rows are counted.
    const inRegion = (lon: number, lat: number) =>
      incidentPayload({ location: { lon, lat }, description: `page item ${lon}` });
    const created = await Promise.all(
      [inRegion(3.1, 53.1), inRegion(3.2, 53.2), inRegion(3.3, 53.3)].map((payload) =>
        postIncident(token, payload),
      ),
    );
    const idSet = new Set<string>();
    for (const res of created) idSet.add((await res.json()).id);

    const route = (params: string) =>
      app.request(`http://localhost:8787/incidents?minLon=3&minLat=53&maxLon=4&maxLat=54${params}`);

    const page1Res = await route('&limit=2');
    const page1 = await page1Res.json();
    expect(page1.items.length).toBe(2);
    expect(page1.next_cursor).toBeTruthy();

    const page2Res = await route(`&limit=2&cursor=${encodeURIComponent(page1.next_cursor as string)}`);
    const page2 = await page2Res.json();
    expect(page2.items.length).toBe(1);
    const page1Ids = new Set(page1.items.map((item: { id: string }) => item.id));
    expect(page1Ids.has(page2.items[0].id)).toBe(false);
    expect(page2.next_cursor).toBeNull();
    expect(page2.items[0].id).toBe([...idSet].find((id) => !page1Ids.has(id)));
  });

  it('runs the magic-link signup → verify → session flow end to end', async () => {
    const email = emailFor('magic');
    let logged: string | null = null;
    const originalLog = console.log;
    console.log = (msg: unknown) => {
      if (typeof msg === 'string' && msg.includes('[dev-mail]')) logged = msg;
    };
    try {
      const res = await app.request('http://localhost:8787/auth/magic-link', {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({ email, username: usernameFor('magic') }),
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
    } finally {
      console.log = originalLog;
    }

    expect(logged).toContain('/auth/verify?token=');
    const url = (logged ?? '').split(' ').pop();
    expect(url).toBeTruthy();
    const token = new URL(url as string).searchParams.get('token');
    expect(token).toBeTruthy();

    const verifyRes = await app.request('http://localhost:8787/auth/verify', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ token }),
    });
    expect(verifyRes.status).toBe(200);
    const session = await verifyRes.json();
    expect(session.user.email).toBe(email);
    expect(session.token.length).toBeGreaterThan(0);

    const meRes = await app.request('http://localhost:8787/auth/me', {
      headers: { authorization: `Bearer ${session.token}` },
    });
    expect(meRes.status).toBe(200);
    const me = await meRes.json();
    expect(me.email).toBe(email);
    expect(me.username).toBe(usernameFor('magic'));

    const replay = await app.request('http://localhost:8787/auth/verify', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ token }),
    });
    expect(replay.status).toBe(400);
  });

  it('requires a username when the email is unknown', async () => {
    const res = await app.request('http://localhost:8787/auth/magic-link', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ email: emailFor('nouesr') }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('validation_error');
    expect(body.error.message).toContain('username required');
  });
});