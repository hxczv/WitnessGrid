# WitnessGrid Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fully functional, installable PWA (Next.js), a Hono API service, and a Postgres/PostGIS schema (with auth, uploads, incident register, map, SSR pages, offline queue) that runs end-to-end locally and is deployable to the £0 cloud stack (Cloudflare Workers + R2 + hosted Postgres). No mocks, no stubs — every layer is real.

**Architecture:** pnpm monorepo. `packages/contract` is the single source of truth (zod schemas + enums + API types), shared by the `backend` (Hono, runs under Node locally and on Cloudflare Workers in prod) and `web` (Next.js App Router + Serwist PWA). Data layer: real PostgreSQL + PostGIS; migrations are pure SQL, shared between local and hosted Postgres. The backend uses a DB adapter (Node/dev: `postgres` porsager over TCP; Workers/prod: `@neondatabase/serverless`), an object store adapter (dev: local filesystem media folder served over HTTP; prod: R2 via AWS S3 API), and an email adapter (dev: console/log mail; prod: Resend API when `RESEND_API_KEY` set). Auth is first-party in the backend: email magic-link tokens + JWTs signed with `JWT_SECRET`.

**Tech Stack:** pnpm, TypeScript strict, zod, Hono, `@hono/node-server`, `postgres` (porsager), `@neondatabase/serverless`, `@aws-sdk/client-s3`, vitest, Next.js 15, Tailwind v4, Serwist, MapLibre GL JS + PMTiles, React Query, Zustand, Playwright.

## Global Constraints

- TypeScript strict in every workspace. No `any` leaks.
- All times stored/transmitted in UTC (ISO-8601). Timecode strip shows UTC; page renders viewer-local.
- All enums/props come from `packages/contract` — never redefine enums in `web` or `backend`.
- Every mutating endpoint requires a valid JWT (auth). Guests are read-only. Public read shows only `moderation_status='approved'` incidents.
- No media size/duration caps (spec §Media sizes). Client compression reduces size, not length.
- No editing incidents after submit. Delete (`DELETE /incident/:id`) is owner-only, hard delete including media objects.
- Incidents are auto-approved on creation in Phase 1 (`moderation_status='approved'`).
- Palette: `--ink #12151C`, `--surface #1A1E27`, `--paper #E8E6DE`, `--amber #E8A33D`, `--verified #4F8C7D`, `--flag #C24A3D`, `--line #2A2F3A`. Type: Archivo (display), Atkinson Hyperlegible (body), IBM Plex Mono (all machine facts). English-only UI (Phase 1).
- Idempotent submissions via client-generated `client_id` (uuid) — retried queue flushes never double-post.
- PWA: installable; `navigator.storage.persist()` requested; IndexedDB offline queue flushed on foreground/online (NO Background Sync dependency).
- Everything real: no mocks, no stubs, no placeholder UIs. Policy pages, safety note, confirmation checkbox, signed upload URLs, real hashes (SHA-256, WebCrypto).

---

## File Structure

