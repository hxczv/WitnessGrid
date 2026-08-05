# WitnessGrid Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ratings, full-text search, public + personal stats, saved-area alerts (in-app + optional email), and full account deletion (with incidents retained as anonymized public record) to the completed Phase 1 WitnessGrid stack.

**Architecture:** pnpm monorepo. `packages/contract` gains the new zod schemas; `infra/db/migrations/0002_phase2.sql` changes `incidents.user_id` to nullable `ON DELETE SET NULL` and adds constraints/tables/indexes; `backend` implements new repo functions + Hono routes (ratings, saved-areas, alerts, stats, account deletion, `q` search on the existing list query); `web` adds a feed search/filter bar, tap-rating panel, `/stats` pages, polygon draw + saved-area management, and a delete-account flow. Search uses a GIN expression index (deliberately NOT a generated column — generated `tsvector` columns broke on PG18 in Phase 1).

**Tech Stack:** pnpm, TypeScript strict, zod, Hono, porsager `postgres`, PostGIS, vitest, Next.js 15 App Router, React Query, Zustand, MapLibre GL JS, Playwright. No new runtime dependencies.

## Global Constraints

- TypeScript strict in every workspace. No `any` leaks.
- All enums/props come from `packages/contract` — never redefine enums in `web` or `backend`.
- Every mutating endpoint requires a valid JWT and passes through the existing rate limiter (`mutateRateLimit` in `backend/src/middleware/rate-limit.ts` — see Task 4 for its export name).
- All read paths (list, search, detail, stats, alerts) only ever surface `moderation_status='approved'` incidents. Removed/pending incidents never appear.
- `IncidentSchema.username` becomes nullable; the web UI renders "anonymous witness" for `null` usernames.
- Ratings: aggregate-only forever. No per-user rating list is ever rendered. Own incidents → 403.
- Account deletion erases the account + personal data (ratings, saved areas, alerts, tokens, flags cascade); incidents + media objects remain with `user_id` NULL.
- Times stored/transmitted UTC ISO-8601; render viewer-local.
- Palette tokens: `--ink #12151C`, `--surface #1A1E27`, `--paper #E8E6DE`, `--amber #E8A33D`, `--verified #4F8C7D`, `--flag #C24A3D`, `--line #2A2F3A`.
- No new runtime dependencies in `web` or `backend` (SVG charts are hand-rolled; polygon draw is hand-rolled).
- Integration tests require `RUN_DB_TESTS=1` AND `DATABASE_URL` in the environment (backend/tests/setup.ts throws without both).

---

### Task 0: Verify Phase 1 §14 exit criteria; file follow-ups

**Files:**
- Test: `backend/tests/integration/db.test.ts` (unchanged — re-run)
- Test: `web/e2e/*.spec.ts` (unchanged — re-run)

**Interfaces:**
- Consumes: running Postgres, backend on :8787, web on :3000 (from Phase 1)
- Produces: a written follow-up list (doc comment in the phase commit), green re-run evidence

- [ ] **Step 1: Re-run the full backend integration suite**

Run: `$env:RUN_DB_TESTS=1; $env:DATABASE_URL="postgres://postgres:postgres@localhost:5432/witnessgrid"; pnpm --filter @witnessgrid/backend run test`
Expected: 6 files, 29 tests passed, exit 0.

- [ ] **Step 2: Re-run web unit + e2e suites**

Run: `pnpm --filter @witnessgrid/web run test` then `$env:RUN_E2E=1; pnpm --filter @witnessgrid/web e2e`
Expected: 21 unit tests passed; 4 e2e tests passed.

- [ ] **Step 3: Walk the §14 checklist and write follow-ups**

Check: (1) `pnpm dev` runs all three tiers; (2) magic-link signup + capture + pin + register render on map/feed; (3) offline queue flushes on foreground/online; (4) SSR pages indexable with OG card; (5) PWA installable, `storage.persist` requested, reduced-motion/focus pass; (6) CI green, `.env.example` placeholders documented.
Any deviation becomes a bullet in the commit message body of the first Phase 2 commit.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: re-verify Phase 1 exit criteria (§14) — all green, no follow-ups beyond Phase 2 scope"
```

### Task 1: Contract — Phase 2 schemas

**Files:**
- Modify: `packages/contract/src/incidents.ts`
- Create: `packages/contract/src/rating.ts`
- Create: `packages/contract/src/saved-areas.ts`
- Create: `packages/contract/src/alerts.ts`
- Create: `packages/contract/src/stats.ts`
- Modify: `packages/contract/src/index.ts`
- Test: `packages/contract/tests/schemas.test.ts`

**Interfaces:**
- Produces (all exported from `@witnessgrid/contract`):
  - `RatingScoreSchema`, `RatingCreateSchema { incident_id: uuid; appropriateness: 1-5; professionalism: 1-5; safety: 1-5 }`, `RatingSummarySchema { appropriateness_avg: number|null; professionalism_avg: number|null; safety_avg: number|null; count: number; my_rating: { appropriateness; professionalism; safety } | null }`
  - `SavedAreaCreateSchema { name: string 1..40; polygon: array of [lon,lat] 3..32; alert_emails: boolean }`, `SavedAreaSchema` (adds `id: uuid`, `created_at: datetime`), `SavedAreaUpdateSchema { name?; alert_emails? }`
  - `AlertSchema { id: uuid; incident_id: uuid; saved_area_id: uuid; area_name: string; created_at: datetime; incident: Incident }`
  - `StatsPublicSchema { total_incidents: number; total_views: number; by_type: Array<{ type: IncidentType; count: number }>; by_force: Array<{ force: PoliceForce | 'other'; count: number }>; series_30d: Array<{ day: string; count: number }> }`
  - `StatsMeSchema { submissions: number; total_views: number; ratings_received_avg: { appropriateness; professionalism; safety } | null; ratings_received_count: number; recent_submissions: Incident[] }`

- [ ] **Step 1: Extend `ListIncidentsQuerySchema` and `IncidentSchema` in `packages/contract/src/incidents.ts`**

Add `q: z.string().min(2).max(100).optional(),` after `policeForce`; change line 49 `username: z.string(),` to `username: z.string().nullable(),`.

- [ ] **Step 2: Create `packages/contract/src/rating.ts`**

```ts
import { z } from 'zod';

export const RatingScoreSchema = z.number().int().min(1).max(5);
export const RatingCreateSchema = z.object({
  incident_id: z.string().uuid(),
  appropriateness: RatingScoreSchema,
  professionalism: RatingScoreSchema,
  safety: RatingScoreSchema,
});
export type RatingCreate = z.infer<typeof RatingCreateSchema>;

export const RatingSummarySchema = z.object({
  appropriateness_avg: z.number().nullable(),
  professionalism_avg: z.number().nullable(),
  safety_avg: z.number().nullable(),
  count: z.number().int().nonnegative(),
  my_rating: z
    .object({
      appropriateness: RatingScoreSchema,
      professionalism: RatingScoreSchema,
      safety: RatingScoreSchema,
    })
    .nullable(),
});
export type RatingSummary = z.infer<typeof RatingSummarySchema>;
```

- [ ] **Step 3: Create `packages/contract/src/saved-areas.ts`**

```ts
import { z } from 'zod';

const LngLatSchema = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
export const PolygonSchema = z.array(LngLatSchema).min(3).max(32);
export type Polygon = z.infer<typeof PolygonSchema>;

export const SavedAreaCreateSchema = z.object({
  name: z.string().min(1).max(40),
  polygon: PolygonSchema,
  alert_emails: z.boolean(),
});
export type SavedAreaCreate = z.infer<typeof SavedAreaCreateSchema>;

export const SavedAreaSchema = SavedAreaCreateSchema.extend({
  id: z.string().uuid(),
  created_at: z.string().datetime(),
});
export type SavedArea = z.infer<typeof SavedAreaSchema>;

export const SavedAreaUpdateSchema = z
  .object({ name: z.string().min(1).max(40), alert_emails: z.boolean() })
  .partial();
export type SavedAreaUpdate = z.infer<typeof SavedAreaUpdateSchema>;
```

- [ ] **Step 4: Create `packages/contract/src/alerts.ts`**

```ts
import { z } from 'zod';
import { IncidentSchema } from './incidents';

export const AlertSchema = z.object({
  id: z.string().uuid(),
  incident_id: z.string().uuid(),
  saved_area_id: z.string().uuid(),
  area_name: z.string(),
  created_at: z.string().datetime(),
  incident: IncidentSchema,
});
export type Alert = z.infer<typeof AlertSchema>;
```

- [ ] **Step 5: Create `packages/contract/src/stats.ts`**

```ts
import { z } from 'zod';
import { INCIDENT_TYPES, POLICE_FORCES } from './enums';
import { IncidentSchema } from './incidents';

export const StatsPublicSchema = z.object({
  total_incidents: z.number().int().nonnegative(),
  total_views: z.number().int().nonnegative(),
  by_type: z.array(z.object({ type: z.enum(INCIDENT_TYPES), count: z.number().int().nonnegative() })),
  by_force: z.array(z.object({ force: z.enum([...POLICE_FORCES, 'other'] as const), count: z.number().int().nonnegative() })),
  series_30d: z.array(z.object({ day: z.string(), count: z.number().int().nonnegative() })),
});
export type StatsPublic = z.infer<typeof StatsPublicSchema>;

