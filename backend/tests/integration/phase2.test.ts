import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { IncidentCreate } from '@witnessgrid/contract';
import { app } from '../../src/app.js';
import { db } from '../../src/db.js';
import { signSessionJwt } from '../../src/auth/jwt.js';
import { createUser, ensureRateLimitTable } from '../../src/repo.js';
import type { UserRow } from '../../src/repo.js';

const enabled = process.env.RUN_DB_TESTS === '1';

describe.skipIf(!enabled)('phase 2 db integration', () => {
  const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  // Deleted accounts leave their incidents behind (user_id SET NULL), so the
  // suite cleans up those orphans on exit as well.
  const runStartedAt = new Date();
  const createdUsers: string[] = [];

  const emailFor = (label: string) => `p2_${runId}_${label}@example.com`;
  const usernameFor = (label: string) => `p2_${label}_${runId.slice(0, 8)}`;

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

  const randomHash = () =>
    Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('');

  function incidentPayload(overrides: Partial<IncidentCreate> = {}): IncidentCreate {
    return {
      incident_type: 'arrest',
      police_force: 'metropolitan',
      timestamp: new Date().toISOString(),
      location: { lon: -0.1276, lat: 51.5072 },
      description: 'phase 2 integration test incident',
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

  async function postIncident(token: string, payload: IncidentCreate): Promise<Response> {
    return app.request('http://localhost:8787/incident', {
      method: 'POST',
      headers: jsonHeaders(token),
      body: JSON.stringify(payload),
    });
  }

  // A region only this suite's alert tests use, so incidents from other tests
  // never intersect these saved areas.
  const alertRegion = { center: { lon: 2.1, lat: 52.5 } };
  const areaPolygon = [
    [2.0, 52.4],
    [2.2, 52.4],
    [2.2, 52.6],
  ];

  async function createArea(token: string, name: string, polygon = areaPolygon): Promise<Response> {
    return app.request('http://localhost:8787/saved-areas', {
      method: 'POST',
      headers: jsonHeaders(token),
      body: JSON.stringify({ name, polygon }),
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
    await db`DELETE FROM incidents WHERE user_id IS NULL AND created_at >= ${runStartedAt}`;
    await db.end();
  });

  describe('ratings', () => {
    it('returns an empty summary for an unrated incident', async () => {
      const { token } = await makeUser('rate_owner');
      const id = (await (await postIncident(token, incidentPayload())).json()).id;

      const res = await app.request(`http://localhost:8787/ratings/${id}`);
      expect(res.status).toBe(200);
      const summary = await res.json();
      expect(summary.count).toBe(0);
      expect(summary.appropriateness_avg).toBeNull();
      expect(summary.my).toBeNull();
    });

    it('records a rating, updates it, and includes the caller own rating', async () => {
      const owner = await makeUser('rate_auth_owner');
      const rater = await makeUser('rate_auth_rater');
      const id = (await (await postIncident(owner.token, incidentPayload())).json()).id;

      const first = await app.request(`http://localhost:8787/ratings/${id}`, {
        method: 'PATCH',
        headers: jsonHeaders(rater.token),
        body: JSON.stringify({ appropriateness: 3, professionalism: 4, safety: 2 }),
      });
      expect(first.status).toBe(200);
      let body = await first.json();
      expect(body.summary.count).toBe(1);
      expect(body.summary.my).toEqual(
        expect.objectContaining({ appropriateness: 3, professionalism: 4, safety: 2 }),
      );
      expect(body.incident.id).toBe(id);

      const update = await app.request(`http://localhost:8787/ratings/${id}`, {
        method: 'PATCH',
        headers: jsonHeaders(rater.token),
        body: JSON.stringify({ appropriateness: 5, professionalism: 5, safety: 5 }),
      });
      expect(update.status).toBe(200);
      body = await update.json();
      expect(body.summary.count).toBe(1);
      expect(body.summary.appropriateness_avg).toBe(5);
      expect(body.summary.my.appropriateness).toBe(5);

      const asOwner = await app.request(`http://localhost:8787/ratings/${id}`, {
        headers: jsonHeaders(owner.token),
      });
      expect((await asOwner.json()).my).toBeNull();

      const asRater = await app.request(`http://localhost:8787/ratings/${id}`, {
        headers: jsonHeaders(rater.token),
      });
      expect((await asRater.json()).my.professionalism).toBe(5);
    });

    it('attaches the rating summary to the incident detail', async () => {
      const owner = await makeUser('rate_det_owner');
      const rater = await makeUser('rate_det_rater');
      const id = (await (await postIncident(owner.token, incidentPayload())).json()).id;

      const before = await app.request(`http://localhost:8787/incident/${id}`);
      const beforeBody = await before.json();
      expect(beforeBody.rating_summary).toBeUndefined();

      await app.request(`http://localhost:8787/ratings/${id}`, {
        method: 'PATCH',
        headers: jsonHeaders(rater.token),
        body: JSON.stringify({ appropriateness: 4, professionalism: 3, safety: 5 }),
      });

      const guest = await app.request(`http://localhost:8787/incident/${id}`);
      const guestBody = await guest.json();
      expect(guestBody.rating_summary.count).toBe(1);
      expect(guestBody.rating_summary.appropriateness_avg).toBe(4);
      expect(guestBody.rating_summary.my).toBeNull();

      const asRater = await app.request(`http://localhost:8787/incident/${id}`, {
        headers: jsonHeaders(rater.token),
      });
      const raterBody = await asRater.json();
      expect(raterBody.rating_summary.my).toEqual(
        expect.objectContaining({ appropriateness: 4, professionalism: 3, safety: 5 }),
      );

      const asOwner = await app.request(`http://localhost:8787/incident/${id}`, {
        headers: jsonHeaders(owner.token),
      });
      expect((await asOwner.json()).rating_summary.my).toBeNull();
    });

    it('rejects rating your own incident', async () => {
      const { token } = await makeUser('rate_self');
      const id = (await (await postIncident(token, incidentPayload())).json()).id;

      const res = await app.request(`http://localhost:8787/ratings/${id}`, {
        method: 'PATCH',
        headers: jsonHeaders(token),
        body: JSON.stringify({ appropriateness: 4, professionalism: 4, safety: 4 }),
      });
      expect(res.status).toBe(409);
      expect((await res.json()).error.code).toBe('conflict');
    });

    it('rejects anonymous and out-of-range ratings', async () => {
      const { token } = await makeUser('rate_bad');
      const id = (await (await postIncident(token, incidentPayload())).json()).id;

      const anon = await app.request(`http://localhost:8787/ratings/${id}`, {
        method: 'PATCH',
        headers: jsonHeaders(),
        body: JSON.stringify({ appropriateness: 4, professionalism: 4, safety: 4 }),
      });
      expect(anon.status).toBe(401);

      const bad = await app.request(`http://localhost:8787/ratings/${id}`, {
        method: 'PATCH',
        headers: jsonHeaders(token),
        body: JSON.stringify({ appropriateness: 9, professionalism: 4, safety: 4 }),
      });
      expect(bad.status).toBe(400);
    });

    it('returns 404 for a missing incident', async () => {
      const { token } = await makeUser('rate_missing');
      const res = await app.request(`http://localhost:8787/ratings/${crypto.randomUUID()}`, {
        method: 'PATCH',
        headers: jsonHeaders(token),
        body: JSON.stringify({ appropriateness: 4, professionalism: 4, safety: 4 }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe('search', () => {
    it('finds incidents by description keyword', async () => {
      const { token } = await makeUser('search');
      await postIncident(token, incidentPayload({ description: 'quokka smuggling on the high street' }));
      const other = await postIncident(token, incidentPayload({ description: 'unrelated paperwork' }));
      await other.json();

      const hit = await app.request(`http://localhost:8787/incidents?q=${encodeURIComponent('quokka')}`);
      expect(hit.status).toBe(200);
      const hitBody = await hit.json();
      expect(hitBody.items.length).toBeGreaterThan(0);
      for (const item of hitBody.items) {
        expect(item.description).toContain('quokka');
      }

      const miss = await app.request(`http://localhost:8787/incidents?q=${encodeURIComponent('zanzibar')}`);
      expect((await miss.json()).items).toEqual([]);
    });

    it('treats a blank search as no filter', async () => {
      const res = await app.request('http://localhost:8787/incidents?q=');
      expect(res.status).toBe(200);
      expect((await res.json()).items.length).toBeGreaterThan(0);
    });
  });

  describe('saved areas', () => {
    it('creates, lists and deletes a saved area', async () => {
      const { token } = await makeUser('area_crud');
      const created = await createArea(token, 'My patch');
      expect(created.status).toBe(200);
      const area = await created.json();
      expect(area.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(area.polygon).toEqual(areaPolygon);
      expect(area.alerts).toBe(0);

      const list = await app.request('http://localhost:8787/saved-areas', {
        headers: jsonHeaders(token),
      });
      expect(list.status).toBe(200);
      const body = await list.json();
      expect(body.length).toBe(1);
      expect(body[0].name).toBe('My patch');

      const other = await makeUser('area_other');
      const otherList = await app.request('http://localhost:8787/saved-areas', {
        headers: jsonHeaders(other.token),
      });
      expect((await otherList.json())).toEqual([]);

      const del = await app.request(`http://localhost:8787/saved-areas/${area.id}`, {
        method: 'DELETE',
        headers: jsonHeaders(token),
      });
      expect(del.status).toBe(200);
      const delAgain = await app.request(`http://localhost:8787/saved-areas/${area.id}`, {
        method: 'DELETE',
        headers: jsonHeaders(token),
      });
      expect(delAgain.status).toBe(404);
    });

    it('caps saved areas at ten per user', async () => {
      const { token } = await makeUser('area_cap');
      const capPolygon = [
        [4.0, 54.4],
        [4.2, 54.4],
        [4.2, 54.6],
      ];
      for (let i = 0; i < 10; i += 1) {
        const res = await createArea(token, `area ${i}`, capPolygon);
        expect(res.status).toBe(200);
      }
      const eleventh = await createArea(token, 'one too many', capPolygon);
      expect(eleventh.status).toBe(409);
      expect((await eleventh.json()).error.message).toContain('10');
    });

    it('rejects an invalid polygon', async () => {
      const { token } = await makeUser('area_bad');
      const res = await createArea(token, 'bad', [
        [2.0, 52.4],
        [2.2, 52.4],
      ]);
      expect(res.status).toBe(400);
    });
  });

  describe('saved-area alerts', () => {
    it('raises one alert + email per user per incident and dedupes overlapping areas', async () => {
      const watcher = await makeUser('alert_watcher');
      const poster = await makeUser('alert_poster');

      await createArea(watcher.token, 'first area');
      await createArea(watcher.token, 'second area');

      const payload = incidentPayload({
        description: 'inside watched area',
        location: alertRegion.center,
      });

      let mailLines: string[] = [];
      const originalLog = console.log;
      console.log = (msg: unknown) => {
        if (typeof msg === 'string' && msg.includes('[dev-mail] saved-area alert')) {
          mailLines.push(msg);
        }
      };
      try {
        const res = await postIncident(poster.token, payload);
        expect(res.status).toBe(200);
      } finally {
        console.log = originalLog;
      }
      expect(mailLines.length).toBe(1);
      expect(mailLines[0]).toContain(emailFor('alert_watcher'));
      expect(mailLines[0]).toContain('first area');

      const alerts = await app.request('http://localhost:8787/alerts', {
        headers: jsonHeaders(watcher.token),
      });
      expect(alerts.status).toBe(200);
      const body = await alerts.json();
      expect(body.items.length).toBe(1);
      expect(body.items[0].area_name).toBe('first area');
      expect(body.items[0].incident.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(body.items[0].incident.description).toBe('inside watched area');
      expect(body.items[0].incident.username).toBe(usernameFor('alert_poster'));
      expect(body.items[0].incident.media.length).toBe(1);
      expect(body.items[0].incident.media[0].hash).toBe(payload.media[0]?.hash);

      const posterAlerts = await app.request('http://localhost:8787/alerts', {
        headers: jsonHeaders(poster.token),
      });
      expect((await posterAlerts.json()).items).toEqual([]);
    });

    it('does not alert for incidents outside saved areas', async () => {
      const watcher = await makeUser('alert_outside');
      const poster = await makeUser('alert_outside_poster');
      await createArea(watcher.token, 'far area');

      const far = incidentPayload({
        description: 'outside any area',
        location: { lon: -4.5, lat: 50.4 },
      });
      const res = await postIncident(poster.token, far);
      expect(res.status).toBe(200);

      const alerts = await app.request('http://localhost:8787/alerts', {
        headers: jsonHeaders(watcher.token),
      });
      expect((await alerts.json()).items).toEqual([]);
    });
  });

  describe('stats', () => {
    it('returns the public stats shape', async () => {
      const res = await app.request('http://localhost:8787/stats');
      expect(res.status).toBe(200);
      const stats = await res.json();
      expect(stats.total_incidents).toBeGreaterThan(0);
      expect(stats.by_type.length).toBeGreaterThan(0);
      expect(stats.by_type.some((row: { type: string }) => row.type === 'arrest')).toBe(true);
      expect(stats.by_force.length).toBeGreaterThan(0);
      expect(stats.series_30d.length).toBe(30);
      expect(stats.avg_rating === null || typeof stats.avg_rating === 'number').toBe(true);
    });

    it('accepts other periods', async () => {
      const res = await app.request('http://localhost:8787/stats?period=all');
      expect(res.status).toBe(200);
      const stats = await res.json();
      expect(stats.total_incidents).toBeGreaterThan(0);

      const bad = await app.request('http://localhost:8787/stats?period=forever');
      expect(bad.status).toBe(400);
    });

    it('returns per-user stats', async () => {
      const { token } = await makeUser('stats_me');
      await postIncident(token, incidentPayload());
      const res = await app.request('http://localhost:8787/stats/me', {
        headers: jsonHeaders(token),
      });
      expect(res.status).toBe(200);
      const stats = await res.json();
      expect(stats.total_incidents).toBe(1);
      expect(stats.total_views).toBe(0);
      expect(stats.ratings_given).toBe(0);
      expect(stats.saved_areas).toBe(0);
      expect(stats.alerts_received).toBe(0);
      expect(stats.avg_rating_received).toBeNull();
    });
  });

  describe('account deletion', () => {
    it('removes the account, keeps incidents, and nulls the author identity', async () => {
      const victim = await makeUser('del_victim');
      const rater = await makeUser('del_rater');
      const bystander = await makeUser('del_bystander');
      const owned = (await (await postIncident(victim.token, incidentPayload())).json()).id;
      const rated = (await (await postIncident(victim.token, incidentPayload())).json()).id;
      const bystanderIncident = (await (await postIncident(bystander.token, incidentPayload())).json()).id;

      const rateRes = await app.request(`http://localhost:8787/ratings/${rated}`, {
        method: 'PATCH',
        headers: jsonHeaders(rater.token),
        body: JSON.stringify({ appropriateness: 2, professionalism: 3, safety: 4 }),
      });
      expect(rateRes.status).toBe(200);
      const victimRating = await app.request(`http://localhost:8787/ratings/${bystanderIncident}`, {
        method: 'PATCH',
        headers: jsonHeaders(victim.token),
        body: JSON.stringify({ appropriateness: 5, professionalism: 5, safety: 5 }),
      });
      expect(victimRating.status).toBe(200);

      const areaRes = await createArea(victim.token, 'soon gone');
      expect(areaRes.status).toBe(200);

      const del = await app.request('http://localhost:8787/auth/me', {
        method: 'DELETE',
        headers: jsonHeaders(victim.token),
      });
      expect(del.status).toBe(200);

      const detail = await app.request(`http://localhost:8787/incident/${owned}`);
      expect(detail.status).toBe(200);
      const incident = await detail.json();
      expect(incident.user_id).toBeNull();
      expect(incident.username).toBeNull();

      const list = await app.request('http://localhost:8787/incidents');
      const listBody = await list.json();
      const listed = listBody.items.find((item: { id: string }) => item.id === owned);
      expect(listed).toBeTruthy();
      expect(listed.username).toBeNull();

      const areas = await app.request('http://localhost:8787/saved-areas', {
        headers: jsonHeaders(victim.token),
      });
      expect((await areas.json())).toEqual([]);

      const ratedSummary = await app.request(`http://localhost:8787/ratings/${rated}`);
      const ratedBody = await ratedSummary.json();
      expect(ratedBody.count).toBe(1);

      const bystanderSummary = await app.request(`http://localhost:8787/ratings/${bystanderIncident}`);
      expect((await bystanderSummary.json()).count).toBe(0);
    });
  });
});