```
package.json, pnpm-workspace.yaml, tsconfig.base.json, .gitignore
.github/workflows/ci.yml
README.md, LICENSE (MIT), CONTRIBUTING.md, CODE_OF_CONDUCT.md

packages/contract/
  package.json, tsconfig.json
  src/index.ts              (barrel)
  src/enums.ts              (IncidentType, PoliceForce, ModerationStatus, ReportReason)
  src/incidents.ts          (IncidentCreate, Incident, ListIncidents query+result)
  src/media.ts              (MediaReference, UploadRequest, UploadResponse)
  src/auth.ts               (MagicLinkRequest, VerifyTokenRequest, Session, SessionUser)
  src/report.ts             (ReportFlagCreate)
  src/errors.ts             (ApiError shape + error codes)
  tests/schemas.test.ts

infra/
  db/migrations/0001_init.sql       (enums, tables, indexes, RLS)
  db/seed.sql                       (dev seed incidents + users)
  db/migrate.ts                     (runner: applies migrations in order against DATABASE_URL)
  db/seed.ts                        (runner: applies seed.sql)
  scripts/ (postgres install + start checks)  — only docs/notes, no installs
  env/backend.env.example, env/web.env.example

backend/
  package.json, tsconfig.json, vitest.config.ts
  src/index.ts              (Hono app entry — dev runs @hono/node-server; Workers uses default export)
  src/app.ts                (route wiring, CORS, error handling)
  src/config.ts             (env parsing)
  src/db.ts                 (adapter selection: postgres / @neondatabase/serverless)
  src/db/local.ts           (porsager adapter, workspace over TCP)
  src/db/neon.ts            (neon serverless adapter for Workers)
  src/auth/{tokens,magic-link,jwt}.ts   (token gen+hash, magic-link flow, JWT sign/verify)
  src/email.ts              (adapter: Resend API | dev console/log)
  src/media/store.ts        (ObjectStore interface + local fs impl + S3/R2 impl)
  src/media/upload.ts       (POST /upload, signed PUT URL, object keys, allowlist)
  src/media/serve.ts        (public media route)
  src/routes/incidents.ts   (POST /incident, DELETE /incident/:id, POST /report)
  src/routes/list.ts        (GET /incidents, GET /incident/:id)
  src/routes/auth.ts        (auth endpoints)
  src/middleware/{auth,rate-limit}.ts
  src/rate-limit.ts         (Postgres-backed token bucket; interface for Upstash later)
  src/errors.ts             (ApiError + handler)
  src/repo.ts               (typed SQL queries — incidents, list w/ bbox+filters+cursor, media, flags, user)
  tests/*.test.ts           (unit + integration vs local Postgres)
  wrangler.toml             (prod Workers config: route, R2 binding, vars)

web/
  package.json, tsconfig.json, next.config.ts, postcss.config.mjs
  serwist.config.ts, public/manifest.webmanifest, public/icon-*.png
  tailwind (CSS-first via @theme tokens)
  src/app/layout.tsx, globals.css, (style tokens + fonts)
  src/app/(public)/page.tsx              (home: register feed, SSR)
  src/app/(public)/map/page.tsx          (full-bleed map + floating panel)
  src/app/(public)/incident/[id]/page.tsx (SSR detail + OG)
  src/app/(public)/signin/page.tsx       (magic-link sign in / up)
  src/app/(public)/about/page.tsx, /terms, /content-policy, /privacy
  src/app/(app)/report/page.tsx          (capture flow, login-gated)
  src/app/(app)/profile/page.tsx         (my submissions, sign out)
  src/app/assets/og/[id]/route.tsx       (next/og ImageResponse)
  src/app/sitemap.ts, src/app/robots.ts
  src/components/, src/lib/, src/store/, src/sw/ (worker, offline queue)
  tests/ (vitest unit + Playwright e2e)
```

---

## Shared Contract (`packages/contract`) — FULL SOURCE (write verbatim in every dependent)

Enums:

```ts
export const INCIDENT_TYPES = ['stop_and_search','vehicle_stop','arrest','use_of_force','stop_and_question','traffic_collision','missing_person','other'] as const;
export type IncidentType = typeof INCIDENT_TYPES[number];

export const POLICE_FORCES = [
  'avon-and-somerset','bedfordshire','cambridgeshire','cheshire','city-of-london','cleveland','cumbria',
  'derbyshire','devon-and-cornwall','dorset','durham','dyfed-powys','essex','gloucestershire','greater-manchester',
  'gwent','hampshire','hertfordshire','humberside','kent','lancashire','leicestershire','lincolnshire','merseyside',
  'metropolitan','norfolk','north-wales','north-yorkshire','northamptonshire','northumbria','nottinghamshire',
  'south-wales','south-yorkshire','staffordshire','suffolk','surrey','sussex','thames-valley','warwickshire',
  'west-mercia','west-midlands','west-yorkshire','wiltshire','police-scotland','psni','british-transport-police',
  'ministry-of-defence','civil-nuclear','other'] as const;
export type PoliceForce = typeof POLICE_FORCES[number];

export const MODERATION_STATUSES = ['pending','approved','removed'] as const;
export type ModerationStatus = typeof MODERATION_STATUSES[number];

export const REPORT_REASONS = ['illegal_content','harassment','misinformation','privacy','other'] as const;
export type ReportReason = typeof REPORT_REASONS[number];
```