export const StatsMeSchema = z.object({
  submissions: z.number().int().nonnegative(),
  total_views: z.number().int().nonnegative(),
  ratings_received_avg: z
    .object({ appropriateness: z.number(), professionalism: z.number(), safety: z.number() })
    .nullable(),
  ratings_received_count: z.number().int().nonnegative(),
  recent_submissions: z.array(IncidentSchema).max(5),
});
export type StatsMe = z.infer<typeof StatsMeSchema>;
```

- [ ] **Step 6: Export new modules from `packages/contract/src/index.ts`**

Add lines: `export * from './rating';`, `export * from './saved-areas';`, `export * from './alerts';`, `export * from './stats';`.

- [ ] **Step 7: Extend `packages/contract/tests/schemas.test.ts`**

Add tests: valid `RatingCreateSchema` parses; score 0 and 6 fail; `SavedAreaCreateSchema` with 2 vertices fails, 33 fails, out-of-range lon fails, 32 passes; `SavedAreaUpdateSchema` partial ok; `ListIncidentsQuerySchema` with `q: 'ab'` passes and `q: 'a'` fails; `IncidentSchema` with `username: null` parses; `StatsPublicSchema`/`StatsMeSchema` accept their shapes; `AlertSchema` requires an `incident` object.

- [ ] **Step 8: Run contract tests**

Run: `pnpm --filter @witnessgrid/contract test`
Expected: all pass (new + existing).

- [ ] **Step 9: Commit**

```bash
git add packages/contract
git commit -m "feat(contract): Phase 2 schemas — rating, saved areas, alerts, stats, search q, nullable username"
```

### Task 2: Infra — migration 0002

**Files:**
- Create: `infra/db/migrations/0002_phase2.sql`
- Test: `infra/db/migrate.ts` (unchanged — runner applies unapplied migrations in order)

**Interfaces:**
- Produces: live DB with `incidents.user_id` nullable + `ON DELETE SET NULL`, `ratings` unique key, `saved_areas` name/alert_emails columns, `area_alerts` table, `incidents_search_idx` GIN expression index.

- [ ] **Step 1: Write the migration**

```sql
-- Phase 2: ratings uniqueness, saved areas + alerts, search index,
-- and account-deletion semantics (incidents outlive their author).

-- Account deletion keeps incidents as public record: detach the owner.
ALTER TABLE incidents DROP CONSTRAINT incidents_user_id_fkey;
ALTER TABLE incidents ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE incidents ADD CONSTRAINT incidents_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

-- One rating per (incident, user); POST /rating upserts on this key.
ALTER TABLE ratings ADD CONSTRAINT ratings_incident_user_key UNIQUE (incident_id, user_id);
CREATE INDEX ratings_incident_idx ON ratings (incident_id);

-- Saved areas gain a name and the email-alert opt-in.
ALTER TABLE saved_areas ADD COLUMN name text NOT NULL DEFAULT '';
ALTER TABLE saved_areas ADD COLUMN alert_emails boolean NOT NULL DEFAULT false;
CREATE INDEX saved_areas_user_idx ON saved_areas (user_id);

-- In-app alerts: one per (user, incident) even when polygons overlap.
CREATE TABLE area_alerts (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  saved_area_id uuid NOT NULL REFERENCES saved_areas(id) ON DELETE CASCADE,
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, incident_id)
);
CREATE INDEX area_alerts_user_created_idx ON area_alerts (user_id, created_at DESC);

-- Full-text search. Expression index (not a generated column — PG18-safe).
CREATE INDEX incidents_search_idx ON incidents USING gin (
  to_tsvector('english', description || ' ' || type::text || ' ' || police_force::text)
);
```

- [ ] **Step 2: Apply the migration to the live database**

Run: `node infra/db/migrate.ts` (workdir `infra/db`)
Expected: applies `0002_phase2.sql`; exit 0. Run again to confirm no-op.

- [ ] **Step 3: Verify schema state via psql**

Run:
```sql
SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name='incidents' AND column_name='user_id';
SELECT conname, confdeltype FROM pg_constraint WHERE conrelid='incidents'::regclass AND contype='f';
SELECT indexname FROM pg_indexes WHERE tablename='incidents' AND indexname='incidents_search_idx';
```
Expected: `user_id` nullable; FK delete action `n` (SET NULL); search index present.

- [ ] **Step 4: Commit**

```bash
git add infra/db/migrations/0002_phase2.sql
git commit -m "feat(infra): Phase 2 migration — ratings key, saved areas, alerts, search index, SET NULL owner"
```

### Task 3: Backend repo layer

**Files:**
- Modify: `backend/src/repo.ts`
- Modify: `backend/src/routes/list.ts` (LEFT JOIN — see step 1)
- Test: `backend/tests/integration/db.test.ts` (new tests in Task 5)

**Interfaces:**
- Consumes: `RatingCreate`, `SavedAreaCreate`, `SavedAreaUpdate`, `StatsPublic`, `StatsMe`, `Alert` types from `@witnessgrid/contract`; `db`/`q` helpers already in `repo.ts`.
- Produces:
  - `upsertRating(incidentId: string, userId: string, scores: {appropriateness; professionalism; safety}): Promise<void>`
  - `getRatingSummary(incidentId: string, userId: string | null): Promise<RatingSummary>`
  - `createSavedArea(userId: string, input: SavedAreaCreate): Promise<SavedArea>`
  - `listSavedAreas(userId: string): Promise<SavedArea[]>`
  - `updateSavedArea(userId: string, id: string, patch: SavedAreaUpdate): Promise<SavedArea>`
  - `deleteSavedArea(userId: string, id: string): Promise<void>`
  - `listAlerts(userId: string, limit?: number): Promise<Alert[]>`
  - `getStatsPublic(): Promise<StatsPublic>`
  - `getStatsMe(userId: string): Promise<StatsMe>`
  - `deleteUserAccount(userId: string): Promise<void>`
  - `getIncident` / `listIncidents` / `listUserIncidents` / `createIncident` signature changes below.

- [ ] **Step 1: Make incident reads owner-optional (LEFT JOIN)**

In `backend/src/routes/list.ts` `getIncident`, `backend/src/repo.ts` `getIncident`/`listIncidents`/`listUserIncidents`: replace `JOIN users u ON u.id = i.user_id` with `LEFT JOIN users u ON u.id = i.user_id`, keep `u.username` in the select (becomes `string | null`).
In `repo.ts`: `serializeIncident(row, media, collarNumbers, username: string | null)` — `IncidentBaseRow` gains no change; the row type becomes `IncidentBaseRow & { username: string | null }`. In `createIncident` the user always exists, so `username` stays `string` — pass `userRows[0]?.username ?? ''` unchanged (keeps old behavior for the POST response).
In `web`-visible output, `username: null` now flows through when the author was deleted.

- [ ] **Step 2: Add ratings repo functions**

```ts
export async function upsertRating(
  incidentId: string,
  userId: string,
  scores: { appropriateness: number; professionalism: number; safety: number },
): Promise<void> {
  await db`
    INSERT INTO ratings (id, incident_id, user_id, appropriateness, professionalism, safety)
    VALUES (${crypto.randomUUID()}, ${incidentId}, ${userId}, ${scores.appropriateness}, ${scores.professionalism}, ${scores.safety})
    ON CONFLICT (incident_id, user_id) DO UPDATE SET
      appropriateness = EXCLUDED.appropriateness,
      professionalism = EXCLUDED.professionalism,
      safety = EXCLUDED.safety
  `;
}

export async function getRatingSummary(
  incidentId: string,
  userId: string | null,
): Promise<RatingSummary> {
  const agg = await q<Array<{ a: string | null; p: string | null; s: string | null; c: number }>>`
    SELECT round(avg(appropriateness)::numeric, 1)::text AS a,
      round(avg(professionalism)::numeric, 1)::text AS p,
      round(avg(safety)::numeric, 1)::text AS s,
      count(*)::int AS c
    FROM ratings WHERE incident_id = ${incidentId}
  `;
  const row = agg[0];
  let my = null;
  if (userId) {
    const mine = await q<Array<{ appropriateness: number; professionalism: number; safety: number }>>`
      SELECT appropriateness, professionalism, safety FROM ratings
      WHERE incident_id = ${incidentId} AND user_id = ${userId} LIMIT 1
    `;
    if (mine[0]) {
      my = { appropriateness: mine[0].appropriateness, professionalism: mine[0].professionalism, safety: mine[0].safety };
    }
  }
  if (!row) return { appropriateness_avg: null, professionalism_avg: null, safety_avg: null, count: 0, my_rating: my };
  return {
    appropriateness_avg: row.a === null ? null : Number(row.a),
    professionalism_avg: row.p === null ? null : Number(row.p),
    safety_avg: row.s === null ? null : Number(row.s),
    count: row.c,
    my_rating: my,
  };
}
```

(avg() returns `numeric`; porsager serializes it as a string in some versions — the `::text` cast then `Number()` avoids that trap.)

- [ ] **Step 3: Add saved-areas repo functions**

```ts
const AREA_MAX_SQKM = 10_000;

function polygonToSqlRing(polygon: Polygon): string {
  const ring = [...polygon, polygon[0]!].map(([lon, lat]) => `${lon} ${lat}`).join(',');
  return `SRID=4326;POLYGON((${ring}))`;
}

export async function createSavedArea(userId: string, input: SavedAreaCreate): Promise<SavedArea> {
  const countRows = await q<{ n: number }[]>`SELECT count(*)::int AS n FROM saved_areas WHERE user_id = ${userId}`;
  if ((countRows[0]?.n ?? 0) >= 10) throw new ApiError(errorCodes.CONFLICT, 'you can save at most 10 areas');
  const geomSql = polygonToSqlRing(input.polygon);
  const rows = await q<Array<{ id: string; created_at: Date }>>`
    INSERT INTO saved_areas (id, user_id, bounds, name, alert_emails)
    VALUES (${crypto.randomUUID()}, ${userId}, ST_GeogFromText(${geomSql}), ${input.name}, ${input.alert_emails})
    RETURNING id, created_at
  `;
  const row = rows[0];
  if (!row) throw new ApiError(errorCodes.STORAGE, 'saved area insert returned no row');
  const sqm = await q<{ area: number }[]>`SELECT ST_Area(bounds) AS area FROM saved_areas WHERE id = ${row.id}`;
  if ((sqm[0]?.area ?? 0) > AREA_MAX_SQKM * 1_000_000) {
    await db`DELETE FROM saved_areas WHERE id = ${row.id}`;
    throw new ApiError(errorCodes.VALIDATION, 'area is larger than the 10,000 km² limit');
  }
  return { id: row.id, name: input.name, polygon: input.polygon, alert_emails: input.alert_emails, created_at: row.created_at.toISOString() };
}

export async function listSavedAreas(userId: string): Promise<SavedArea[]> {
  const rows = await q<Array<{ id: string; name: string; alert_emails: boolean; created_at: Date; wkt: string }>>`
    SELECT id, name, alert_emails, created_at, ST_AsText(bounds::geometry) AS wkt
    FROM saved_areas WHERE user_id = ${userId} ORDER BY created_at DESC
  `;
  return rows.map((r) => ({ id: r.id, name: r.name, polygon: parseWktPolygon(r.wkt), alert_emails: r.alert_emails, created_at: r.created_at.toISOString() }));
}

