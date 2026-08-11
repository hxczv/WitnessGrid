import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { IncidentCreate } from '@witnessgrid/contract';
import { app } from '../../src/app.js';
import { db } from '../../src/db.js';
import { signSessionJwt } from '../../src/auth/jwt.js';
import { createUser } from '../../src/repo/users.js';
import type { UserRow } from '../../src/repo/users.js';
import { pruneExpiredMagicTokens } from '../../src/repo/magic-tokens.js';

const enabled = process.env.RUN_DB_TESTS === '1';

console.log(
  enabled
    ? '[db-tests] RUN_DB_TESTS=1 — running integration suite against live Postgres'
    : '[db-tests] SKIPPED — set RUN_DB_TESTS=1 (and DATABASE_URL) to run integration tests against live Postgres',
);

describe.skipIf(!enabled)('db integration', () => {
  const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  // Deleted accounts leave their incidents behind (user_id SET NULL), so the
  // suite cleans up those orphans on exit as well.
  const runStartedAt = new Date();
  const createdUsers: string[] = [];

  const emailFor = (label: string) => `it_${runId}_${label}@example.com`;
  const usernameFor = (label: string) => `it_${label}_${runId.slice(0, 8)}`;

  const jsonHeaders = (token?: string): Record<string, string> => ({
    'content-type': 'application/json',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  });

  function userIdFromJwt(token: string): string {
    const segment = token.split('.')[1];
    if (!segment) throw new Error('malformed JWT in test');
    const payload = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as { sub: string };
    return payload.sub;
  }

  async function makeUser(label: string): Promise<{ user: UserRow; token: string }> {
    const user = await createUser(emailFor(label), usernameFor(label));
    createdUsers.push(user.id);
    const token = await signSessionJwt({ sub: user.id, username: user.username, email: user.email });
    return { user, token };
  }

  const randomHash = () =>
    Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('');

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
          hash: randomHash(),
          thumbnail_key: null,
        },
      ],
      client_id: crypto.randomUUID(),
      ...overrides,
    };
  }

  // Media keys must carry an upload grant belonging to the poster; the tests
  // insert grants directly so the incident flow stays the subject under test.
  // The grant records the server-computed sha256, as a real local-mode upload
  // would leave behind — incident creation now requires it.
  // An empty token is the unauthenticated case — no grants, no user lookup.
  async function postIncident(token: string, payload: IncidentCreate): Promise<Response> {
    if (token) {
      const userId = userIdFromJwt(token);
      for (const media of payload.media) {
        await db`
          INSERT INTO media_grants (key, user_id, content_type, sha256)
          VALUES (${media.key}, ${userId}, ${media.type}, ${media.hash})
        `;
      }
    }
    return app.request('http://localhost:8787/incident', {
      method: 'POST',
      headers: jsonHeaders(token),
      body: JSON.stringify(payload),
    });
  }

  beforeAll(async () => {
    try {
      await db`SELECT 1 FROM users LIMIT 1`;
      await db`SELECT 1 FROM rate_limit LIMIT 1`;
      await db`SELECT 1 FROM media_grants LIMIT 1`;
      // Rate buckets accumulate across runs (magic-link caps are 10/600s per
      // IP), so the suite clears them to stay reproducible on its own.
      await db`TRUNCATE rate_limit`;
    } catch (err) {
      throw new Error(
        `integration suite could not reach the WitnessGrid schema: ${(err as Error).message}. ` +
          'Run `pnpm migrate` against DATABASE_URL first.',
      );
    }
  });

  afterAll(async () => {
    if (createdUsers.length > 0) {
      await db`DELETE FROM users WHERE id IN ${db(createdUsers)}`;
    }
    await db`DELETE FROM incidents WHERE user_id IS NULL AND created_at >= ${runStartedAt}`;
    // The same-millisecond pagination test rewrites created_at to a fixed past
    // date, so the orphan sweep above misses its rows; they are deleted by
    // description prefix instead.
    await db`DELETE FROM incidents WHERE description LIKE ${'page ms item%'}`;
    await db`DELETE FROM media_grants WHERE created_at >= ${runStartedAt}`;
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
    // Same client_id, but fresh media keys: the media-attached check must not
    // mask the client_id idempotency conflict the client relies on.
    const retry = incidentPayload({ client_id: payload.client_id });
    const second = await postIncident(token, retry);
    expect(second.status).toBe(409);
    const body = await second.json();
    expect(body.error.code).toBe('conflict');
  });

  it('rejects media that holds a grant but was never uploaded', async () => {
    const { token } = await makeUser('nofile');
    const userId = userIdFromJwt(token);
    const payload = incidentPayload();
    const media = payload.media[0];
    if (!media) throw new Error('fixture payload must include media');
    // A grant without a server-computed hash means the client skipped the
    // PUT; the incident must not reference a file that does not exist.
    await db`
      INSERT INTO media_grants (key, user_id, content_type)
      VALUES (${media.key}, ${userId}, ${media.type})
    `;
    const res = await app.request('http://localhost:8787/incident', {
      method: 'POST',
      headers: jsonHeaders(token),
      body: JSON.stringify(payload),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toContain('no file received');
  });

  it('rejects media whose declared hash differs from the uploaded bytes', async () => {
    const { token } = await makeUser('badhash');
    const userId = userIdFromJwt(token);
    const payload = incidentPayload();
    const media = payload.media[0];
    if (!media) throw new Error('fixture payload must include media');
    await db`
      INSERT INTO media_grants (key, user_id, content_type, sha256)
      VALUES (${media.key}, ${userId}, ${media.type}, ${'a'.repeat(64)})
    `;
    const res = await app.request('http://localhost:8787/incident', {
      method: 'POST',
      headers: jsonHeaders(token),
      body: JSON.stringify(payload),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toContain('does not match its declared hash');
  });

  it('issues upload credentials bound to the requesting user', async () => {
    const { user, token } = await makeUser('upload');
    const res = await app.request('http://localhost:8787/upload', {
      method: 'POST',
      headers: jsonHeaders(token),
      body: JSON.stringify({ filename: 'evidence.jpg', contentType: 'image/jpeg' }),
    });
    expect(res.status).toBe(200);
    const upload = await res.json();
    expect(upload.key).toMatch(/^media\//);
    expect(upload.upload_url).toContain('/media/upload');
    expect(upload.headers['x-media-token']).toBeTruthy();

    const grants = await db`SELECT user_id, content_type FROM media_grants WHERE key = ${upload.key}`;
    expect(grants.length).toBe(1);
    expect(grants[0]?.user_id).toBe(user.id);
    expect(grants[0]?.content_type).toBe('image/jpeg');
  });

  it('rejects incident media without an upload grant', async () => {
    const { token } = await makeUser('nogrant');
    const payload = incidentPayload();
    const res = await app.request('http://localhost:8787/incident', {
      method: 'POST',
      headers: jsonHeaders(token),
      body: JSON.stringify(payload),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toContain('not uploaded');
  });

  it('rejects incident media granted to a different user', async () => {
    const { user: other } = await makeUser('grant_other');
    const { token } = await makeUser('grant_thief');
    const payload = incidentPayload();
    const media = payload.media[0];
    if (!media) throw new Error('payload has no media');
    await db`
      INSERT INTO media_grants (key, user_id, content_type)
      VALUES (${media.key}, ${other.id}, ${media.type})
    `;
    const res = await app.request('http://localhost:8787/incident', {
      method: 'POST',
      headers: jsonHeaders(token),
      body: JSON.stringify(payload),
    });
    expect(res.status).toBe(400);
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

  it('returns 400 for malformed ids and cursors instead of 500', async () => {
    const badId = await app.request('http://localhost:8787/incident/not-a-uuid');
    expect(badId.status).toBe(400);

    const badCursor = await app.request(
      `http://localhost:8787/incidents?cursor=${encodeURIComponent('garbage:cursor:here')}`,
    );
    expect(badCursor.status).toBe(400);
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

  it('does not drop same-millisecond rows when paginating', async () => {
    const { token } = await makeUser('page_ms');
    // Far out in the ocean: no seed rows share this bbox, so counts are exact.
    const inRegion = (lon: number, lat: number) =>
      incidentPayload({ location: { lon, lat }, description: `page ms item ${lon}` });
    const created = await Promise.all(
      [inRegion(170.1, 53.1), inRegion(170.2, 53.2), inRegion(170.3, 53.3)].map((payload) =>
        postIncident(token, payload),
      ),
    );
    const ids: string[] = [];
    for (const res of created) ids.push((await res.json()).id);

    // Squeeze all three rows into the same millisecond (distinct microseconds).
    // postgres.js truncates created_at to ms, so the old cursor built from the
    // truncated value excluded rows sharing the boundary millisecond.
    const base = '2026-01-02T03:04:05.000000Z';
    await Promise.all(
      ids.map((id, i) =>
        db`UPDATE incidents SET created_at = ${base}::timestamptz + ${(i + 1) * 100} * interval '1 microsecond' WHERE id = ${id}`,
      ),
    );

    const route = (params: string) =>
      app.request(`http://localhost:8787/incidents?minLon=170&minLat=53&maxLon=171&maxLat=54${params}`);

    const page1Res = await route('&limit=2');
    const page1 = await page1Res.json();
    expect(page1.items.length).toBe(2);
    expect(page1.next_cursor).toBeTruthy();

    const page2Res = await route(`&limit=2&cursor=${encodeURIComponent(page1.next_cursor as string)}`);
    const page2 = await page2Res.json();
    expect(page2.items.length).toBe(1);
    expect(page2.items[0].id).toBe(ids[0]);
  });

  it('serializes location_accuracy_m on created and listed incidents', async () => {
    const { token } = await makeUser('acc');
    const payload = incidentPayload({ location_accuracy_m: 12 });
    const createdRes = await postIncident(token, payload);
    expect(createdRes.status).toBe(200);
    const created = await createdRes.json();
    expect(created.location_accuracy_m).toBe(12);

    const listRes = await app.request(
      'http://localhost:8787/incidents?minLon=-1&minLat=50&maxLon=1&maxLat=53',
    );
    const list = await listRes.json();
    expect(list.items.find((item: { id: string }) => item.id === created.id)?.location_accuracy_m).toBe(12);

    const detailRes = await app.request(`http://localhost:8787/incident/${created.id}`);
    expect(detailRes.status).toBe(200);
    expect((await detailRes.json()).location_accuracy_m).toBe(12);
  });

  it('POST /report on a missing incident returns 404', async () => {
    const { token } = await makeUser('report_missing');
    const res = await app.request('http://localhost:8787/report', {
      method: 'POST',
      headers: jsonHeaders(token),
      body: JSON.stringify({ incident_id: crypto.randomUUID(), reason: 'other' }),
    });
    expect(res.status).toBe(404);
  });

  it('rating a removed incident returns 404', async () => {
    const { token: ownerToken } = await makeUser('rate_removed_owner');
    const { token: otherToken } = await makeUser('rate_removed_other');
    const created = await postIncident(ownerToken, incidentPayload());
    expect(created.status).toBe(200);
    const id = (await created.json()).id;
    await db`UPDATE incidents SET moderation_status = 'removed' WHERE id = ${id}`;

    const res = await app.request(`http://localhost:8787/ratings/${id}`, {
      method: 'PATCH',
      headers: jsonHeaders(otherToken),
      body: JSON.stringify({ appropriateness: 4, professionalism: 4, safety: 4 }),
    });
    expect(res.status).toBe(404);
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

    // Links point at the web app's sign-in page, which auto-verifies.
    expect(logged).toContain('/signin?token=');
    const url = String(logged ?? '').match(/https?:\/\/\S+/)?.[0];
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

  it('treats differently cased emails as one account', async () => {
    const email = emailFor('case');
    const first = await app.request('http://localhost:8787/auth/magic-link', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ email: email.toUpperCase(), username: usernameFor('case') }),
    });
    expect(first.status).toBe(200);
    const second = await app.request('http://localhost:8787/auth/magic-link', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ email: email.toLowerCase() }),
    });
    // No username error means the lowercase lookup found the account created
    // with the uppercase address.
    expect(second.status).toBe(200);
  });

  it('requires a username when the email is unknown', async () => {
    const res = await app.request('http://localhost:8787/auth/magic-link', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ email: emailFor('nouser') }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('validation_error');
    expect(body.error.message).toContain('username required');
  });

  it('invalidates sessions when the account is deleted', async () => {
    const { token } = await makeUser('gone');
    const del = await app.request('http://localhost:8787/auth/me', {
      method: 'DELETE',
      headers: jsonHeaders(token),
    });
    expect(del.status).toBe(200);

    const me = await app.request('http://localhost:8787/auth/me', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(me.status).toBe(401);

    const post = await app.request('http://localhost:8787/incident', {
      method: 'POST',
      headers: jsonHeaders(token),
      body: JSON.stringify(incidentPayload()),
    });
    expect(post.status).toBe(401);
  });

  it('prunes used and long-expired magic tokens', async () => {
    await db`INSERT INTO magic_link_tokens (token_hash, user_id, email, expires_at, used_at)
             VALUES ('used-hash', NULL, 'p@example.com', now() + interval '1 day', now())`;
    await db`INSERT INTO magic_link_tokens (token_hash, user_id, email, expires_at)
             VALUES ('expired-hash', NULL, 'p@example.com', now() - interval '2 hours')`;
    await pruneExpiredMagicTokens(true);
    const left = await db<{ token_hash: string }[]>`SELECT token_hash FROM magic_link_tokens`;
    expect(left.some((r) => r.token_hash === 'used-hash')).toBe(false);
    expect(left.some((r) => r.token_hash === 'expired-hash')).toBe(false);
  });
});