Schemas (zod):

```ts
import { z } from 'zod';

export const MediaTypeSchema = z.enum(['image/jpeg','image/png','image/webp','video/webm','video/mp4']);

export const MediaReferenceSchema = z.object({
  key: z.string().min(1),            // R2/object key, e.g. media/[incidentId]/[sha256].[ext]
  type: MediaTypeSchema,
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  thumbnail_key: z.string().min(1).nullable(),
});
export type MediaReference = z.infer<typeof MediaReferenceSchema>;

export const LocationSchema = z.object({
  lon: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
});

export const IncidentCreateSchema = z.object({
  incident_type: z.enum(INCIDENT_TYPES),
  police_force: z.enum(POLICE_FORCES),
  timestamp: z.string().datetime(),              // ISO-8601 UTC
  location: LocationSchema,
  location_accuracy_m: z.number().nonnegative().nullable().optional(),
  description: z.string().max(2000).optional().default(''),
  officer_count: z.number().int().min(0).max(100).nullable().optional(),
  collar_numbers: z.array(z.string().min(1).max(12)).max(5).optional(),
  media: z.array(MediaReferenceSchema).min(1).max(20),
  client_id: z.string().uuid(),
});
export type IncidentCreate = z.infer<typeof IncidentCreateSchema>;

export const IncidentSchema = IncidentCreateSchema.extend({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  created_at: z.string().datetime(),
  view_count: z.number().int().nonnegative(),
  moderation_status: z.enum(MODERATION_STATUSES),
  latitude: z.number(), longitude: z.number(),     // flattened from stored geography
  username: z.string(),
}).omit({ location: true, location_accuracy_m: true });
export type Incident = z.infer<typeof IncidentSchema>;

export const ListIncidentsQuerySchema = z.object({
  minLon: z.coerce.number().min(-180).max(180).optional(),
  minLat: z.coerce.number().min(-90).max(90).optional(),
  maxLon: z.coerce.number().min(-180).max(180).optional(),
  maxLat: z.coerce.number().min(-90).max(90).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  type: z.enum(INCIDENT_TYPES).optional(),
  policeForce: z.enum(POLICE_FORCES).optional(),
  cursor: z.string().optional(),                   // opaque <createdAtIso>:<id>
  limit: z.coerce.number().int().min(1).max(50).default(25),
});
export const ListIncidentsResultSchema = z.object({
  items: z.array(IncidentSchema),
  next_cursor: z.string().nullable(),
});

export const UploadRequestSchema = z.object({ filename: z.string().min(1), contentType: MediaTypeSchema });
export const UploadResponseSchema = z.object({
  key: z.string().min(1),
  upload_url: z.string().min(1),         // signed PUT (S3/R2) or local media POST url
  headers: z.record(z.string()),
});

export const MagicLinkRequestSchema = z.object({ email: z.string().email(), username: z.string().regex(/^[a-z0-9_]{3,20}$/).optional() });
export const VerifyTokenSchema = z.object({ token: z.string().min(20) });
export const SessionUserSchema = z.object({ id: z.string().uuid(), username: z.string(), email: z.string().email() });
export const SessionSchema = z.object({ token: z.string().min(1), user: SessionUserSchema });

export const ReportFlagCreateSchema = z.object({
  incident_id: z.string().uuid(),
  reason: z.enum(REPORT_REASONS),
  detail: z.string().max(2000).optional().default(''),
});

export const ApiErrorSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) });
export type ApiErrorPayload = z.infer<typeof ApiErrorSchema>;

export const errorCodes = { UNAUTHORIZED:'unauthorized', FORBIDDEN:'forbidden', NOT_FOUND:'not_found', VALIDATION:'validation_error', RATE_LIMITED:'rate_limited', CONFLICT:'conflict', STORAGE:'storage_error' } as const;
```