export async function updateSavedArea(userId: string, id: string, patch: SavedAreaUpdate): Promise<SavedArea> {
  const sets: string[] = [];
  const params: unknown[] = [userId, id];
  if (patch.name !== undefined) { params.push(patch.name); sets.push(`name = $${params.length}`); }
  if (patch.alert_emails !== undefined) { params.push(patch.alert_emails); sets.push(`alert_emails = $${params.length}`); }
  if (sets.length === 0) throw new ApiError(errorCodes.VALIDATION, 'nothing to update');
  const rows = await q.unsafe<Array<{ id: string; name: string; alert_emails: boolean; created_at: Date; wkt: string }>>(
    `UPDATE saved_areas SET ${sets.join(', ')} WHERE user_id = $1 AND id = $2
     RETURNING id, name, alert_emails, created_at, ST_AsText(bounds::geometry) AS wkt`,
    params,
  );
  const row = rows[0];
  if (!row) throw new ApiError(errorCodes.NOT_FOUND, 'saved area not found');
  return { id: row.id, name: row.name, polygon: parseWktPolygon(row.wkt), alert_emails: row.alert_emails, created_at: row.created_at.toISOString() };
}

export async function deleteSavedArea(userId: string, id: string): Promise<void> {
  const rows = await q<{ id: string }[]>`DELETE FROM saved_areas WHERE user_id = ${userId} AND id = ${id} RETURNING id`;
  if (!rows[0]) throw new ApiError(errorCodes.NOT_FOUND, 'saved area not found');
}
```

Add helper (top of file, next to `serializeIncident`):

```ts
function parseWktPolygon(wkt: string): Polygon {
  const match = /^POLYGON\(\((.+)\)\)$/i.exec(wkt);
  if (!match) throw new ApiError(errorCodes.STORAGE, 'unparseable polygon from database');
  return match[1]!.split(',').map((pair) => {
    const [lon, lat] = pair.trim().split(' ').map(Number) as [number, number];
    return [lon, lat];
  });
}
```

Import `Polygon` type from contract at the top.

- [ ] **Step 4: Add alerts repo function + createIncident hook**

```ts
export async function listAlerts(userId: string, limit = 50): Promise<Alert[]> {
  const rows = await q<Array<{ id: string; incident_id: string; saved_area_id: string; area_name: string; created_at: Date; incident: Incident }>>`
    SELECT a.id, a.incident_id, a.saved_area_id, sa.name AS area_name, a.created_at,
      jsonb_build_object(
        'id', i.id, 'user_id', i.user_id, 'client_id', i.client_id, 'incident_type', i.type,
        'police_force', i.police_force, 'timestamp', i."timestamp", 'description', i.description,
        'officer_count', i.officer_count, 'created_at', i.created_at, 'view_count', i.view_count,
        'moderation_status', i.moderation_status, 'latitude', ST_Y(i.location::geometry),
        'longitude', ST_X(i.location::geometry), 'username', u.username, 'media', COALESCE((
          SELECT jsonb_agg(jsonb_build_object('key', m.url, 'type', m.type, 'hash', m.sha256, 'thumbnail_key', m.thumbnail_url))
          FROM media m WHERE m.incident_id = i.id
        ), '[]'::jsonb), 'collar_numbers', COALESCE((
          SELECT jsonb_agg(o.collar_number) FROM officers o WHERE o.incident_id = i.id
        ), '[]'::jsonb)
      ) AS incident
    FROM area_alerts a
    JOIN saved_areas sa ON sa.id = a.saved_area_id
    JOIN incidents i ON i.id = a.incident_id
    LEFT JOIN users u ON u.id = i.user_id
    WHERE a.user_id = ${userId}
    ORDER BY a.created_at DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({ ...r, incident: normalizeAlertIncident(r.incident) }));
}
```

`normalizeAlertIncident` converts the jsonb row into a contract `Incident` (ISO timestamps, `collar_numbers` dropped when empty, `officer_count` omitted when null — mirror `serializeIncident` field rules). Implement it as a small mapper in `repo.ts`:

```ts
function normalizeAlertIncident(raw: Record<string, unknown>): Incident {
  return {
    id: raw.id as string,
    user_id: raw.user_id as string,
    client_id: raw.client_id as string,
    incident_type: raw.incident_type as Incident['incident_type'],
    police_force: raw.police_force as Incident['police_force'],
    timestamp: new Date(raw.timestamp as string).toISOString(),
    description: raw.description as string,
    ...(raw.officer_count !== null && raw.officer_count !== undefined && { officer_count: raw.officer_count as number }),
    ...((raw.collar_numbers as unknown[]).length > 0 && { collar_numbers: raw.collar_numbers as string[] }),
    media: raw.media as MediaReference[],
    created_at: new Date(raw.created_at as string).toISOString(),
    view_count: raw.view_count as number,
    moderation_status: raw.moderation_status as Incident['moderation_status'],
    latitude: raw.latitude as number,
    longitude: raw.longitude as number,
    username: raw.username as string | null,
  };
}
```

In `createIncident`, after the media/officers inserts and before returning, call a new helper `fireAreaAlerts(incidentId, lon, lat, inputDescription, inputType, inputForce)` (defined below) — but only when the transaction succeeds. Since the neon adapter has no `begin`, structure it as: extract the alert logic into `fireAreaAlerts` called after `run(db)` returns in both branches (post-commit). Signature:

```ts
export async function fireAreaAlerts(incident: Incident): Promise<void> {
  const lon = incident.longitude;
  const lat = incident.latitude;
  const areas = await q<Array<{ id: string; name: string; alert_emails: boolean; email: string | null }>>`
    SELECT sa.id, sa.name, sa.alert_emails, u.email
    FROM saved_areas sa
    JOIN users u ON u.id = sa.user_id
    WHERE ST_Intersects(sa.bounds, ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography)
  `;
  for (const area of areas) {
    const inserted = await q<{ id: string }[]>`
      INSERT INTO area_alerts (id, user_id, saved_area_id, incident_id)
      VALUES (${crypto.randomUUID()}, (SELECT user_id FROM saved_areas WHERE id = ${area.id}), ${area.id}, ${incident.id})
      ON CONFLICT (user_id, incident_id) DO NOTHING
      RETURNING id
    `;
    if (inserted[0] && area.alert_emails && area.email) {
      await sendAreaAlert(area.email, area.name, incident);
    }
  }
}
```

Add `sendAreaAlert` to `backend/src/email.ts` (Task 4 step 2) and import it in `repo.ts`.

- [ ] **Step 5: Search + stats repo functions**

In `listIncidents`, after the `policeForce` addBound (line ~263), add:

```ts
const { q: searchQuery } = query;
if (searchQuery !== undefined) {
  conditions.push(`to_tsvector('english', i.description || ' ' || i.type::text || ' ' || i.police_force::text) @@ websearch_to_tsquery('english', $${params.length + 1})`);
  params.push(searchQuery);
}
```

(Adjust `limitWithProbe` unchanged. `q` composes with cursor naturally — the cursor condition is separate ANDed clause.)

Add at end of file:

```ts
export async function getStatsPublic(): Promise<StatsPublic> {
  const totals = await q<Array<{ total: number; views: number }>>`
    SELECT count(*)::int AS total, COALESCE(sum(view_count), 0)::int AS views
    FROM incidents WHERE moderation_status = 'approved'
  `;
  const byType = await q<Array<{ type: string; count: number }>>`
    SELECT type, count(*)::int AS count FROM incidents
    WHERE moderation_status = 'approved' GROUP BY type ORDER BY count(*) DESC
  `;
  const topForces = await q<Array<{ force: string; count: number }>>`
    SELECT police_force AS force, count(*)::int AS count FROM incidents
    WHERE moderation_status = 'approved' GROUP BY police_force ORDER BY count(*) DESC LIMIT 10
  `;
  let otherCount = 0;
  if (topForces.length > 0) {
    const names = topForces.map((f) => f.force);
    const rest = await q.unsafe<Array<{ n: number }>>(
      `SELECT count(*)::int AS n FROM incidents WHERE moderation_status = 'approved' AND police_force NOT IN (${names.map((_, i) => `$${i + 1}`).join(',')})`,
      names,
    );
    otherCount = rest[0]?.n ?? 0;
  }
  const series = await q<Array<{ day: Date; count: number }>>`
    SELECT d.day::date AS day, count(i.id)::int AS count
    FROM generate_series(now() - interval '29 days', now(), interval '1 day') AS d(day)
    LEFT JOIN incidents i ON i."timestamp"::date = d.day::date AND i.moderation_status = 'approved'
    GROUP BY d.day ORDER BY d.day
  `;
  return {
    total_incidents: totals[0]?.total ?? 0,
    total_views: totals[0]?.views ?? 0,
    by_type: byType.map((r) => ({ type: r.type as StatsPublic['by_type'][number]['type'], count: r.count })),
    by_force: [...topForces.map((r) => ({ force: r.force as StatsPublic['by_force'][number]['force'], count: r.count })), ...(otherCount > 0 ? [{ force: 'other' as const, count: otherCount }] : [])],
    series_30d: series.map((r) => ({ day: r.day.toISOString().slice(0, 10), count: r.count })),
  };
}

export async function getStatsMe(userId: string): Promise<StatsMe> {
  const me = await q<Array<{ submissions: number; views: number }>>`
    SELECT count(*)::int AS submissions, COALESCE(sum(view_count), 0)::int AS views
    FROM incidents WHERE user_id = ${userId}
  `;
  const ratings = await q<Array<{ a: string | null; p: string | null; s: string | null; c: number }>>`
    SELECT round(avg(r.appropriateness)::numeric, 1)::text AS a, round(avg(r.professionalism)::numeric, 1)::text AS p,
      round(avg(r.safety)::numeric, 1)::text AS s, count(*)::int AS c
    FROM ratings r JOIN incidents i ON i.id = r.incident_id
    WHERE i.user_id = ${userId}
  `;
  const recent = await listUserIncidents(userId, { limit: 5 });
  const r = ratings[0];
  return {
    submissions: me[0]?.submissions ?? 0,
    total_views: me[0]?.views ?? 0,
    ratings_received_avg: r && r.c > 0 ? { appropriateness: Number(r.a), professionalism: Number(r.p), safety: Number(r.s) } : null,
    ratings_received_count: r?.c ?? 0,
    recent_submissions: recent.items,
  };
}

export async function deleteUserAccount(userId: string): Promise<void> {
  const rows = await q<{ id: string }[]>`DELETE FROM users WHERE id = ${userId} RETURNING id`;
  if (!rows[0]) throw new ApiError(errorCodes.NOT_FOUND, 'account not found');
}
```

- [ ] **Step 6: Extend `getIncident` to return the rating summary**

Change the `GET /incident/:id` handler in `backend/src/routes/list.ts` (route returns `Incident` today). New response shape: `Incident & { rating_summary?: RatingSummary }` — only include `rating_summary` when `count > 0`. In the handler:

```ts
import { getRatingSummary } from '../repo.js';
// ...
const incident = await getIncident(id, c.get('userId') ?? null);
if (!incident) throw new ApiError(errorCodes.NOT_FOUND, 'incident not found');
const summary = await getRatingSummary(id, c.get('userId') ?? null);
const body = summary.count > 0 ? { ...incident, rating_summary: summary } : incident;
return c.json(body);
```

- [ ] **Step 7: Typecheck**

Run: `pnpm --filter @witnessgrid/backend typecheck`
Expected: exit 0. (Unit-only failures here would come from unused imports — fix if flagged.)

- [ ] **Step 8: Commit**

```bash
git add backend/src
git commit -m "feat(backend): Phase 2 repo layer — ratings, saved areas, alerts, stats, search, account deletion"
```

### Task 4: Backend routes + email

**Files:**
- Create: `backend/src/routes/ratings.ts`
- Create: `backend/src/routes/saved-areas.ts`
- Create: `backend/src/routes/stats.ts`
- Modify: `backend/src/routes/auth.ts` (add `DELETE /auth/me`)
- Modify: `backend/src/app.ts` (wire routes)
- Modify: `backend/src/email.ts` (add `sendAreaAlert`)
- Test: Task 5

**Interfaces:**
- Consumes: repo functions from Task 3; `requireAuth` from `../middleware/auth.js`; `mutateRateLimit` from `../rate-limit.js` (check exact export — `backend/src/routes/incidents.ts` imports `mutateRateLimit` from `'../rate-limit.js'`; keep that import path); `validationError` from `../errors.js`.
- Produces: `POST /rating`, `POST/GET/PATCH/DELETE /saved-areas`, `GET /saved-areas/:id` NOT defined (list only), `GET /alerts`, `GET /stats`, `GET /stats/me`, `DELETE /auth/me`.

- [ ] **Step 1: Create `backend/src/routes/ratings.ts`**

```ts
import { Hono } from 'hono';
import { RatingCreateSchema } from '@witnessgrid/contract';
import { ApiError, errorCodes, validationError } from '../errors.js';
import { jsonBodyLimit } from '../middleware/body-limit.js';
import { requireAuth } from '../middleware/auth.js';
import { mutateRateLimit } from '../rate-limit.js';
import { getIncident, upsertRating } from '../repo.js';
import type { AppEnv } from '../env.js';

export const ratingRoutes = new Hono<AppEnv>();

ratingRoutes.post('/rating', requireAuth, mutateRateLimit, jsonBodyLimit, async (c) => {
  const userId = c.get('userId');
  if (!userId) throw new ApiError(errorCodes.UNAUTHORIZED, 'authentication required');
  const body = await c.req.json().catch(() => null);
  const parsed = RatingCreateSchema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error);

  const incident = await getIncident(parsed.data.incident_id, userId);
  if (!incident) throw new ApiError(errorCodes.NOT_FOUND, 'incident not found');
  if (incident.user_id === userId) {
    throw new ApiError(errorCodes.FORBIDDEN, 'you cannot rate your own incident');
  }

  const { incident_id, ...scores } = parsed.data;
  await upsertRating(incident_id, userId, scores);
  return c.json({ ok: true });
});
```

Note: `getIncident` increments `view_count` on every call — acceptable here (it's a read path); do NOT add a separate existence query.

- [ ] **Step 2: Add `sendAreaAlert` to `backend/src/email.ts`**

```ts
export async function sendAreaAlert(
  to: string,
  areaName: string,
  incident: { id: string; incident_type: string; police_force: string },
): Promise<void> {
  const url = `${config.PUBLIC_ORIGIN}/incident/${incident.id}`;
  if (config.RESEND_API_KEY) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${config.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: config.EMAIL_FROM,
        to: [to],
        subject: `[area-alert] New record near "${areaName}"`,
        text: `A new record was filed in your saved area "${areaName}" (${incident.incident_type}, ${incident.police_force}): ${url}`,
        html: `<p>A new record was filed in your saved area "<strong>${areaName}</strong>" (${incident.incident_type}, ${incident.police_force}).</p><p><a href="${url}">${url}</a></p>`,
      }),
    });
    if (!response.ok) {
      const resBody = await response.text().catch(() => '');
      throw new ApiError(errorCodes.STORAGE, `email provider error ${response.status}: ${resBody.slice(0, 300)}`);
    }
    return;
  }
  console.log(`[dev-mail][area-alert] to ${to} area="${areaName}" incident=${incident.id}`);
  try {
    const fs = await import('node:fs');
    const logUrl = new URL('../.dev-mail.log', import.meta.url);
    fs.appendFileSync(logUrl, `${JSON.stringify({ at: new Date().toISOString(), to, kind: 'area-alert', area: areaName, incidentId: incident.id, url })}\n`);
  } catch {
    /* best-effort */
  }
}
```

- [ ] **Step 3: Create `backend/src/routes/saved-areas.ts`**

```ts
import { Hono } from 'hono';
import { SavedAreaCreateSchema, SavedAreaUpdateSchema } from '@witnessgrid/contract';
import { ApiError, errorCodes, validationError } from '../errors.js';
import { jsonBodyLimit } from '../middleware/body-limit.js';
import { requireAuth } from '../middleware/auth.js';
import { mutateRateLimit } from '../rate-limit.js';
import { createSavedArea, deleteSavedArea, listSavedAreas, updateSavedArea } from '../repo.js';
import type { AppEnv } from '../env.js';

export const savedAreaRoutes = new Hono<AppEnv>();

savedAreaRoutes.get('/saved-areas', requireAuth, async (c) => {
  const userId = c.get('userId');
  if (!userId) throw new ApiError(errorCodes.UNAUTHORIZED, 'authentication required');
  return c.json(await listSavedAreas(userId));
});

savedAreaRoutes.post('/saved-areas', requireAuth, mutateRateLimit, jsonBodyLimit, async (c) => {
  const userId = c.get('userId');
  if (!userId) throw new ApiError(errorCodes.UNAUTHORIZED, 'authentication required');
  const body = await c.req.json().catch(() => null);
  const parsed = SavedAreaCreateSchema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error);
  return c.json(await createSavedArea(userId, parsed.data));
});

savedAreaRoutes.patch('/saved-areas/:id', requireAuth, mutateRateLimit, jsonBodyLimit, async (c) => {
  const userId = c.get('userId');
  if (!userId) throw new ApiError(errorCodes.UNAUTHORIZED, 'authentication required');
  const id = c.req.param('id');
  if (!id) throw new ApiError(errorCodes.NOT_FOUND, 'saved area not found');
  const body = await c.req.json().catch(() => null);
  const parsed = SavedAreaUpdateSchema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error);
  return c.json(await updateSavedArea(userId, id, parsed.data));
});

savedAreaRoutes.delete('/saved-areas/:id', requireAuth, mutateRateLimit, async (c) => {
  const userId = c.get('userId');
  if (!userId) throw new ApiError(errorCodes.UNAUTHORIZED, 'authentication required');
  const id = c.req.param('id');
  if (!id) throw new ApiError(errorCodes.NOT_FOUND, 'saved area not found');
  await deleteSavedArea(userId, id);
  return c.json({ ok: true });
});

savedAreaRoutes.get('/alerts', requireAuth, async (c) => {
  const userId = c.get('userId');
  if (!userId) throw new ApiError(errorCodes.UNAUTHORIZED, 'authentication required');
  return c.json(await listAlerts(userId));
});
```

(import `listAlerts` in the same import statement.)

- [ ] **Step 4: Create `backend/src/routes/stats.ts`**

```ts
import { Hono } from 'hono';
import { ApiError, errorCodes } from '../errors.js';
import { requireAuth } from '../middleware/auth.js';
import { getStatsMe, getStatsPublic } from '../repo.js';
import type { AppEnv } from '../env.js';

export const statsRoutes = new Hono<AppEnv>();

statsRoutes.get('/stats', async (c) => c.json(await getStatsPublic()));

statsRoutes.get('/stats/me', requireAuth, async (c) => {
  const userId = c.get('userId');
  if (!userId) throw new ApiError(errorCodes.UNAUTHORIZED, 'authentication required');
  return c.json(await getStatsMe(userId));
});
```

- [ ] **Step 5: Add `DELETE /auth/me` to `backend/src/routes/auth.ts`**

Inspect the existing `authRoutes` (magic-link/verify/me). Add:

```ts
authRoutes.delete('/auth/me', requireAuth, mutateRateLimit, async (c) => {
  const userId = c.get('userId');
  if (!userId) throw new ApiError(errorCodes.UNAUTHORIZED, 'authentication required');
  await deleteUserAccount(userId);
  return c.json({ ok: true });
});
```

(imports: `deleteUserAccount` from `../repo.js`, `mutateRateLimit` from `../rate-limit.js`.)

- [ ] **Step 6: Wire routes in `backend/src/app.ts`**

Add imports + `app.route('/', ratingRoutes); app.route('/', savedAreaRoutes); app.route('/', statsRoutes);` after the existing `mediaServeRoutes` line.

- [ ] **Step 7: Typecheck + boot check**

Run: `pnpm --filter @witnessgrid/backend typecheck` — exit 0.
Restart the backend (`pnpm --filter @witnessgrid/backend start`) and curl:
- `GET http://localhost:8787/stats` → 200 JSON with the six stats fields.
- `GET http://localhost:8787/saved-areas` without token → 401.
- `POST http://localhost:8787/rating` without token → 401.

- [ ] **Step 8: Commit**

```bash
git add backend/src
git commit -m "feat(backend): Phase 2 routes — ratings, saved areas, alerts, stats, account deletion, area-alert email"
```

### Task 5: Backend integration tests

**Files:**
- Modify: `backend/tests/integration/db.test.ts` (append describe blocks inside the existing `describe.skipIf(!enabled)` suite — follow the existing `makeUser`/`incidentPayload` helpers)

**Interfaces:**
- Consumes: everything from Tasks 1–4.

- [ ] **Step 1: Rating tests**

Inside the suite (before `afterAll`):
```ts
it('upserts and replaces a rating; 403 on own incident', async () => {
  const owner = await makeUser('rateowner');
  const rater = await makeUser('rater');
  const payload = incidentPayload();
  const created = await (await postIncident(owner.token, payload)).json();

  const own = await app.request('http://localhost:8787/rating', {
    method: 'POST', headers: jsonHeaders(owner.token),
    body: JSON.stringify({ incident_id: created.id, appropriateness: 5, professionalism: 5, safety: 5 }),
  });
  expect(own.status).toBe(403);

  const rate = (scores: object) =>
    app.request('http://localhost:8787/rating', {
      method: 'POST', headers: jsonHeaders(rater.token),
      body: JSON.stringify({ incident_id: created.id, ...scores }),
    });
  const first = await rate({ appropriateness: 3, professionalism: 4, safety: 2 });
  expect(first.status).toBe(200);
  const second = await rate({ appropriateness: 1, professionalism: 1, safety: 1 });
  expect(second.status).toBe(200);

  const detail = await (await app.request(`http://localhost:8787/incident/${created.id}`, { headers: jsonHeaders(rater.token) })).json();
  expect(detail.rating_summary.count).toBe(1);
  expect(detail.rating_summary.my_rating.appropriateness).toBe(1);
  expect(detail.rating_summary.appropriateness_avg).toBe(1);

  const guest = await app.request('http://localhost:8787/incident/' + created.id);
  const guestBody = await guest.json();
  expect(guestBody.rating_summary.my_rating).toBeNull();

  const bad = await rate({ appropriateness: 0, professionalism: 4, safety: 2 });
  expect(bad.status).toBe(400);
  const missing = await app.request('http://localhost:8787/rating', {
    method: 'POST', headers: jsonHeaders(rater.token),
    body: JSON.stringify({ incident_id: crypto.randomUUID(), appropriateness: 3, professionalism: 3, safety: 3 }),
  });
  expect(missing.status).toBe(404);
});
```

- [ ] **Step 2: Search tests**

```ts
it('filters by full-text search q, composing with type and cursor', async () => {
  const { token } = await makeUser('searcher');
  const a = await postIncident(token, incidentPayload({ description: 'blue bicycle theft on the high street', incident_type: 'other' }));
  const b = await postIncident(token, incidentPayload({ description: 'unrelated paperwork', incident_type: 'arrest' }));
  const aBody = await a.json();
  const bBody = await b.json();

  const hit = await (await app.request('http://localhost:8787/incidents?q=high+street')).json();
  expect(hit.items.some((i: { id: string }) => i.id === aBody.id)).toBe(true);
  expect(hit.items.some((i: { id: string }) => i.id === bBody.id)).toBe(false);

  const typeScoped = await (await app.request('http://localhost:8787/incidents?q=street&type=arrest')).json();
  expect(typeScoped.items.some((i: { id: string }) => i.id === aBody.id)).toBe(false);

  const short = await app.request('http://localhost:8787/incidents?q=a');
  expect(short.status).toBe(400);

  const none = await (await app.request('http://localhost:8787/incidents?q=zzzzznotaword')).json();
  expect(none.items).toHaveLength(0);
});
```

- [ ] **Step 3: Saved areas tests**

```ts
it('validates, caps and CRUDs saved areas; alerts fire for new incidents inside', async () => {
  const { token, user } = await makeUser('saver');
  const polygon = [[-0.2, 51.5], [-0.1, 51.5], [-0.1, 51.6], [-0.2, 51.6]];
  const body = { name: 'central london', polygon, alert_emails: true };
  const createdRes = await app.request('http://localhost:8787/saved-areas', {
    method: 'POST', headers: jsonHeaders(token), body: JSON.stringify(body),
  });
  expect(createdRes.status).toBe(200);
  const area = await createdRes.json();
  expect(area.id).toMatch(/^[0-9a-f-]{36}$/);

  const bad = await app.request('http://localhost:8787/saved-areas', {
    method: 'POST', headers: jsonHeaders(token),
    body: JSON.stringify({ name: 'x', polygon: [[0, 0], [1, 1]], alert_emails: false }),
  });
  expect(bad.status).toBe(400);

  const listRes = await app.request('http://localhost:8787/saved-areas', { headers: jsonHeaders(token) });
  expect(listRes.status).toBe(200);
  const list = await listRes.json();
  expect(list.some((a: { id: string }) => a.id === area.id)).toBe(true);

  const patchRes = await app.request(`http://localhost:8787/saved-areas/${area.id}`, {
    method: 'PATCH', headers: jsonHeaders(token), body: JSON.stringify({ alert_emails: false }),
  });
  expect(patchRes.status).toBe(200);
  expect((await patchRes.json()).alert_emails).toBe(false);

  // incident inside the polygon -> alert + email log line
  const before = await (await app.request('http://localhost:8787/alerts', { headers: jsonHeaders(token) })).json();
  const inside = await postIncident(token, incidentPayload({ location: { lon: -0.15, lat: 51.55 }, description: 'inside saved area' }));
  expect(inside.status).toBe(200);
  const insideBody = await inside.json();
  const after = await (await app.request('http://localhost:8787/alerts', { headers: jsonHeaders(token) })).json();
  expect(after.length).toBe(before.length + 1);
  expect(after[0].incident_id).toBe(insideBody.id);
  expect(after[0].area_name).toBe('central london');

  // incident outside -> no new alert
  const outside = await postIncident(token, incidentPayload({ location: { lon: -2.5, lat: 53.4 } }));
  expect(outside.status).toBe(200);
  const after2 = await (await app.request('http://localhost:8787/alerts', { headers: jsonHeaders(token) })).json();
  expect(after2.length).toBe(after.length);

  const delRes = await app.request(`http://localhost:8787/saved-areas/${area.id}`, {
    method: 'DELETE', headers: jsonHeaders(token),
  });
  expect(delRes.status).toBe(200);
  const afterDelete = await (await app.request('http://localhost:8787/alerts', { headers: jsonHeaders(token) })).json();
  expect(afterDelete.some((a: { saved_area_id: string }) => a.saved_area_id === area.id)).toBe(false);
});
```

(alert_emails was patched to false here, so no email assert needed; the email path is covered in Step 4 with a second area.)

- [ ] **Step 4: Alert email log test**

```ts
it('writes an area-alert line to the dev mail log when alert_emails is on', async () => {
  const { token } = await makeUser('mailer');
  const areaRes = await app.request('http://localhost:8787/saved-areas', {
    method: 'POST', headers: jsonHeaders(token),
    body: JSON.stringify({ name: 'email zone', polygon: [[-0.2, 51.5], [-0.1, 51.5], [-0.1, 51.6], [-0.2, 51.6]], alert_emails: true }),
  });
  const area = await areaRes.json();
  const before = fs.readFileSync(new URL('../../.dev-mail.log', import.meta.url), 'utf8');
  await postIncident(token, incidentPayload({ location: { lon: -0.15, lat: 51.55 } }));
  const after = fs.readFileSync(new URL('../../.dev-mail.log', import.meta.url), 'utf8');
  expect(after).toContain('area-alert');
  expect(after.length).toBeGreaterThan(before.length);
});
```

Add `import { readFileSync } from 'node:fs';` at the top of the test file (check it isn't already imported). The dev mail log is appended only when `RESEND_API_KEY` is unset — ensure the test env has no `RESEND_API_KEY`.

- [ ] **Step 5: Stats tests**

```ts
it('returns public stats and personal stats', async () => {
  const { token } = await makeUser('statsuser');
  const created = await (await postIncident(token, incidentPayload({ description: 'stats seed' }))).json();
  const statsRes = await app.request('http://localhost:8787/stats');
  expect(statsRes.status).toBe(200);
  const stats = await statsRes.json();
  expect(stats.total_incidents).toBeGreaterThanOrEqual(1);
  expect(stats.series_30d).toHaveLength(30);
  expect(stats.by_type.some((r: { type: string }) => r.type === 'arrest')).toBe(true);
  expect(stats.by_force.some((r: { force: string }) => r.force === 'metropolitan')).toBe(true);

  const meRes = await app.request('http://localhost:8787/stats/me', { headers: jsonHeaders(token) });
  expect(meRes.status).toBe(200);
  const me = await meRes.json();
  expect(me.submissions).toBeGreaterThanOrEqual(1);
  expect(me.recent_submissions.some((i: { id: string }) => i.id === created.id)).toBe(true);
});
```

- [ ] **Step 6: Account deletion test**

```ts
it('deletes the account but keeps incidents anonymized as public record', async () => {
  const { token, user } = await makeUser('deleter');
  const created = await (await postIncident(token, incidentPayload({ description: 'deletion keeps this' }))).json();
  const areaRes = await app.request('http://localhost:8787/saved-areas', {
    method: 'POST', headers: jsonHeaders(token),
    body: JSON.stringify({ name: 'doomed', polygon: [[-0.2, 51.5], [-0.1, 51.5], [-0.1, 51.6], [-0.2, 51.6]], alert_emails: false }),
  });
  const area = await areaRes.json();

  const del = await app.request('http://localhost:8787/auth/me', { method: 'DELETE', headers: jsonHeaders(token) });
  expect(del.status).toBe(200);

  const me = await app.request('http://localhost:8787/auth/me', { headers: jsonHeaders(token) });
  expect(me.status).toBe(401);

  const incidentRes = await app.request(`http://localhost:8787/incident/${created.id}`);
  expect(incidentRes.status).toBe(200);
  const incident = await incidentRes.json();
  expect(incident.username).toBeNull();

  const areasRes = await app.request('http://localhost:8787/saved-areas', { headers: jsonHeaders(token) });
  expect(areasRes.status).toBe(401);

  const ratingsRes = await app.request('http://localhost:8787/rating', {
    method: 'POST', headers: jsonHeaders(token),
    body: JSON.stringify({ incident_id: created.id, appropriateness: 2, professionalism: 2, safety: 2 }),
  });
  expect(ratingsRes.status).toBe(401);

  const dbCounts = await db`SELECT (SELECT count(*) FROM incidents WHERE id = ${created.id})::int AS incidents,
    (SELECT count(*) FROM media WHERE incident_id = ${created.id})::int AS media,
    (SELECT count(*) FROM saved_areas WHERE id = ${area.id})::int AS areas`;
  expect(dbCounts[0].incidents).toBe(1);
  expect(dbCounts[0].media).toBe(1);
  expect(dbCounts[0].areas).toBe(0);
});
```

Note: `afterAll` deletes `createdUsers` by id — deleting the user twice is a no-op DELETE, safe.

- [ ] **Step 7: Run the full backend suite**

Run: `$env:RUN_DB_TESTS=1; $env:DATABASE_URL="postgres://postgres:postgres@localhost:5432/witnessgrid"; pnpm --filter @witnessgrid/backend run test`
Expected: all files pass, including the 6 new tests; exit 0.

- [ ] **Step 8: Commit**

```bash
git add backend/tests
git commit -m "test(backend): Phase 2 integration — ratings, search, saved areas, alerts, stats, account deletion"
```

### Task 6: Web API client

**Files:**
- Modify: `web/src/lib/api.ts`

**Interfaces:**
- Produces (all used by later web tasks):
  - `rateIncident(incidentId: string, scores: {appropriateness; professionalism; safety}, opts): Promise<{ok: boolean}>`
  - `getIncidentWithRating(id, opts)` — reuse `getIncident` (already returns the extra `rating_summary` field; the response is parsed with `IncidentSchema` which ignores unknown keys — fine)
  - `listSavedAreas(opts): Promise<SavedArea[]>`, `createSavedArea(input, opts): Promise<SavedArea>`, `updateSavedArea(id, patch, opts): Promise<SavedArea>`, `deleteSavedArea(id, opts): Promise<{ok: boolean}>`
  - `listAlerts(opts): Promise<Alert[]>`
  - `fetchStatsPublic(opts): Promise<StatsPublic>`, `fetchStatsMe(opts): Promise<StatsMe>`
  - `deleteAccount(opts): Promise<{ok: boolean}>`

- [ ] **Step 1: Add the client functions**

```ts
export async function rateIncident(
  incidentId: string,
  scores: { appropriateness: number; professionalism: number; safety: number },
  opts: ApiOptions = {},
): Promise<{ ok: boolean }> {
  return apiPost<{ ok: boolean }>("/rating", { incident_id: incidentId, ...scores }, opts);
}