## API Surface (backend implements; web consumes)

Public: `GET /` (health), `GET /incidents` (ListIncidentsQuery → ListIncidentsResult), `GET /incident/:id` (Incident), `GET /auth/magic-link` sends?? NO — see auth:
- `POST /auth/magic-link` body `MagicLinkRequestSchema` → 200 `{ ok: true }` always (no enumeration)
- `POST /auth/verify` body `VerifyTokenSchema` → `SessionSchema`
- `GET /auth/me` (Bearer JWT) → `SessionUserSchema` or 401
Auth required: `POST /upload` (UploadRequest → UploadResponse), `POST /incident` (IncidentCreate → Incident), `DELETE /incident/:id` → `{ ok: true }`, `POST /report` (ReportFlagCreate → `{ ok: true }`).
Media public read: `GET /media/:key` (dev-local impl reads fs; R2 impl returns cached redirect/proxy bytes).
Errors: `ApiErrorSchema` with codes from `errorCodes`.

## DB Schema (`infra/db/migrations/0001_init.sql`)

```sql
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TYPE incident_type AS ENUM ('stop_and_search','vehicle_stop','arrest','use_of_force','stop_and_question','traffic_collision','missing_person','other');
CREATE TYPE police_force AS ENUM ('avon-and-somerset','bedfordshire','cambridgeshire','cheshire','city-of-london','cleveland','cumbria','derbyshire','devon-and-cornwall','dorset','durham','dyfed-powys','essex','gloucestershire','greater-manchester','gwent','hampshire','hertfordshire','humberside','kent','lancashire','leicestershire','lincolnshire','merseyside','metropolitan','norfolk','north-wales','north-yorkshire','northamptonshire','northumbria','nottinghamshire','south-wales','south-yorkshire','staffordshire','suffolk','surrey','sussex','thames-valley','warwickshire','west-mercia','west-midlands','west-yorkshire','wiltshire','police-scotland','psni','british-transport-police','ministry-of-defence','civil-nuclear','other');
CREATE TYPE moderation_status AS ENUM ('pending','approved','removed');
CREATE TYPE subscription_tier AS ENUM ('free','supporter');
CREATE TYPE report_reason AS ENUM ('illegal_content','harassment','misinformation','privacy','other');

CREATE TABLE users (
  id uuid PRIMARY KEY,
  username text NOT NULL UNIQUE COLLATE "C",
  email text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  subscription_tier subscription_tier NOT NULL DEFAULT 'free',
  supporter_since timestamptz,
  password_hash text
);

CREATE TABLE magic_link_tokens (
  token_hash text PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  email text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);
CREATE INDEX magic_link_tokens_email_idx ON magic_link_tokens(email);

CREATE TABLE incidents (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id uuid NOT NULL UNIQUE,
  type incident_type NOT NULL,
  police_force police_force NOT NULL,
  location geography(Point,4326) NOT NULL,
  location_accuracy_m real,
  "timestamp" timestamptz NOT NULL,
  description text NOT NULL DEFAULT '',
  officer_count smallint,
  created_at timestamptz NOT NULL DEFAULT now(),
  view_count integer NOT NULL DEFAULT 0,
  cluster_id uuid,
  moderation_status moderation_status NOT NULL DEFAULT 'approved',
  moderation_tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', description || ' ' || type::text || ' ' || police_force::text)) STORED
);
CREATE INDEX incidents_location_idx ON incidents USING gist (location);
CREATE INDEX incidents_tsv_idx ON incidents USING gin (moderation_tsv);
CREATE INDEX incidents_created_idx ON incidents (moderation_status, created_at DESC);

CREATE TABLE media (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  url text NOT NULL,
  type text NOT NULL,
  sha256 text NOT NULL UNIQUE,
  thumbnail_url text
);

CREATE TABLE ratings (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  appropriateness smallint NOT NULL CHECK (appropriateness BETWEEN 1 AND 5),
  professionalism smallint NOT NULL CHECK (professionalism BETWEEN 1 AND 5),
  safety smallint NOT NULL CHECK (safety BETWEEN 1 AND 5)
);

CREATE TABLE officers (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  collar_number text NOT NULL
);

CREATE TABLE comments (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  moderation_status moderation_status NOT NULL DEFAULT 'approved'
);

CREATE TABLE saved_areas (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bounds geography(Polygon,4326) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE report_flags (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason report_reason NOT NULL,
  detail text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX report_flags_incident_idx ON report_flags(incident_id);

CREATE TABLE audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor uuid,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE media ENABLE ROW LEVEL SECURITY;
ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;
-- RLS policies: public read on approved incidents + their media; owner write.
CREATE POLICY incidents_read_approved ON incidents FOR SELECT USING (moderation_status = 'approved');
CREATE POLICY incidents_write_owner ON incidents FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY media_read_approved ON media FOR SELECT USING (incident_id IN (SELECT id FROM incidents WHERE moderation_status='approved'));
CREATE POLICY media_write_owner ON media FOR ALL USING (incident_id IN (SELECT id FROM incidents WHERE user_id = auth.uid()));
GRANT SELECT ON incidents, media TO anon; -- documented only (auth.uid() is a placeholder until PostgREST wiring; worker is the privileged app client in Phase 1)
```

> Note: `auth.uid()` is defined as a no-op function `CREATE FUNCTION auth.uid() RETURNS uuid AS $$ SELECT NULL::uuid $$ LANGUAGE sql;` in a `auth` schema so migrations run without Supabase. In Phase 1 the backend connects with a privileged role; RLS policies are forward-compatible guardrails. Do NOT rely on RLS for authorization in Phase 1 — enforce ownership in the backend (`repo.ts`) and in the web UI.

## Env Surface

`backend/.dev.vars` + `infra/env/backend.env.example`:
```
DATABASE_URL=postgres://postgres:postgres@localhost:5432/witnessgrid
JWT_SECRET=<random ≥32 chars>
PUBLIC_ORIGIN=http://localhost:3000
BASE_URL=http://localhost:8787
OBJECT_STORE=local                 # local | r2
LOCAL_MEDIA_DIR=./.media
R2_ACCOUNT_ID= R2_ACCESS_KEY_ID= R2_SECRET_ACCESS_KEY= R2_BUCKET= R2_PUBLIC_HOST=  (r2 only)
RESEND_API_KEY=                    (optional; unset => dev console mail)
EMAIL_FROM="WitnessGrid <noreply@witnessgrid.app>"
MAGIC_LINK_TTL_MINUTES=15
```
`web/.env.local` + `infra/env/web.env.example`:
```
NEXT_PUBLIC_API_BASE_URL=http://localhost:8787
NEXT_PUBLIC_MAP_TILES_URL=https://demo-bucket.protomaps.com/v4.pmtiles  (config-driven)
```

---

## Tasks

### Task 0: Repo scaffold + `packages/contract` (orchestrator — NOT a subagent task)

**Files:** root `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`; `packages/contract/*` (full source above).

- [ ] Scaffold workspace (pnpm, typecheck script `pnpm -r typecheck`, test script `pnpm -r test`).
- [ ] Implement `packages/contract` exactly as the FULL SOURCE above; add zod version (latest 3.x) + vitest dev dep.
- [ ] Write `tests/schemas.test.ts`: pass cases for valid create/upload/list/report/session payloads; fail cases for bad lat/lon, non-uuid `client_id`, wrong force, oversized description, missing media. Also `ListIncidentsQuerySchema` coerces `limit` string to number.
- [ ] `pnpm -r --filter @witnessgrid/contract test` — tests pass. Commit: `feat: scaffold workspace and shared contract`.