export async function listSavedAreas(opts: ApiOptions = {}): Promise<SavedArea[]> {
  return apiGet<SavedArea[]>("/saved-areas", opts);
}
export async function createSavedArea(input: SavedAreaCreate, opts: ApiOptions = {}): Promise<SavedArea> {
  return apiPost<SavedArea>("/saved-areas", input, opts);
}
export async function updateSavedArea(id: string, patch: SavedAreaUpdate, opts: ApiOptions = {}): Promise<SavedArea> {
  const data = await apiGet<unknown>(`/saved-areas/${encodeURIComponent(id)}`, { ...opts, method: "PATCH" as never } as never);
  return data as SavedArea;
}
export async function deleteSavedArea(id: string, opts: ApiOptions = {}): Promise<{ ok: boolean }> {
  return apiDelete<{ ok: boolean }>(`/saved-areas/${encodeURIComponent(id)}`, opts);
}
export async function listAlerts(opts: ApiOptions = {}): Promise<Alert[]> {
  return apiGet<Alert[]>("/alerts", opts);
}
export async function fetchStatsPublic(opts: ApiOptions = {}): Promise<StatsPublic> {
  return apiGet<StatsPublic>("/stats", opts);
}
export async function fetchStatsMe(opts: ApiOptions = {}): Promise<StatsMe> {
  return apiGet<StatsMe>("/stats/me", opts);
}
export async function deleteAccount(opts: ApiOptions = {}): Promise<{ ok: boolean }> {
  return apiDelete<{ ok: boolean }>("/auth/me", opts);
}
```

Note: `updateSavedArea` needs a PATCH verb — the existing `apiGet`/`apiPost` don't expose it. Add `apiPatch`:

```ts
export function apiPatch<T>(path: string, body: unknown, opts: ApiOptions = {}): Promise<T> {
  return requestJson<T>(
    path,
    { method: "PATCH", body: JSON.stringify(body), headers: { "Content-Type": "application/json" }, cache: "no-store" },
    opts,
  );
}
```

and rewrite `updateSavedArea` to `apiPatch<SavedArea>(...)`. Also add `"PATCH"` to the CORS `allowMethods` in `backend/src/app.ts` (it currently allows GET/POST/PUT/DELETE/OPTIONS).

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @witnessgrid/web typecheck` — exit 0.

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/api.ts backend/src/app.ts
git commit -m "feat(web): Phase 2 API client — rating, saved areas, alerts, stats, account deletion, PATCH support"
```

### Task 7: Web — feed search + filters

**Files:**
- Modify: `web/src/app/(public)/page.tsx`
- Modify: `web/src/components/load-more.tsx`
- Create: `web/src/components/feed-filters.tsx`
- Test: `web/tests/feed-filters.test.ts` (unit)

**Interfaces:**
- Consumes: `listIncidents` (Task 6, unchanged), `buildQuery`.
- Produces: `<FeedFilters initial={FeedFilterState} />` — a client component that reads/writes URL search params (`q`, `type`, `policeForce`, `startDate`, `endDate`) and refetches the React Query feed with the new params; `LoadMore` accepts `filterParams` and passes them into `queryFn`.

- [ ] **Step 1: Define the filter state + parser (unit-tested)**

In `web/src/lib/feed-filters.ts`:

```ts
export interface FeedFilterState {
  q: string;
  type: string;
  policeForce: string;
  startDate: string;
  endDate: string;
}

export function emptyFilters(): FeedFilterState {
  return { q: "", type: "", policeForce: "", startDate: "", endDate: "" };
}

export function parseFeedFilters(searchParams: URLSearchParams): FeedFilterState {
  return {
    q: searchParams.get("q") ?? "",
    type: searchParams.get("type") ?? "",
    policeForce: searchParams.get("policeForce") ?? "",
    startDate: searchParams.get("startDate") ?? "",
    endDate: searchParams.get("endDate") ?? "",
  };
}

export function filtersToQuery(f: FeedFilterState): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.q.trim().length >= 2) out.q = f.q.trim();
  if (f.type) out.type = f.type;
  if (f.policeForce) out.policeForce = f.policeForce;
  if (f.startDate) out.startDate = f.startDate;
  if (f.endDate) out.endDate = f.endDate;
  return out;
}
```

Unit test `web/tests/feed-filters.test.ts`: parse returns defaults for empty; `filtersToQuery` omits empty/short `q`; round-trips.

- [ ] **Step 2: Create `web/src/components/feed-filters.tsx`**

Client component: form with a search `<input name="q" data-testid="feed-search">`, `<select>` for type (from `INCIDENT_TYPES` + label mapping via `typeLabel`), `<select>` for force (`POLICE_FORCES` + `formatForce`), two `<input type="date">`. On submit/change: `router.replace` with merged params, and the query invalidation happens through the URL change (see Step 3). Props: `initial: FeedFilterState`.

- [ ] **Step 3: Wire SSR + client refetch**

`page.tsx` (server component): `const sp = await searchParams;` (`Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }`), parse into `FeedFilterState`, pass `filtersToQuery` into the SSR `listIncidents({ limit: 25, ...filtersToQuery(state) })` call.
`load-more.tsx`: accept `filterParams?: Record<string, string>`; `useInfiniteQuery` gains `queryKey: ["feed", filterParams]` and `queryFn` uses `listIncidents({ limit: 25, cursor: pageParam, ...filterParams })`. When filters change, React Query refetches from page 1 because the key changed (reset `initialData` handling: pass `initialData` only when `filterParams` matches the initial SSR params — track with a `useState` initial-value comparison or simpler: always seed `initialData` from SSR; on filter change the key changes and `initialData` is ignored by React Query v5 when key changes... it is NOT ignored automatically; instead conditionally pass `initialData` based on `useState` of first-render params. Implement: `const [initialFilters] = useState(filterParams)` and `const { data, ... } = useInfiniteQuery({ ..., initialData: JSON.stringify(initialFilters) === JSON.stringify(filterParams) ? { pages: [...], pageParams: [undefined] } : undefined })`).

Also show an empty state in `LoadMore` when `items.length === 0 && !isFetching` → "No records match — try fewer filters."

- [ ] **Step 4: Unit test + typecheck**

Run: `pnpm --filter @witnessgrid/web run test` (new feed-filters tests pass); `pnpm --filter @witnessgrid/web typecheck` exit 0.

- [ ] **Step 5: Commit**

```bash
git add web/src
git commit -m "feat(web): feed search + filters with URL state"
```

### Task 8: Web — rating panel + anonymous witness

**Files:**
- Modify: `web/src/app/(public)/incident/[id]/page.tsx`
- Create: `web/src/components/rating-panel.tsx`
- Test: manual smoke (e2e in Task 12)

**Interfaces:**
- Consumes: `getIncident` (returns `rating_summary` when count > 0), `rateIncident` from Task 6, `useAuthStore`.
- Produces: `<RatingPanel incidentId: string; isOwner: boolean; serverSummary: RatingSummary | null />` rendered server-side with the SSR summary; a client component that (a) refetches the incident with the session token on mount when signed in (to fill `my_rating`), (b) renders three 1–5 tap rows, (c) posts via `rateIncident` mutation + refetch.

- [ ] **Step 1: Create `web/src/components/rating-panel.tsx`**

```tsx
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getIncident, rateIncident } from "@/lib/api";
import type { RatingSummary } from "@/lib/contract";
import { useAuthStore } from "@/store/auth";