### Task 1: Infra — migrations, seed, runners, CI, OSS files (parallel)

**Files:** `infra/db/migrations/0001_init.sql` (verbatim above), `infra/db/seed.sql`, `infra/db/migrate.ts`, `infra/db/seed.ts`, `infra/env/*.env.example`, `.github/workflows/ci.yml`, `README.md`, `LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`.

- [ ] Migration SQL = FULL SOURCE above. Add `CREATE SCHEMA IF NOT EXISTS auth; CREATE FUNCTION auth.uid()...` (no-op, see note). Ensure it runs clean on PostGIS (wrapped idempotently for re-runs where practical).
- [ ] `migrate.ts`: Node script using `postgres` (porsager) — finds `infra/db/migrations/*.sql` sorted, tracks applied in a `schema_migrations` table, applies unapplied. `seed.ts` runs `seed.sql` (5–8 realistic UK incidents across forces/types/timestamps + 2 demo users `@devseed`, none with real emails; use fixed uuids; incidents `moderation_status='approved'`; valid sha256 placeholders for media refs that point at no real objects — seed media rows must still satisfy the sha256 format).
- [ ] `ci.yml`: pnpm setup, install, `pnpm -r typecheck`, `pnpm -r test`, `pnpm lint` (if configured). Deploy job present but `when: manual` / env-gated (no creds yet).
- [ ] OSS files + README (badges-free, describes stack, dev setup steps).
- [ ] Verify: run `node infra/db/migrate.ts --dry-run` prints plan without connecting (guard for missing DB). Commit: `feat: db migrations, seed, ci, oss files`.

> Waiting on local Postgres: it is NOT yet installed. Scripts must fail with a clear actionable error ("DATABASE_URL unreachable — install Postgres + PostGIS then run migrate") rather than pretending. This is expected; full migration run happens in the end-review.

### Task 2: Backend — Hono API service (parallel)

**Files:** `backend/*` per structure above.

- [ ] **Config + app skeleton**: `config.ts` (required/optional env, validate `DATABASE_URL`, `JWT_SECRET`, `PUBLIC_ORIGIN`, `BASE_URL`), `app.ts` (Hono, CORS for `PUBLIC_ORIGIN`, JSON body limit, global error handler → `ApiErrorSchema`). `index.ts`: if `process.env` runtime (Node) → `@hono/node-server`, else (Workers) → export Hono app. `GET /` returns `{ ok: true, service: 'witnessgrid-api' }`. Test via vitest `app.request()`: 200 on `/`, CORS header present, unknown route → 404 with `ApiErrorSchema`.
- [ ] **DB + repo**: `db.ts` selects adapter: `OBJECT`… if `PLATFORM=workers` → neon; else `postgres` local over TCP from `DATABASE_URL`. `repo.ts` typed functions:
  - `createIncident(input, userId): Promise<Incident>` — inserts incident (geography via `ST_MakePoint(lon,lat)` cast to geography, `ST_SetSRID`), media rows, officer rows; upsert-safe via `client_id` unique (catch `23505` on client_id → error `CONFLICT`).
  - `getIncident(id, userId|null)` — row + username (joins users) + media; increments `view_count` in same tx when `userId !== owner`? no — increment on every public read (backend-controlled).
  - `listIncidents(query)` — WHERE moderation_status='approved', optional bbox via `ST_Intersects(location, ST_MakeEnvelope(minLon,minLat,maxLon,maxLat,4326))`, start/end on `timestamp`, type, force; cursor decode `createdAtIso:id` → `(created_at, id) < (t, id)` ordering; limit.
  - `deleteIncident(id, userId)` — verifies ownership → deletes rows (media objects deleted via store after fetch of keys).
  - `createUser`, `getUserByEmail`, `getUserById`, `create/consumeMagicToken`, `incrementView`.