const AXES = [
  { key: "appropriateness", label: "Appropriateness" },
  { key: "professionalism", label: "Professionalism" },
  { key: "safety", label: "Safety" },
] as const;

export function RatingPanel({
  incidentId,
  isOwner,
  serverSummary,
}: {
  incidentId: string;
  isOwner: boolean;
  serverSummary: RatingSummary | null;
}) {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();

  const { data: incident } = useQuery({
    queryKey: ["incident", incidentId, token ?? null],
    queryFn: () => getIncident(incidentId, { token: token ?? undefined }),
    enabled: Boolean(token),
    initialData: undefined,
  });

  const summary: RatingSummary | null = incident?.rating_summary ?? serverSummary;

  const rate = useMutation({
    mutationFn: (scores: { appropriateness: number; professionalism: number; safety: number }) =>
      rateIncident(incidentId, scores, { token: token ?? undefined }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["incident", incidentId] }),
  });

  if (isOwner) return null;
  if (!summary) return null;

  return (
    <section aria-label="Ratings" className="mt-8 rounded-md border hairline bg-surface/60 p-5">
      <h2 className="label">Ratings</h2>
      <p className="mt-1 text-sm text-paper/60">
        {summary.count === 0
          ? "No ratings yet."
          : `Averaged from ${summary.count} rating${summary.count === 1 ? "" : "s"}.`}
      </p>
      {AXES.map(({ key, label }) => {
        const mine = summary.my_rating?.[key] ?? null;
        const avg = summary[`${key}_avg`];
        return (
          <div key={key} className="mt-3">
            <div className="flex items-baseline justify-between">
              <span className="timecode text-paper/70">{label}</span>
              <span className="timecode text-amber" data-testid={`rating-avg-${key}`}>
                {avg === null ? "—" : `${avg} / 5`}
              </span>
            </div>
            <div className="mt-1 flex gap-1" role="radiogroup" aria-label={label}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={mine === n}
                  aria-label={`${label}: ${n} of 5${mine === n ? " (your rating)" : ""}`}
                  disabled={!token || rate.isPending}
                  onClick={() => rate.mutate({ ...summary.my_rating ?? { appropriateness: 0, professionalism: 0, safety: 0 }, [key]: n })}
                  className={`h-11 w-11 rounded-md border hairline font-mono text-sm ${
                    mine !== null && n <= mine ? "border-amber bg-amber/15 text-amber" : "text-paper/40"
                  } ${!token ? "cursor-not-allowed opacity-50" : ""}`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        );
      })}
      {!token ? <p className="mt-4 text-xs text-paper/50">Sign in to rate this record.</p> : null}
      {rate.isError ? <p className="mt-2 text-xs text-flag">Could not save your rating.</p> : null}
    </section>
  );
}
```

Note: `getIncident` returns `Incident` — extend the API type: `export type IncidentDetail = Incident & { rating_summary?: RatingSummary };` in `web/src/lib/api.ts` and have `getIncident` cast to `IncidentDetail`. (The parse stays `IncidentSchema` — extra keys pass through the cast.)

- [ ] **Step 2: Wire into the detail page + anonymous witness**

In `web/src/app/(public)/incident/[id]/page.tsx`:
- The server fetch keeps returning `Incident`; pass `incident.user_id` — but `getIncident` needs the current user id for `isOwner`. The SSR page doesn't know the session; instead render `<RatingPanel incidentId={incident.id} isOwner={false} serverSummary={incident.rating_summary ?? null} />` — but `isOwner` requires the client session. Move ownership into the panel: add `ownerUserId: string` prop; inside the panel, `const user = useAuthStore((s) => s.user); const isOwner = user?.id === ownerUserId;` and return null when owner. So `<RatingPanel incidentId={incident.id} ownerUserId={incident.user_id} serverSummary={...} />`.
- Replace the "Reported by" line to handle null username:
  `Reported by <span className="timecode text-amber">{incident.username ? `@${incident.username}` : "anonymous witness"}</span> · ...`
- Render the panel after the narrative section, before "Record facts".

- [ ] **Step 3: Boot + manual check**

Restart web dev if needed; visit `/incident/<seed-id>` signed out: ratings block shows averages (seed has none → hidden), "Sign in to rate" only when a summary exists — verify by rating via API first (`POST /rating` with a dev user token) then reloading the page shows averages.

- [ ] **Step 4: Typecheck + commit**

Run: `pnpm --filter @witnessgrid/web typecheck` — exit 0.

```bash
git add web/src
git commit -m "feat(web): rating tap panel + anonymous witness rendering"
```

### Task 9: Web — stats pages

**Files:**
- Create: `web/src/app/(public)/stats/page.tsx`
- Create: `web/src/components/charts.tsx`
- Modify: `web/src/app/(public)/profile/page.tsx` (add `/stats/me` section)
- Test: `web/tests/charts.test.ts` (unit)

**Interfaces:**
- Consumes: `fetchStatsPublic`, `fetchStatsMe` (Task 6).
- Produces: `BarChart({ data: Array<{ label: string; value: number }>; height?: number })`, `LineChart({ data: Array<{ label: string; value: number }>; height?: number })` — pure SVG components in `charts.tsx` (no deps), each rendering an `<svg role="img" aria-label>` + a visually-hidden `<table>` fallback of the same data.

- [ ] **Step 1: Create `web/src/components/charts.tsx`**

Pure functions mapping data → SVG bars/points. Scale: value / max, bar width = container / n, amber fill (`#E8A33D`), axis baseline `--line`. Export helpers `buildBarPoints(data, width, height)` and `buildLinePoints(data, width, height)` returning point arrays, unit-tested:

```ts
export function buildBarPoints(
  data: Array<{ label: string; value: number }>,
  width: number,
  height: number,
): Array<{ x: number; y: number; h: number }> {
  const max = Math.max(1, ...data.map((d) => d.value));
  const slot = width / Math.max(1, data.length);
  return data.map((d, i) => ({
    x: i * slot + slot * 0.15,
    y: height - (d.value / max) * (height - 8) - 4,
    h: Math.max(2, (d.value / max) * (height - 8)),
  }));
}
```

(`buildLinePoints` similar: x = i*slot+slot/2, y = height - (value/max)*(height-8)-4.)

- [ ] **Step 2: Create `web/src/app/(public)/stats/page.tsx`**

```tsx
import type { Metadata } from "next";
import { fetchStatsPublic, serverApiBaseUrl } from "@/lib/api";
import { formatForce, typeLabel } from "@/lib/contract";
import { BarChart, LineChart } from "@/components/charts";
import { StatusBanner } from "@/components/status-banner";
import { Tartan } from "@/components/tartan";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Stats",
  description: "Aggregate statistics for the WitnessGrid public register.",
};

export default async function StatsPage() {
  let stats: Awaited<ReturnType<typeof fetchStatsPublic>> | null = null;
  let error: string | null = null;
  try {
    stats = await fetchStatsPublic({ baseUrl: serverApiBaseUrl() });
  } catch (err) {
    error = err instanceof Error ? err.message : "The API could not be reached.";
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Stats.</h1>
        <p className="mt-2 max-w-2xl text-paper/70">
          What our witnesses have recorded, in aggregate.
        </p>
      </header>
      <Tartan thin />
      {error ? <div className="py-8"><StatusBanner kind="error" message="Stats unavailable." detail={error} /></div> : null}
      {stats ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section className="rounded-md border hairline bg-surface/60 p-5">
            <h2 className="label">Totals</h2>
            <p className="mt-2 font-display text-4xl font-extrabold text-amber">{stats.total_incidents}</p>
            <p className="timecode text-paper/60">{stats.total_views} views</p>
          </section>
          <section className="rounded-md border hairline bg-surface/60 p-5">
            <h2 className="label">Last 30 days</h2>
            <LineChart data={stats.series_30d.map((d) => ({ label: d.day, value: d.count }))} />
          </section>
          <section className="rounded-md border hairline bg-surface/60 p-5">
            <h2 className="label">By incident type</h2>
            <BarChart data={stats.by_type.map((d) => ({ label: typeLabel(d.type), value: d.count }))} />
          </section>
          <section className="rounded-md border hairline bg-surface/60 p-5">
            <h2 className="label">By police force</h2>
            <BarChart data={stats.by_force.map((d) => ({ label: formatForce(d.force), value: d.count }))} />
          </section>
        </div>
      ) : null}
    </main>
  );
}
```

Note: `formatForce` currently takes `PoliceForce`; `'other'` is not a member — extend `formatForce` in `packages/contract/src/enums.ts` (or wherever it lives) to accept `string` and return the prettified name (current behavior for known forces; fallback `String(v)` for unknown). Check its current implementation and widen the parameter type.

- [ ] **Step 3: Add `/stats/me` section to the profile page**

Inside `ProfilePage` (client), below the incidents list: `<StatsMeSection token={token} />` — a small client component in `web/src/components/stats-me.tsx` using `fetchStatsMe` + `useQuery`, rendering submissions count, total views, ratings received (avg + count). Place inside a `<section aria-label="Your stats">` card.

- [ ] **Step 4: Unit tests + typecheck**

`web/tests/charts.test.ts`: `buildBarPoints` — empty array → `[]`; single max value touches top; proportional heights; `buildLinePoints` similar.
Run: `pnpm --filter @witnessgrid/web run test`; `pnpm --filter @witnessgrid/web typecheck` — both green.

- [ ] **Step 5: Commit**

```bash
git add web/src packages/contract/src
git commit -m "feat(web): public + personal stats pages with SVG palette charts"
```

### Task 10: Web — saved areas (map draw) + alerts

**Files:**
- Modify: `web/src/components/map/map-view.tsx`
- Create: `web/src/components/saved-area-dialog.tsx`
- Modify: `web/src/app/(public)/profile/page.tsx`
- Create: `web/src/components/saved-areas-manager.tsx`
- Create: `web/src/components/alerts-list.tsx`
- Test: `web/tests/polygon.test.ts` (unit)

**Interfaces:**
- Consumes: `listSavedAreas/createSavedArea/updateSavedArea/deleteSavedArea/listAlerts` (Task 6).
- Produces: draw-mode state in `MapView` (`useState<'idle'|'drawing'>` + `polygon: [number,number][]`); `<SavedAreaDialog polygon onClose onSaved />`; `<SavedAreasManager token />`; `<AlertsList token />`.

- [ ] **Step 1: Polygon helper (unit-tested) — `web/src/lib/polygon.ts`**