- [ ] **Object store + upload**: `media/store.ts` interface `{ createUpload(request): Promise<{key,upload_url,headers}>; delete(keys): Promise<void>; publicUrl(key): string }`. Local impl: key from sha (client provides) under `LOCAL_MEDIA_DIR`, `upload_url` = `${BASE_URL}/media/upload`, signed via a one-time secret HMAC (header `x-media-token`, 5-min). R2 impl: S3 `putObject` presigned PUT URL + headers. `media/upload.ts`: POST /upload (auth) validates `UploadRequestSchema`, allowlist from `MediaTypeSchema`, returns `UploadResponse`. `media/serve.ts` GET `/media/upload` (dev, HMAC-verified, writes stream to disk) and GET `/media/:key` (reads from disk; r2 impl returns redirect).
- [ ] **Auth**: `auth/tokens.ts` (crypto random 32B token, store `sha256`), `auth/magic-link.ts` (create token + email link `${BASE_URL}/auth/verify?token=...`), `auth/jwt.ts` (HS256 sign/verify with `JWT_SECRET`, claims `sub`, `email`, `username`, `iat`, `exp` — exp 30d). Routes: POST /auth/magic-link (create-or-login semantics: if email unknown, create user with `username` required; always 200 `{ok:true}`; email via `email.ts` — Resend when `RESEND_API_KEY`, else log link to console). POST /auth/verify (hash token lookup, expiry/used check, mark used, return `SessionSchema`). GET /auth/me (Bearer). **Magic-link must work when email is the dev console — link printed to server log.**
- [ ] **Incident + report routes**: POST /incident (auth, validate `IncidentCreateSchema`, call `createIncident`), DELETE /incident/:id (owner), POST /report (auth, `ReportFlagCreateSchema`).
- [ ] **Middleware**: JWT auth guard; `rate-limit.ts` Postgres-backed fixed-window counter keyed by userId+route (INSERT UPSERT counter, TTL bucket) — simple, real; unit-testable against a temp schema.
- [ ] **Tests** (vitest): unit — auth JWT round-trip, token hash, HMAC media token, incident/cursor decode, config validation; integration — against real local Postgres (skipped via `describe.skipIf(!process.env.DATABASE_URL)`? NO — must run for real in end-review; use `beforeAll` to run `migrate.ts`). Tests create own rows and assert: unauthenticated POST /incident → 401; valid create → 201/200 + appears in list; duplicate client_id → CONFLICT; delete by non-owner → 403; bbox filter returns only inside polygon; cursor pagination page 2.
- [ ] **wrangler.toml** with r2 bucket binding + `vars` — deploy-ready. Commit: `feat: witnessgrid api service`.

### Task 3: Web — Next.js PWA (parallel)

**Files:** `web/**` per structure above.