```ts
export type LngLat = [number, number];

export function addVertex(polygon: LngLat[], p: LngLat, max = 32): LngLat[] {
  if (polygon.length >= max) return polygon;
  return [...polygon, p];
}
export function removeLastVertex(polygon: LngLat[]): LngLat[] {
  return polygon.slice(0, -1);
}
export function isClosed(polygon: LngLat[]): boolean {
  if (polygon.length < 3) return false;
  const [a, b] = [polygon[0]!, polygon[polygon.length - 1]!];
  return a[0] === b[0] && a[1] === b[1];
}
export function closeRing(polygon: LngLat[]): LngLat[] {
  if (isClosed(polygon) || polygon.length < 3) return polygon;
  return [...polygon, polygon[0]!];
}
export function ringAreaSqKm(polygon: LngLat[]): number {
  // shoelace in lon/lat degrees, rough km² conversion at 52°N
  let sum = 0;
  for (let i = 0; i < polygon.length; i++) {
    const [x1, y1] = polygon[i]!;
    const [x2, y2] = polygon[(i + 1) % polygon.length]!;
    sum += x1 * y2 - x2 * y1;
  }
  const degSq = Math.abs(sum) / 2;
  return degSq * (111.32 * 69.3); // deg² → km² approx at mid-latitudes
}
```

Unit test: add/remove/close behavior; `ringAreaSqKm` for a ~1° box is ~11,120 km² (assert > 10000); for a 0.1° box ~111 km².

- [ ] **Step 2: Draw mode in `MapView`**

Add toolbar state: a "Save this area" button in the floating filter panel toggles `drawing` mode. While drawing: `map.on('click')` adds a vertex (projected marker element per vertex — reuse the existing pin-marker approach: `new maplibregl.Marker({element: dotEl}).setLngLat(...).addTo(map)`, store in a `markerRefs` array cleaned on exit), "Finish" button closes the ring (auto-append first point) and opens `<SavedAreaDialog>`, "Cancel" discards. A `polygonSource` GeoJSON source + fill layer (`#E8A33D`, 25% opacity) renders the current ring live.

- [ ] **Step 3: Create `web/src/components/saved-area-dialog.tsx`**

Modal (reuse existing modal styling conventions if any exist in the codebase — check `web/src/components` for an existing modal; otherwise a fixed overlay div): name input (max 40), email-alert checkbox, validation errors (area > 10,000 km² warning from `ringAreaSqKm`; server 409/400 surfaced), submit → `createSavedArea({ name, polygon: closeRing(polygon), alert_emails })` with `token` from the store; on success `onSaved()` closes + clears drawing state.

- [ ] **Step 4: Create `web/src/components/saved-areas-manager.tsx` + `web/src/components/alerts-list.tsx`**

Both client components querying on mount (`useQuery` with `token`):
- `SavedAreasManager`: list rows (name, polygon summary "N points", email toggle via `updateSavedArea`, rename inline input, delete button with confirm), "Saved areas" heading.
- `AlertsList`: newest-first list, each row links to `/incident/<id>`: timecode timestamp, area name, incident type/force snippet.

- [ ] **Step 5: Wire into the profile page**

Add `<SavedAreasManager token={token} />` and `<AlertsList token={token} />` sections between the incidents list and the sign-out header (or below the register list) inside the authed branch.

- [ ] **Step 6: Typecheck + unit tests**

Run: `pnpm --filter @witnessgrid/web run test`; `pnpm --filter @witnessgrid/web typecheck` — green.

- [ ] **Step 7: Commit**

```bash
git add web/src
git commit -m "feat(web): map polygon draw, saved-area management, alerts list"
```

### Task 11: Web — account deletion + terms/waiver

**Files:**
- Create: `web/src/components/delete-account.tsx`
- Modify: `web/src/app/(public)/profile/page.tsx`
- Modify: `web/src/app/(public)/terms/page.tsx`
- Modify: `web/src/components/report-wizard.tsx` (waiver notice line)

**Interfaces:**
- Consumes: `deleteAccount` (Task 6), `useAuthStore.clear`.
- Produces: `<DeleteAccount />` client component.

- [ ] **Step 1: Create `web/src/components/delete-account.tsx`**

Button ("Delete account") → confirm modal with:
- Warning text: "Your account and personal data will be permanently erased. Your submitted incidents and footage remain in the public register with attribution removed, because uploading waives their deletion (see Terms)."
- A text input requiring the exact phrase `delete my account` (disabled until matched; `aria-label="type delete my account to confirm"`).
- Submit → `deleteAccount({ token })` → `clear()` (auth store) → `router.push("/")`.
- Error surface (`ApiClientError.message`).

- [ ] **Step 2: Terms page waiver clause**

In `web/src/app/(public)/terms/page.tsx`, add a section (after the existing content — read the file first and match its structure) titled "Public-record retention" stating:

> By submitting media to WitnessGrid you grant a perpetual, irrevocable right to retain and display it as part of the public register. Uploading waives deletion of that public-record footage. While your account exists you may withdraw an incident (which removes it and its media); account deletion erases your account and personal data but your submitted incidents remain, anonymized.

- [ ] **Step 3: Report wizard notice**

In `web/src/components/report-wizard.tsx`, find the confirmation checkbox block and add one line above it: `Submitting waives deletion of this footage once published (see Terms).` styled as `text-xs text-paper/50`.

- [ ] **Step 4: Typecheck + commit**

Run: `pnpm --filter @witnessgrid/web typecheck` — exit 0.

```bash
git add web/src
git commit -m "feat(web): account deletion flow + upload waiver in terms and report flow"
```

### Task 12: Web e2e additions

**Files:**
- Create: `web/e2e/phase2.spec.ts`
- Modify: `web/e2e/helpers.ts` if needed (reuse `DEV_MAIL_LOG`, sign-in helper patterns)

**Interfaces:**
- Consumes: running backend + web (booted per existing e2e flow); `RUN_E2E=1`.

- [ ] **Step 1: Write `web/e2e/phase2.spec.ts`**

Three tests (read `web/e2e/auth.spec.ts` and `web/e2e/report.spec.ts` first for the exact sign-in/magic-link helpers and dev-mail token regex to reuse):

1. **search finds a seeded incident**: goto `/`, expect `[data-testid="feed-search"]`; fill `search`; expect a register row containing the searched term (use a term that exists in seed data — check `infra/db/seed.sql` for a distinctive description word, e.g. the seeded incident descriptions; if none distinctive, assert the empty-state text instead after an absurd query, plus one positive match via a seed word).

2. **a signed-in user can rate and replace a rating**: sign in (magic-link helper), open a seed incident detail, tap `5` on the Appropriateness row (`[role="radio"]` with aria-label containing "Appropriateness: 5"), expect `[data-testid="rating-avg-appropriateness"]` to contain `/ 5`, tap `1`, expect the avg to update to `1 / 5`.

3. **account deletion keeps the register readable**: sign in with a fresh user, file a report via the wizard (reuse report.spec pattern), open profile, type `delete my account`, confirm, expect redirect to `/` and that the incident page for the created id still loads with "anonymous witness" — capture the incident id from the wizard success state (check how report.spec obtains the created id; alternatively assert the register list still contains the record without a username).

- [ ] **Step 2: Run the e2e suite**

Run: `$env:RUN_E2E=1; pnpm --filter @witnessgrid/web e2e`
Expected: 7 tests pass (4 existing + 3 new). Fix any flakiness (waitFor selectors, unique usernames per run — reuse the `Date.now().toString(36)` pattern).

- [ ] **Step 3: Commit**

```bash
git add web/e2e
git commit -m "test(e2e): Phase 2 — search, ratings, account deletion"
```

### Task 13: Full verification + manual smoke + phase commit

**Files:**
- Evidence only; no code unless a defect appears.

- [ ] **Step 1: Full repo verification**

Run (each to green):
- `pnpm -r typecheck`
- `pnpm --filter @witnessgrid/contract run test`
- `pnpm --filter @witnessgrid/web run test`
- `$env:RUN_DB_TESTS=1; $env:DATABASE_URL="postgres://postgres:postgres@localhost:5432/witnessgrid"; pnpm --filter @witnessgrid/backend run test`
- `$env:RUN_E2E=1; pnpm --filter @witnessgrid/web e2e`

- [ ] **Step 2: Manual smoke (§14-style)**

With backend on :8787 and web on :3000:
- Feed: search `high street`-style seed term → filtered rows; URL reflects `?q=`.
- Incident detail: rate as a second user via `POST /rating` (curl with a dev token) → page shows averages; sign in as that user → tap rating replaces value.
- Map: draw polygon → save "smoke area" with email on; file an incident inside (wizard pin inside polygon) → profile Alerts shows it; `backend/.dev-mail.log` contains an `area-alert` line.
- Stats: `/stats` shows totals + charts; profile shows `/stats/me` numbers.
- Delete account: sign in as the smoke user → confirm → redirect; `/incident/<their-id>` shows "anonymous witness"; profile/API calls 401.
- Phase 1 regression: capture→submit→feed/map render, offline queue flush, delete incident, sign out — all still work.

- [ ] **Step 3: Commit + tag the phase**

```bash
git add -A
git commit -m "feat: WitnessGrid Phase 2 — ratings, search, stats, saved-area alerts, account deletion

Phase 2 exit: repo typecheck + contract/web/backend(e2e, DB) suites green; §14
Phase 1 criteria re-verified in Task 0; manual smoke in Task 13 green.

Follow-ups (out of scope): Phase 3 moderation/admin/audit/comments/clustering;
Phase 4 Flutter apps, Stripe Supporter, notifications, dataset export."
```

### Self-review notes (from writing-plans checklist)

- Spec coverage: every §5-§7 item of the Phase 2 spec maps to a task (search→T3/T7, ratings→T3/T4/T8, saved areas+alerts→T3/T4/T10, stats→T3/T4/T9, account deletion→T3/T4/T11, waiver→T11, migration→T2, contract→T1, tests→T5/T12, §14 re-verify→T0).
- Type consistency: `SavedAreaCreate`/`SavedAreaUpdate`/`RatingSummary`/`StatsPublic`/`StatsMe`/`Alert` names used identically across T1, T3, T4, T6. `deleteUserAccount` (repo) ↔ `DELETE /auth/me` (route) ↔ `deleteAccount` (web client). `mutateRateLimit` import path matches `backend/src/routes/incidents.ts`. `incidentPayload`/`makeUser`/`jsonHeaders` helper names match the existing integration file.
- The plan keeps Phase 1 behavior intact: `createIncident` response shape unchanged; `IncidentSchema` parse on the web ignores the extra `rating_summary` key (zod object strips unknown keys by default).