- [ ] **Scaffold**: Next.js 15 App Router + TypeScript strict + Tailwind v4 (CSS-first `@theme` tokens from palette), Atkinson Hyperlegible + Archivo + IBM Plex Mono via `next/font/google` (self-hosted, no runtime API calls). Serwist PWA (`serwist.config.ts`): precache shell, runtime cache for `/incidents`, `/media/*`, `NEXT_PUBLIC_MAP_TILES_URL`; `manifest.webmanifest` (name WitnessGrid, icons, theme_color `#12151C`, display standalone, `start_url /`). Layout with bottom nav (Map · Report · Feed · Stats · Profile) mobile, sidebar ≥1024px. `navigator.storage.persist()` invoked on load.
- [ ] **Design system**: `globals.css` tokens, `.timecode` (IBM Plex Mono strip, format `HH:MM:SS · DD MMM · FORCE · lat,lon · #hash8`), register row component (mono metadata column left, thumb+description right), Sillitoe tartan divider (CSS conic/repeating gradient), buttons (≥44px). Reduced-motion respected.
- [ ] **API client + store**: `lib/api.ts` wrapper (fetch, error decode via `ApiErrorSchema`, attach Bearer), React Query provider, Zustand store for session (`token`, `user`, selectors), `lib/session.ts` persist token in localStorage.
- [ ] **Auth UI**: `/signin` — email + optional username (shown when email belongs to no account), sends magic link, "check your email" state; auto-verify flow: page reads `?token=` → POST /auth/verify → store session → redirect. `lib/session.ts` SSR helper for route gating (redirect unauthenticated from `/report`).
- [ ] **Report flow** (`/report`, login-gated): step Capture (getUserMedia photo+video, file picker fallback, multi-media list w/ thumbnails) → step Pin (MapLibre map, GPS pre-pin + accuracy circle, drag to adjust, manual pin if no GPS) → step Form (type, force searchable select, timestamp, officer_count, collar numbers, description, confirmation checkbox blocks submit) → submit. Media utils `lib/media.ts`: SHA-256 (WebCrypto), video compression (MediaRecorder WebM; preserves duration), canvas thumbnail/poster. Hashes computed at capture enqueue time.
- [ ] **Offline queue** `lib/offline-queue.ts`: IndexedDB (idb) — `pending` rows {client_id, incident payload, media blobs}; flush on foreground (`pageshow`/`visibilitychange`) + `online`, backoff; POST /upload per blob then POST /incident with `client_id`; failure leaves row for retry; dedup via client_id (server CONFLICT → mark done).
- [ ] **Register feed** `/` SSR: server fetch `GET /incidents` (via `NEXT_PUBLIC_API_BASE_URL`, but server-side reads env directly), render register rows + pagination (Load more = client React Query fetch with cursor). SSR must not crash when API is down — degrade with clear status banner.
- [ ] **Map page** `/map`: MapLibre GL JS + PMTiles source (`NEXT_PUBLIC_MAP_TILES_URL`), MarkerCluster for approved incidents, floating translucent filter panel (type, force, date range, rating later), marker → detail. Full-bleed, fetched client-side.
- [ ] **Incident detail** `/incident/[id]` SSR + `generateMetadata` (title/description from incident; OG image via `/assets/og/[id]`): timecode band → media (lazy) → map preview → narrative (Atkinson) → owner actions (delete when mine) → **Report this** button (POST /report). Missing/removed → "record not available" (410-ish) page.
- [ ] **Profile** `/profile` (auth): username, my submissions list (view counts), delete (with confirm), sign out. Guest action → sign-in redirect with reason.
- [ ] **Policy/meta pages**: `/about`, `/terms`, `/content-policy`, `/privacy`; `sitemap.ts`, `robots.ts`.
- [ ] **Tests**: unit — media hash/compress functions, offline queue enqueue/flush logic, cursor parsing, session store; e2e (Playwright) — signup via dev console magic link (read server log file), submit a report (file-picker path), see it in feed + map pin, delete it. (E2E runs in end-review when API + DB live.)
- [ ] Commit: `feat: witnessgrid pwa`. (Big task — commit in sub-chunks as marked by reviewer.)

### Task 4: Integration & parity (orchestrator)

- [ ] Typecheck entire repo (`pnpm -r typecheck`) — contracts in `web`/`backend` match `packages/contract` exactly.
- [ ] `pnpm lint` (if configured). Fix imports/paths/duplicate enums.
- [ ] Unit tests pass repo-wide (anything not needing DB).
- [ ] Commit integration fixes.

### End-review (placeholder committed to run AFTER infra install by the user/orchestrator)

- [ ] Install PostgreSQL + PostGIS on host; start service.
- [ ] `node infra/db/migrate.ts` then `node infra/db/seed.ts`.
- [ ] Start backend (`pnpm --filter @witnessgrid/backend dev`), run its vitest integration suite.
- [ ] Start web (`pnpm --filter @witnessgrid/web dev`), run Playwright e2e.
- [ ] Manual smoke: capture → submit → map/feed/detail, offline queue (devtools offline), delete, sign out.
- [ ] Verify §14 exit criteria from the spec; file remaining issues as follow-ups.