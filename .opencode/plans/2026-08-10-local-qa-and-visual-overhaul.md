# WitnessGrid — Local Bring-Up, Bug Fixes, and Visual Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make WitnessGrid run fully on this machine (web + backend + Postgres/PostGIS with seeded data), fix every confirmed correctness/security bug, and elevate the visual design so the site finally matches the approved "evidence register" aesthetic instead of reading as a broken, empty shell.

**Architecture:** Five sequential phases, each independently testable: (A) local bring-up, (B) backend correctness + security fixes, (C) web functional fixes, (D) visual overhaul, (E) repo hygiene + CI. Every backend task ends by running the DB integration suite against the local Postgres (`RUN_DB_TESTS=1`); every web task ends with vitest/typecheck; the final task is a full end-to-end checklist.

**Tech Stack:** pnpm 9.12.0 workspaces (contract/backend/web/infra), Hono + porsager postgres + jose, Next.js 15 App Router + Tailwind v4 + MapLibre GL v4 + Zustand + React Query, vitest, Node 24.

## Global Constraints

- **Contract is the single source of truth** — never redefine a zod schema; extend `packages/contract` only if a new field is genuinely needed (none of these tasks need one).
- **DB reality on this host:** PostgreSQL 18 running on 127.0.0.1:5432, superuser `postgres`/`postgres`, PostGIS 3.6.2 available, database `witnessgrid` already exists with migrations applied and 30 seeded incidents. `C:\Program Files\PostgreSQL\18\bin\psql.exe` is the client; it is NOT on PATH — always call it by full path.
- Backend integration tests require `RUN_DB_TESTS=1` env var; CI never sets it, so every backend task verifies manually: `$env:RUN_DB_TESTS="1"; pnpm test` in `backend/`.
- Design tokens in `web/src/app/globals.css` are semantic and never flip by name (`--bg`, `--accent`, …). MapLibre paint properties cannot read CSS variables — use a `cssVar()` runtime helper that reads `getComputedStyle(document.documentElement)` (introduced in Task 17) instead of new hardcoded hex values.
- `pnpm -r typecheck` and `pnpm -r test` must stay green after every task. Commit after each task with the message given in the task.
- Root has **no `.git`** directory yet (Task 22 initialises it). Until then, "commit" steps are skipped with a note; do not create the repo early.
- Touch targets ≥44px, visible `:focus-visible` outlines, `prefers-reduced-motion` respected, `role`/`aria` on interactive widgets — new UI must keep these.
- Copy is UK English, register-voice: precise, calm, "witnesses", "records", "the register".

---

## Phase A — Local bring-up

### Task 1: Local environment files + full-stack verification

**Files:**
- Create: `backend/.env` (from `backend/.env.example`)
- Create: `web/.env.local` (from `web/.env.example`)
- Modify: `README.md:32-57` (only the env-file instructions; full doc pass is Task 22)

**Interfaces:**
- Produces: a running stack — backend on `http://localhost:8787`, web on `http://localhost:3000`, both serving seeded data.

- [ ] **Step 1: Generate a real JWT secret**

Run (Node is installed):
```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Copy the 64-hex output for the next step.

- [ ] **Step 2: Create `backend/.env`**

```env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/witnessgrid
JWT_SECRET=<the generated 64-hex string>
PUBLIC_ORIGIN=http://localhost:3000
BASE_URL=http://localhost:8787
OBJECT_STORE=local
LOCAL_MEDIA_DIR=./.media
EMAIL_FROM=WitnessGrid <noreply@witnessgrid.app>
MAGIC_LINK_TTL_MINUTES=15
PORT=8787
```

- [ ] **Step 3: Create `web/.env.local`**

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8787
API_BASE_URL=http://localhost:8787
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_MAP_TILES_URL=https://tile.openstreetmap.org/{z}/{x}/{y}.png
```

- [ ] **Step 4: Confirm migrations + seed are current (idempotent — safe to re-run)**

```powershell
pnpm migrate
pnpm seed
```
Expected: migrations report "no pending" or re-apply cleanly; seed reports idempotent inserts.

- [ ] **Step 5: Boot both services and verify data flows**

```powershell
pnpm dev
```
In a second shell:
```powershell
Invoke-RestMethod http://localhost:8787/ | ConvertTo-Json
Invoke-RestMethod "http://localhost:8787/incidents?limit=3" | ConvertTo-Json -Depth 4
(Invoke-WebRequest http://localhost:3000/).StatusCode
```
Expected: health JSON, a list of 3 incidents with `username`, `location_accuracy_m` (may be null), and HTTP 200 from the web app with incident rows in the HTML.

- [ ] **Step 6: Verify the browser experience manually**

Open `http://localhost:3000` — expect: feed renders 25 seeded incidents, thumbnails, timecode rows; `/map` loads clusters; `/incident/<id>` renders; `/signin` sends a magic link logged to `backend/.dev-mail.log` and completes a session. Note anything broken for later tasks.

- [ ] **Step 7: Commit**

```bash
git init -q && git add -A && git commit -m "chore: local env files"
```
(Only if the user has since initialised git; otherwise delete nothing and move on.)

---

## Phase B — Backend correctness & security

### Task 2: Serialize `location_accuracy_m` (broken round-trip)

**Files:**
- Modify: `backend/src/repo/shared.ts:46-60` (`IncidentBaseRow`), `backend/src/repo/shared.ts:73-80` (`INCIDENT_SELECT`)
- Modify: `backend/src/repo/incidents.ts:53-77` (`serializeIncident`)
- Test: `backend/tests/integration/db.test.ts` (append one test)

**Interfaces:**
- Consumes: DB column `incidents.location_accuracy_m real` (already exists, `infra/db/migrations/0001_init.sql:79`).
- Produces: `Incident.location_accuracy_m?: number` now populated by `listIncidents`, `getIncident`, `listUserIncidents` — consumed by the web detail page (`web/src/app/(public)/incident/[id]/page.tsx:77-81,95-98`, which already renders it).

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/integration/db.test.ts` (mirror the file's existing helpers — `enabled` gate, `app`/`db` fixtures — and the existing incident-creation pattern):

```ts
it('serializes location_accuracy_m on created incidents', async () => {
  const res = await app.request('/incident', {
    method: 'POST',
    headers: { authorization: `Bearer ${testToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: crypto.randomUUID(),
      incident_type: 'stop_and_search',
      police_force: 'metropolitan',
      timestamp: new Date().toISOString(),
      location: { lat: 51.5074, lon: -0.1278 },
      location_accuracy_m: 12,
      media: [{ key: 'media/x/y.jpg', type: 'image/jpeg', hash: 'a'.repeat(64) }],
    }),
  });
  expect(res.status).toBe(201);
  const body = (await res.json()) as { location_accuracy_m?: number };
  expect(body.location_accuracy_m).toBe(12);
});
```
(If the suite's existing create flow uses a different status/body, match the existing test's expectations — the assertion that matters is `location_accuracy_m === 12` round-tripping.)

- [ ] **Step 2: Run it to verify it fails**

```powershell
$env:RUN_DB_TESTS="1"; pnpm test
```
Expected: FAIL — `location_accuracy_m` is `undefined` (never serialized).

- [ ] **Step 3: Implement the round-trip**

`backend/src/repo/shared.ts`:
```ts
export interface IncidentBaseRow {
  // ...existing fields...
  location_accuracy_m: number | null;
}
```
And in `INCIDENT_SELECT`, add the column:
```ts
export const INCIDENT_SELECT = `
  SELECT i.id, i.user_id, i.client_id, i.type AS incident_type, i.police_force,
    i."timestamp", i.description, i.officer_count, i.created_at, i.view_count, i.moderation_status,
    i.location_accuracy_m,
    ST_X(i.location::geometry) AS longitude, ST_Y(i.location::geometry) AS latitude,
    u.username
  FROM incidents i
  LEFT JOIN users u ON u.id = i.user_id
`;
```

`backend/src/repo/incidents.ts` `serializeIncident`:
```ts
    description: row.description,
    ...(row.officer_count !== null && { officer_count: row.officer_count }),
    ...(row.location_accuracy_m !== null && { location_accuracy_m: row.location_accuracy_m }),
```

- [ ] **Step 4: Run the suite to verify it passes**

```powershell
$env:RUN_DB_TESTS="1"; pnpm test
```
Expected: PASS (all integration + unit tests).

- [ ] **Step 5: Typecheck + commit**

```powershell
pnpm typecheck
```
```bash
git add backend/ && git commit -m "fix: serialize location_accuracy_m so accuracy UI can display"
```

### Task 3: `POST /report` 404 and ratings moderation guard

**Files:**
- Modify: `backend/src/repo/flags.ts:3-12` (`createReportFlag`)
- Modify: `backend/src/repo/ratings.ts:26-58` (`getRatingSummary`), `backend/src/repo/ratings.ts:65-87` (`upsertRating`)
- Test: `backend/tests/integration/db.test.ts`

**Interfaces:**
- Consumes: `errorCodes.NOT_FOUND` (maps to 404), existing `getIncident` semantics: non-approved incidents are invisible to non-owners (`backend/src/repo/incidents.ts:163`).
- Produces: `createReportFlag` throws 404 on unknown incident; `getRatingSummary`/`upsertRating` treat non-approved incidents as not found for non-owners.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/integration/db.test.ts`:

```ts
it('POST /report on a missing incident returns 404', async () => {
  const res = await app.request('/report', {
    method: 'POST',
    headers: { authorization: `Bearer ${testToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ incident_id: crypto.randomUUID(), reason: 'other' }),
  });
  expect(res.status).toBe(404);
});

it('rating a removed incident returns 404', async () => {
  const removed = await createTestIncident(); // helper that sets moderation_status='removed' directly in SQL
  const res = await app.request(`/ratings/${removed.id}`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${testToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ appropriateness: 4, professionalism: 4, safety: 4 }),
  });
  expect(res.status).toBe(404);
});
```
(If `db.test.ts` has no `createTestIncident` helper, write one inline following the file's existing SQL-insert style: insert an incident row owned by a second test user with `moderation_status = 'removed'`.)

- [ ] **Step 2: Run to verify they fail**

```powershell
$env:RUN_DB_TESTS="1"; pnpm test
```
Expected: FAIL — `/report` currently returns 500; rating a removed incident currently returns 200.

- [ ] **Step 3: Implement**

`backend/src/repo/flags.ts`:
```ts
import { db } from '../db.js';
import { ApiError, errorCodes } from '../errors.js';

export async function createReportFlag(
  incidentId: string,
  userId: string | null,
  reason: string,
  detail: string | null,
): Promise<void> {
  const rows = await db<{ id: string }[]>`
    SELECT id FROM incidents WHERE id = ${incidentId}
  `;
  if (!rows[0]) throw new ApiError(errorCodes.NOT_FOUND, 'incident not found');
  await db`
    INSERT INTO report_flags (id, incident_id, user_id, reason, detail)
    VALUES (${crypto.randomUUID()}, ${incidentId}, ${userId}, ${reason}, ${detail})
  `;
}
```

`backend/src/repo/ratings.ts` — add a visibility helper and use it in both functions:
```ts
async function assertVisible(incidentId: string, viewerId: string | null): Promise<void> {
  const rows = await q<{ user_id: string | null; moderation_status: string }[]>`
    SELECT user_id, moderation_status FROM incidents WHERE id = ${incidentId}
  `;
  const row = rows[0];
  if (!row) throw new ApiError(errorCodes.NOT_FOUND, 'incident not found');
  if (row.moderation_status !== 'approved' && row.user_id !== viewerId) {
    throw new ApiError(errorCodes.NOT_FOUND, 'incident not found');
  }
}
```
- In `getRatingSummary(incidentId, viewerId)`: first line `await assertVisible(incidentId, viewerId);`
- In `upsertRating(incidentId, userId, ratings)`: replace the existing owner lookup (`ratings.ts:66-71`) with:
```ts
const rows = await q<{ user_id: string | null }[]>`
  SELECT user_id FROM incidents WHERE id = ${incidentId}
`;
const owner = rows[0];
if (!owner) throw new ApiError(errorCodes.NOT_FOUND, 'incident not found');
await assertVisible(incidentId, userId);
if (owner.user_id === userId) {
  throw new ApiError(errorCodes.CONFLICT, 'you cannot rate your own incident');
}
```
(Order matters: visibility first, then owner check — an owner rating their own removed incident still gets 409 via the owner check only if visible, which for an owner it is.)

- [ ] **Step 4: Run the suite to verify it passes**

```powershell
$env:RUN_DB_TESTS="1"; pnpm test
```
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```powershell
pnpm typecheck
```
```bash
git add backend/ && git commit -m "fix: 404 for reports/ratings on missing or non-approved incidents"
```

### Task 4: Rate-limit middleware ordering + `Retry-After` header

**Files:**
- Modify: `backend/src/routes/auth.ts:17` (middleware order)
- Modify: `backend/src/rate-limit.ts:20-23` (`limit` helper)
- Test: `backend/tests/integration/db.test.ts`

**Interfaces:**
- Consumes: `rateLimitHit(bucket, windowSeconds)` from `backend/src/repo/rate-limit-store.ts` (returns `{ hits, resetAt }` — `resetAt` is currently unused).
- Produces: `/auth/magic-link` rejects oversized bodies with 413 **before** any rate-limit bucket is touched; all 429 responses include a `Retry-After` header (seconds).

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/integration/db.test.ts`:
```ts
it('magic-link rate limit responses include Retry-After', async () => {
  for (let i = 0; i < 11; i++) {
    await app.request('/auth/magic-link', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: `burst-${i}@example.com` }),
    });
  }
  const res = await app.request('/auth/magic-link', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'burst-11@example.com' }),
  });
  expect(res.status).toBe(429);
  expect(res.headers.get('retry-after')).toBeTruthy();
});
```
(Note: this test hits the per-IP bucket from the test host — it may interfere with other tests that send magic links. If the suite has a shared-IP conflict, instead unit-test the header logic by calling the route handler once with a mocked `rateLimitHit` — check how `tests/` stubs DB calls; if no precedent, keep the integration test but restore by deleting `rate_limit` rows in an `afterEach`.)

- [ ] **Step 2: Run to verify it fails**

```powershell
$env:RUN_DB_TESTS="1"; pnpm test
```
Expected: FAIL — 429 has no `Retry-After` header.

- [ ] **Step 3: Implement**

`backend/src/rate-limit.ts`:
```ts
async function limit(bucket: string, maxHits: number, windowSeconds: number, c?: Context<AppEnv>): Promise<void> {
  const { hits, resetAt } = await rateLimitHit(bucket, windowSeconds);
  if (hits > maxHits) {
    const retrySeconds = resetAt instanceof Date
      ? Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000))
      : windowSeconds;
    c?.header('Retry-After', String(retrySeconds));
    throw new ApiError(errorCodes.RATE_LIMITED, 'rate limit exceeded');
  }
}
```
Pass `c` through every call site in the same file (`mutateRateLimit`, `savedAreaRateLimit`, `magicLinkRateLimit`, `verifyRateLimit`) — e.g. `await limit(..., c)`.

`backend/src/routes/auth.ts:17` — swap so the body cap runs first:
```ts
authRoutes.post('/auth/magic-link', jsonBodyLimit, magicLinkRateLimit, async (c) => {
```

- [ ] **Step 4: Run the suite to verify it passes**

```powershell
$env:RUN_DB_TESTS="1"; pnpm test
```

- [ ] **Step 5: Typecheck + commit**

```powershell
pnpm typecheck
```
```bash
git add backend/ && git commit -m "fix: run body-limit before rate-limit; add Retry-After on 429s"
```

### Task 5: Media upload/serve hardening

**Files:**
- Modify: `backend/src/repo/upload-grants.ts` (add `getUploadGrant`)
- Modify: `backend/src/media/serve.ts:24-49` (`streamBodyToFile`), `serve.ts:51-65` (`handleMediaUpload`), `serve.ts:71-92` (`handleMediaGet`)
- Test: `backend/tests/media/serve.test.ts` (new unit test file)

**Interfaces:**
- Consumes: `media_grants.content_type` column (already created by the upload grant flow, `upload-grants.ts:10-16`).
- Produces: `getUploadGrant(key): Promise<{ content_type: string } | null>`; `handleMediaUpload` rejects content-type mismatches and oversize bodies and never leaves `.part` files; `GET /media/*` sends `X-Content-Type-Options: nosniff`, `Content-Disposition: inline`, `Cache-Control: public, max-age=86400`.

- [ ] **Step 1: Write the failing unit test**

Create `backend/tests/media/serve.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { contentTypeForKey } from '../../src/media/store.js';
import { mediaServeRoutes } from '../../src/media/serve.js';

describe('media serve', () => {
  it('rejects unknown extensions as octet-stream but serves known types', () => {
    expect(contentTypeForKey('media/x/a.jpg')).toBe('image/jpeg');
    expect(contentTypeForKey('media/x/a.html')).toBe('application/octet-stream');
  });

  it('GET /media/upload is not registered as a body-writer endpoint', async () => {
    const res = await mediaServeRoutes.request('/media/upload', { method: 'GET' });
    expect([400, 405, 404]).toContain(res.status);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```powershell
pnpm test
```
Expected: the second test FAILs — GET `/media/upload` currently hits `handleMediaUpload` and returns 400 "request body required"; if the check is `400` only, adjust the assertion to `expect(res.status).toBe(400)` — either way the test pins the endpoint's behaviour.

- [ ] **Step 3: Implement**

`backend/src/repo/upload-grants.ts` — add:
```ts
export async function getUploadGrant(key: string): Promise<{ content_type: string } | null> {
  const rows = await db<{ content_type: string }[]>`
    SELECT content_type FROM media_grants WHERE key = ${key}
  `;
  return rows[0] ?? null;
}
```

`backend/src/media/serve.ts`:
```ts
export const MAX_LOCAL_UPLOAD_BYTES = 500 * 1024 * 1024;
```
In `streamBodyToFile`, count bytes and clean up `.part` on any failure:
```ts
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_LOCAL_UPLOAD_BYTES) {
        throw new ApiError(errorCodes.VALIDATION, 'upload exceeds the 500MB limit');
      }
      hash.update(value);
      if (!writer.write(value)) await once(writer, 'drain');
    }
    writer.end();
    await once(writer, 'close');
    await rename(tmpPath, filePath);
    return hash.digest('hex');
  } catch (err) {
    writer.destroy();
    await rm(tmpPath, { force: true }).catch(() => undefined);
    throw err;
  }
```
(Add `rm` to the existing `node:fs/promises` import.)

In `handleMediaUpload`, after token verification and before streaming:
```ts
  const grant = await getUploadGrant(key);
  if (!grant) throw new ApiError(errorCodes.UNAUTHORIZED, 'unknown media key');
  const declared = (c.req.header('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
  if (declared && declared !== grant.content_type.toLowerCase()) {
    throw new ApiError(errorCodes.VALIDATION, 'media content-type does not match the upload grant');
  }
```

In `handleMediaGet` local branch:
```ts
    return new Response(body as unknown as BodyInit, {
      status: 200,
      headers: {
        'content-type': contentType,
        'x-content-type-options': 'nosniff',
        'content-disposition': 'inline',
        'cache-control': 'public, max-age=86400',
      },
    });
```

Remove the stray GET registration:
```ts
// delete this line:
mediaServeRoutes.get('/media/upload', handleMediaUpload);
```

- [ ] **Step 4: Run tests to verify**

```powershell
pnpm test
```
Expected: PASS (unit suite; integration suite unchanged).

- [ ] **Step 5: Typecheck + commit**

```powershell
pnpm typecheck
```
```bash
git add backend/ && git commit -m "fix: harden local media upload (size cap, type check, cleanup) and serve headers"
```

### Task 6: JWT issuer/audience + auth failure distinction

**Files:**
- Modify: `backend/src/auth/jwt.ts:13-24`
- Modify: `backend/src/middleware/auth.ts:12-24` (`sessionFromToken`)
- Test: `backend/tests/auth/jwt.test.ts`

**Interfaces:**
- Consumes: existing `JWT_SECRET`; `jose`'s error classes (`err.code` strings starting `ERR_JWT`).
- Produces: tokens with `iss: 'witnessgrid'`, `aud: 'witnessgrid-web'`; `sessionFromToken` returns 401 only for invalid/expired tokens and propagates DB failures as 500 instead of swallowing them.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/auth/jwt.test.ts`:
```ts
it('verification requires the witnessgrid issuer and audience', async () => {
  const { signSessionJwt, verifySessionJwt } = await import('../../src/auth/jwt.js');
  const token = await signSessionJwt({ sub: 'u', username: 'w', email: 'w@example.com' });
  await expect(verifySessionJwt(token)).resolves.toMatchObject({ iss: 'witnessgrid', aud: 'witnessgrid-web' });
});
```

- [ ] **Step 2: Run to verify it fails**

```powershell
pnpm test
```
Expected: FAIL — `iss`/`aud` are absent.

- [ ] **Step 3: Implement**

`backend/src/auth/jwt.ts`:
```ts
export async function signSessionJwt(user: SessionClaims, expiresIn: string | number = '30d'): Promise<string> {
  return new SignJWT({ username: user.username, email: user.email })
    .setProtectedHeader({ alg: ALG })
    .setSubject(user.sub)
    .setIssuer('witnessgrid')
    .setAudience('witnessgrid-web')
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secretKey);
}

export async function verifySessionJwt(token: string): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, secretKey, {
    algorithms: [ALG],
    issuer: 'witnessgrid',
    audience: 'witnessgrid-web',
  });
  return payload;
}
```

`backend/src/middleware/auth.ts` — `sessionFromToken` catch block:
```ts
  } catch (err) {
    if (
      err instanceof Error &&
      'code' in err &&
      typeof (err as { code: unknown }).code === 'string' &&
      (err as { code: string }).code.startsWith('ERR_JWT')
    ) {
      return null;
    }
    throw err;
  }
```

- [ ] **Step 4: Run tests + typecheck + commit**

```powershell
pnpm test; pnpm typecheck
```
```bash
git add backend/ && git commit -m "fix: scope JWTs to witnessgrid issuer/audience; stop swallowing DB failures as 401"
```

### Task 7: Prune magic-link tokens

**Files:**
- Modify: `backend/src/repo/magic-tokens.ts` (add `pruneExpiredMagicTokens`; call it opportunistically)

**Interfaces:**
- Consumes: `magic_link_tokens` table (`token_hash, user_id, email, expires_at, used_at` — no `created_at` column, `infra/db/migrations/0001_init.sql:63-70`).
- Produces: used tokens and tokens expired more than 1 hour are deleted; called from `createMagicLink` at most once every 10 minutes (module-level timestamp guard).

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/integration/db.test.ts`:
```ts
it('prunes used and long-expired magic tokens', async () => {
  // insert a used token + an expired token directly
  await db`INSERT INTO magic_link_tokens (token_hash, user_id, email, expires_at, used_at)
           VALUES ('used-hash', NULL, 'p@example.com', now() + interval '1 day', now())`;
  await db`INSERT INTO magic_link_tokens (token_hash, user_id, email, expires_at)
           VALUES ('expired-hash', NULL, 'p@example.com', now() - interval '2 hours')`;
  await pruneExpiredMagicTokens();
  const left = await db<{ token_hash: string }[]>`SELECT token_hash FROM magic_link_tokens`;
  expect(left.some((r) => r.token_hash === 'used-hash')).toBe(false);
  expect(left.some((r) => r.token_hash === 'expired-hash')).toBe(false);
});
```
(Follow the file's existing import style for `db` and repo functions.)

- [ ] **Step 2: Run to verify it fails**

```powershell
$env:RUN_DB_TESTS="1"; pnpm test
```
Expected: FAIL — `pruneExpiredMagicTokens` is not exported.

- [ ] **Step 3: Implement**

`backend/src/repo/magic-tokens.ts`:
```ts
let lastPrune = 0;

export async function pruneExpiredMagicTokens(): Promise<void> {
  const now = Date.now();
  if (now - lastPrune < 10 * 60 * 1000) return;
  lastPrune = now;
  await db`
    DELETE FROM magic_link_tokens
    WHERE used_at IS NOT NULL OR expires_at < now() - interval '1 hour'
  `;
}
```
Call it at the top of `createMagicToken` (fire-and-forget with `.catch(() => undefined)` is acceptable, but simplest is `await` — the table stays small).

- [ ] **Step 4: Run tests + typecheck + commit**

```powershell
$env:RUN_DB_TESTS="1"; pnpm test; pnpm typecheck
```
```bash
git add backend/ && git commit -m "chore: prune used and expired magic-link tokens"
```

---

## Phase C — Web functional fixes

### Task 8: Ratings — independent axes on first rating

**Files:**
- Create: `web/src/lib/ratings.ts`
- Create: `web/src/tests/ratings.test.ts`
- Modify: `web/src/components/rating-panel.tsx:131-139` (`select`)

**Interfaces:**
- Consumes: `RatingSummary` type from `@/lib/contract` (already imported by the panel).
- Produces: `buildScores(axis: RatingAxis, value: number, existing: RatingScores | null | undefined): RatingScores` — used by `rating-panel.tsx`; tests pin the behavior.

- [ ] **Step 1: Write the failing test**

Create `web/src/tests/ratings.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { buildScores } from "@/lib/ratings";

describe("buildScores", () => {
  it("sets only the chosen axis on a first rating, neutral default for the rest", () => {
    expect(buildScores("appropriateness", 4, null)).toEqual({
      appropriateness: 4,
      professionalism: 3,
      safety: 3,
    });
  });

  it("keeps existing values on the other axes when updating one", () => {
    expect(
      buildScores("safety", 2, { appropriateness: 5, professionalism: 1, safety: 4 }),
    ).toEqual({ appropriateness: 5, professionalism: 1, safety: 2 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```powershell
pnpm test
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `web/src/lib/ratings.ts`:
```ts
export type RatingAxis = "appropriateness" | "professionalism" | "safety";

export interface RatingScores {
  appropriateness: number;
  professionalism: number;
  safety: number;
}

export function buildScores(
  axis: RatingAxis,
  value: number,
  existing: RatingScores | null | undefined,
): RatingScores {
  return {
    appropriateness: axis === "appropriateness" ? value : (existing?.appropriateness ?? 3),
    professionalism: axis === "professionalism" ? value : (existing?.professionalism ?? 3),
    safety: axis === "safety" ? value : (existing?.safety ?? 3),
  };
}
```
(3 = neutral midpoint; a never-rated axis is no longer silently copied from the axis the user clicked.)

`web/src/components/rating-panel.tsx` — replace `select`:
```ts
  const select = (key: AxisKey, value: number) => {
    rate.mutate(buildScores(key, value, summary?.my));
  };
```
and import `buildScores` from `@/lib/ratings`.

- [ ] **Step 4: Run tests + typecheck + lint**

```powershell
pnpm test; pnpm typecheck; pnpm lint
```

- [ ] **Step 5: Commit**

```bash
git add web/ && git commit -m "fix: rate each axis independently; neutral default for unrated axes"
```

### Task 9: Report wizard — gate step tabs, guard submit

**Files:**
- Modify: `web/src/components/report-wizard.tsx:219` (silent no-op), `report-wizard.tsx:328-347` (step tabs), `report-wizard.tsx:202-216` (`canForward`)

**Interfaces:**
- Consumes: existing `media`, `pin`, `step` state.
- Produces: tabs for "Pin"/"Details" are disabled until their prerequisite is met; `submit()` surfaces an error instead of silently returning; dead `disabled={step === "done"}` removed.

- [ ] **Step 1: Implement the fix** (regression is UI-only; e2e already covers happy path)

`report-wizard.tsx` step tabs:
```tsx
      <ol className="mb-6 flex items-center gap-2" aria-label="Steps">
        {STEPS.map((s, i) => {
          const blocked =
            s.key === "pin" ? media.length === 0 : s.key === "details" ? pin === null : false;
          return (
            <li key={s.key} className="flex items-center gap-2">
              {i > 0 ? <span className="timecode text-fg/30">/</span> : null}
              <button
                type="button"
                onClick={() => setStep(s.key)}
                disabled={blocked}
                aria-current={step === s.key ? "step" : undefined}
                className={`timecode rounded-md border px-3 py-1.5 ${
                  step === s.key
                    ? "border-accent text-accent"
                    : blocked
                      ? "cursor-not-allowed border-line text-fg/30"
                      : "border-line text-muted hover:text-fg"
                }`}
              >
                {i + 1}. {s.label}
              </button>
            </li>
          );
        })}
      </ol>
```
(Removes the always-false `disabled={step === "done"}`.)

`submit()` — replace `if (!pin) return;` with:
```ts
    if (!pin) {
      setError("Place the pin on the map before submitting.");
      setStep("pin");
      return;
    }
    if (media.length === 0) {
      setError("Attach at least one photo or clip before submitting.");
      setStep("capture");
      return;
    }
```

- [ ] **Step 2: Verify**

```powershell
pnpm typecheck; pnpm test; pnpm lint
```

- [ ] **Step 3: Commit**

```bash
git add web/ && git commit -m "fix: gate wizard steps and surface errors instead of silent no-op"
```

### Task 10: Auth hydration flicker

**Files:**
- Modify: `web/src/components/sign-in-cta.tsx:7-9`
- Modify: `web/src/components/nav.tsx:27-32`
- Modify: `web/src/components/report-wizard.tsx:63`
- Modify: `web/src/app/(public)/profile/page.tsx` (top of the client component — read the file's auth reads first)
- Modify: `web/src/store/auth.ts:33` (`markHydrated` — no change needed, already correct)

**Interfaces:**
- Consumes: `useAuthStore((s) => s.hydrated)` — set by `onRehydrateStorage` (`store/auth.ts:40`).
- Produces: no signed-in UI flashes to signed-out on first paint.

- [ ] **Step 1: Implement**

`sign-in-cta.tsx`:
```tsx
export function SignInCta() {
  const hydrated = useAuthStore((s) => s.hydrated);
  const token = useAuthStore((s) => s.token);
  if (!hydrated) return null;
  // ...existing token branch...
}
```

`nav.tsx` — add `const hydrated = useAuthStore((s) => s.hydrated);`; in the sidebar footer:
```tsx
          {!hydrated ? null : token ? (
            // ...existing signed-in block...
          ) : (
            // ...existing sign-in link...
          )}
```

`report-wizard.tsx` — after `const token = useAuthStore((s) => s.token);` add:
```ts
  const hydrated = useAuthStore((s) => s.hydrated);
```
and change the early-return gate at `report-wizard.tsx:307` from `if (!token)` to `if (hydrated && !token)`.

`profile/page.tsx` — same pattern wherever it branches on `token` (verify by reading the file: gate the signed-in render on `hydrated && token`).

- [ ] **Step 2: Verify**

```powershell
pnpm typecheck; pnpm test; pnpm lint
```

- [ ] **Step 3: Commit**

```bash
git add web/ && git commit -m "fix: wait for auth store hydration before rendering auth UI"
```

### Task 11: Open redirect on sign-in

**Files:**
- Create: `web/src/lib/redirect.ts`
- Create: `web/src/tests/redirect.test.ts`
- Modify: `web/src/app/(public)/signin/page.tsx:13,31,67`

**Interfaces:**
- Produces: `safeNext(raw: string | null, fallback?: string): string` — only same-origin absolute-ish paths starting with `/` and not `//` or `/\`.

- [ ] **Step 1: Write the failing test**

Create `web/src/tests/redirect.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/redirect";

describe("safeNext", () => {
  it("keeps internal paths", () => {
    expect(safeNext("/report")).toBe("/report");
    expect(safeNext("/incident/abc?x=1")).toBe("/incident/abc?x=1");
  });
  it("rejects external and protocol-relative values", () => {
    expect(safeNext("https://evil.example")).toBe("/");
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("/\\evil.example")).toBe("/");
  });
  it("falls back when null", () => {
    expect(safeNext(null)).toBe("/");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```powershell
pnpm test
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `web/src/lib/redirect.ts`:
```ts
export function safeNext(raw: string | null | undefined, fallback = "/"): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  return raw;
}
```

`signin/page.tsx` — `const next = safeNext(params.get("next"));` (replacing line 13) and add the import. Lines 31 and 67 already use `next` — no other change needed.

- [ ] **Step 4: Verify + commit**

```powershell
pnpm test; pnpm typecheck; pnpm lint
```
```bash
git add web/ && git commit -m "fix: prevent open redirect via the sign-in next parameter"
```

### Task 12: Feed filters stay in sync with the URL

**Files:**
- Modify: `web/src/components/feed-filters.tsx:12-14`

**Interfaces:**
- Consumes: `useSearchParams` from `next/navigation`.
- Produces: inputs re-read URL params whenever the URL changes (back/forward), without clobbering in-progress typing (re-sync only when the URL params differ from current state).

- [ ] **Step 1: Implement**

```tsx
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export function FeedFiltersBar({ initialFilters }: { initialFilters: FeedFilters }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(initialFilters.q);
  const [type, setType] = useState(initialFilters.type ?? "");
  const [policeForce, setPoliceForce] = useState(initialFilters.policeForce ?? "");

  useEffect(() => {
    const urlQ = params.get("q") ?? "";
    const urlType = params.get("type") ?? "";
    const urlForce = params.get("policeForce") ?? "";
    setQ((prev) => (prev === urlQ ? prev : urlQ));
    setType((prev) => (prev === urlType ? prev : urlType));
    setPoliceForce((prev) => (prev === urlForce ? prev : urlForce));
  }, [params]);
```

- [ ] **Step 2: Verify + commit**

```powershell
pnpm typecheck; pnpm test; pnpm lint
```
```bash
git add web/ && git commit -m "fix: keep feed filter inputs synced with URL on back/forward"
```

### Task 13: Map — error banner overlap, my-location, filter persistence

**Files:**
- Modify: `web/src/components/map/map-view.tsx:293-395` (filter panel + error banner layout), `map-view.tsx:405-412` (banner), plus a geolocate control and URL state

**Interfaces:**
- Consumes: `maplibregl.Map#flyTo`, `router.replace`, `useSearchParams`.
- Produces: error banner stacked under the filter panel instead of covering it; a "My location" button (`LocateFixed` from lucide — already used in the wizard); type/force/days filters read from and written to the map URL.

- [ ] **Step 1: Fix the overlap — wrap panel + banner in one column**

Replace the absolute-positioned filter panel and error banner with:
```tsx
      <div className="absolute left-3 top-3 z-10 flex w-[min(20rem,calc(100vw-1.5rem))] flex-col gap-2">
        <div className="panel rounded-md p-3">
          {/* ...existing filter panel content, unchanged... */}
          <div className="mt-3 flex gap-2">
            <button type="button" className="btn flex-1" onClick={locateMe}>
              <LocateFixed className="size-4" aria-hidden />
              My location
            </button>
          </div>
        </div>
        {error ? (
          <div>
            <StatusBanner kind="error" message="Records unavailable" detail={error} />
            <button type="button" className="btn mt-2 w-full" onClick={() => void fetchVisible()}>
              Retry
            </button>
          </div>
        ) : null}
      </div>
```
(Remove the old separately-positioned banner block at lines 405-412.)

- [ ] **Step 2: Add `locateMe`**

```ts
  const locateMe = () => {
    const map = mapRef.current;
    if (!map || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        map.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: Math.max(map.getZoom(), 14) });
        void fetchVisible();
      },
      () => undefined,
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };
```
(Import `LocateFixed` from lucide-react.)

- [ ] **Step 3: Persist filters in the URL**

```ts
  const params = useSearchParams();
  // initialise state:
  const [filters, setFilters] = useState<Filters>(() => {
    const p = new URLSearchParams(params.toString());
    const days = Number(p.get("days") ?? "0") as Filters["days"];
    return {
      type: (p.get("type") as Filters["type"]) ?? "",
      policeForce: (p.get("policeForce") as Filters["policeForce"]) ?? "",
      days: [0, 7, 30, 90].includes(days) ? days : 0,
    };
  });
```
and a sync effect:
```ts
  useEffect(() => {
    const p = new URLSearchParams();
    if (filters.type) p.set("type", filters.type);
    if (filters.policeForce) p.set("policeForce", filters.policeForce);
    if (filters.days > 0) p.set("days", String(filters.days));
    const qs = p.toString();
    void router.replace(qs ? `/map?${qs}` : "/map", { scroll: false });
  }, [filters, router]);
```
(Note: keep `filtersRef` syncing so `fetchVisible` still uses the latest values.)

- [ ] **Step 4: Verify + commit**

```powershell
pnpm typecheck; pnpm test; pnpm lint
```
```bash
git add web/ && git commit -m "fix: stack map error banner below filters; add locate button and URL filter state"
```

### Task 14: CSP — allow map glyph origin

**Files:**
- Modify: `web/next.config.ts:28-40`

**Interfaces:**
- Consumes: `baseMapStyle` glyphs URL `https://protomaps.github.io/basemaps-assets/fonts/...` (`web/src/lib/map-tiles.ts:20`).
- Produces: production CSP includes the glyph origin in `connect-src` and `font-src` (fonts may load via font-src too).

- [ ] **Step 1: Implement**

In `securityHeaders()`, after the tile origin computation:
```ts
  const glyphOrigin = "https://protomaps.github.io";
```
and change the CSP lines:
```ts
    `font-src 'self' https://fonts.gstatic.com data: ${glyphOrigin}`,
    `connect-src 'self' ${apiOrigin} ${tileOrigin} ${glyphOrigin}`,
```
(Leave the `style-src` fonts.googleapis.com entry in place or remove it — `next/font` self-hosts, so removing it is also correct; keep it removed to tighten policy.)

- [ ] **Step 2: Verify + commit**

```powershell
pnpm typecheck; pnpm build
```
(Production build must succeed — the CSP is only injected there.)

```bash
git add web/ && git commit -m "fix: allow map glyph fetches under production CSP"
```

### Task 15: Stats period switcher

**Files:**
- Create: `web/src/components/period-switch.tsx`
- Modify: `web/src/app/(public)/stats/page.tsx:16-23`

**Interfaces:**
- Consumes: `StatsPeriod` from `@/lib/contract` (`"7d" | "30d" | "90d"`), `getStatsPublic(period, opts)` (`web/src/lib/api.ts:307-310`).
- Produces: `PeriodSwitch({ current, basePath }: { current: StatsPeriod; basePath: string })` — link-based tabs that set `?period=`.

- [ ] **Step 1: Implement**

Create `web/src/components/period-switch.tsx`:
```tsx
"use client";

import Link from "next/link";
import type { StatsPeriod } from "@/lib/contract";

const PERIODS: { label: string; value: StatsPeriod }[] = [
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
  { label: "90d", value: "90d" },
];

export function PeriodSwitch({ current, basePath }: { current: StatsPeriod; basePath: string }) {
  return (
    <div className="flex gap-1" role="group" aria-label="Stats period">
      {PERIODS.map((p) => (
        <Link
          key={p.value}
          href={`${basePath}?period=${p.value}`}
          aria-current={current === p.value ? "true" : undefined}
          className={`min-h-9 rounded-sm border px-3 text-xs font-semibold uppercase tracking-wide transition-colors ${
            current === p.value
              ? "border-accent bg-accent text-on-accent"
              : "border-line text-fg/80 hover:border-accent"
          }`}
        >
          {p.label}
        </Link>
      ))}
    </div>
  );
}
```

`stats/page.tsx` — read `searchParams`, validate against the contract:
```tsx
export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const raw = typeof sp.period === "string" ? sp.period : "30d";
  const period: StatsPeriod = raw === "7d" || raw === "90d" ? raw : "30d";
  // ...getStatsPublic(period, ...)
```
And render the switcher under the header:
```tsx
      <div className="mt-4">
        <PeriodSwitch current={period} basePath="/stats" />
      </div>
```
(Line chart label reads "Last 30 days" — make it dynamic: `Last ${period === "7d" ? "7" : period === "90d" ? "90" : "30"} days`.)

- [ ] **Step 2: Verify + commit**

```powershell
pnpm typecheck; pnpm test; pnpm lint
```
```bash
git add web/ && git commit -m "feat: add 7/30/90-day period switcher to stats"
```

---

## Phase D — Visual overhaul

### Task 16: Home page — hero, live clock, stats band, how-it-works

**Files:**
- Create: `web/src/components/live-clock.tsx` (client)
- Create: `web/src/components/stats-band.tsx` (server)
- Create: `web/src/components/how-it-works.tsx` (server)
- Modify: `web/src/app/(public)/page.tsx`

**Interfaces:**
- Consumes: `getStatsPublic(period, opts)` + `serverApiBaseUrl()` from `@/lib/api`; `StatsPublic` fields `total_incidents`, `total_views`, `avg_rating`, `by_force`; `formatForce`, `typeLabel`; `Timecode`-style classes from `globals.css`.
- Produces: a hero with a live UTC clock strip, a 4-stat band, and a 3-step "How the register works" section — all above the existing filter bar. Stats band self-hides when the API is down (never shows a dead panel).

- [ ] **Step 1: Create `live-clock.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"] as const;

export function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  if (!now) return <span className="timecode text-accent">UTC —:—:—</span>;
  return (
    <span className="timecode text-accent" aria-live="off">
      {pad(now.getUTCHours())}:{pad(now.getUTCMinutes())}:{pad(now.getUTCSeconds())} ·
      {pad(now.getUTCDate())} {MONTHS[now.getUTCMonth()] ?? "???"} · {now.getUTCFullYear()} · UTC
    </span>
  );
}
```

- [ ] **Step 2: Create `stats-band.tsx`**

```tsx
import type { StatsPublic } from "@/lib/contract";

export function StatsBand({ stats }: { stats: StatsPublic }) {
  const forces = stats.by_force.length;
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border hairline bg-line sm:grid-cols-4">
      <Stat k="Records on the register" v={String(stats.total_incidents)} />
      <Stat k="Public views" v={String(stats.total_views)} />
      <Stat k="Forces covered" v={String(forces)} />
      <Stat
        k="Average rating"
        v={stats.avg_rating === null ? "—" : `${stats.avg_rating.toFixed(1)} / 5`}
      />
    </dl>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="bg-surface/60 px-4 py-3">
      <dt className="timecode text-muted">{k}</dt>
      <dd className="mt-1 font-display text-2xl font-extrabold tracking-tight text-fg">{v}</dd>
    </div>
  );
}
```

- [ ] **Step 3: Create `how-it-works.tsx`**

```tsx
import { Camera, Check, MapPin } from "lucide-react";

const STEPS = [
  {
    Icon: Camera,
    title: "Record",
    body: "Photo or video from your camera or files. Everything is hashed and timestamped at capture, so the record is verifiable.",
  },
  {
    Icon: MapPin,
    title: "Pin it",
    body: "Drag the pin to the exact spot. GPS precision is recorded as the evidentiary floor; the pinned point is the stored location.",
  },
  {
    Icon: Check,
    title: "Publish",
    body: "Submit to the register under a pseudonymous witness account. Offline? It queues on your device and sends when you're back.",
  },
] as const;

export function HowItWorks() {
  return (
    <section aria-labelledby="how-it-works" className="mt-10">
      <h2 id="how-it-works" className="label">
        How the register works
      </h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {STEPS.map(({ Icon, title, body }, i) => (
          <div key={title} className="rounded-md border hairline bg-surface/60 p-4">
            <div className="flex items-center gap-2">
              <Icon className="size-5 text-accent" aria-hidden />
              <span className="timecode text-accent">{String(i + 1).padStart(2, "0")}</span>
            </div>
            <h3 className="font-display mt-2 text-lg font-extrabold tracking-tight">{title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-fg/80">{body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Rewire the home page**

`web/src/app/(public)/page.tsx` — after the existing data fetch (keep it; add stats fetch in the same try/catch or a second one):
```tsx
  let stats: Awaited<ReturnType<typeof getStatsPublic>> | null = null;
  try {
    stats = await getStatsPublic("30d", { baseUrl: serverApiBaseUrl() });
  } catch {
    stats = null;
  }
```
Replace the `<header>` block (lines 54-65) with:
```tsx
      <header className="mb-8">
        <p className="timecode flex flex-wrap items-center justify-between gap-2 border-y hairline py-2 text-muted">
          <span>THE PUBLIC REGISTER · WITNESSGRID</span>
          <LiveClock />
        </p>
        <h1 className="font-display mt-6 max-w-3xl text-4xl font-extrabold tracking-tight sm:text-5xl">
          Every police interaction,{" "}
          <span className="text-accent">recorded by witnesses.</span>
        </h1>
        <p className="mt-3 max-w-2xl text-lg leading-relaxed text-fg/80">
          WitnessGrid is a public, pseudonymous evidence register of interactions
          between the public and UK police — timestamped, geolocated, media-backed,
          and verified against a moderation queue. Anyone can browse; witnesses
          record.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <SignInCta />
          <Link href="/map" className="btn">
            <Map className="size-5" aria-hidden />
            Browse the map
          </Link>
        </div>
      </header>

      {stats ? (
        <div className="mb-8">
          <StatsBand stats={stats} />
        </div>
      ) : null}
```
(Add `Link` from `next/link`, `Map` from `lucide-react`, and the three new imports.)

After the `<Tartan thin />` + filters, add the how-it-works section **below** the feed (after the disclaimer paragraph) so the register stays primary:
```tsx
      <HowItWorks />
```
Keep the existing disclaimer `<p>` at the bottom of the main, before `HowItWorks`.

- [ ] **Step 5: Verify + commit**

```powershell
pnpm typecheck; pnpm test; pnpm lint
```
Manually: home page shows the timecode strip with ticking UTC clock, stats band with live numbers (30 records, views, 48 forces, rating), hero CTAs, and the 3-step section below the feed. With the backend stopped, the page must still render (stats band hidden, error banner as before).

```bash
git add web/ && git commit -m "feat: redesign home with live-clock hero, stats band and how-it-works"
```

### Task 17: Map — themed basemap + token-driven colors

**Files:**
- Modify: `web/src/lib/map-tiles.ts`
- Create: `web/src/lib/css-var.ts`
- Modify: `web/src/components/map/map-view.tsx:131-175` (layer paint values)
- Modify: `web/src/components/map/pin.ts` and `web/src/components/map/mini-map.tsx` / `pin-map.tsx` (any hardcoded hex — audit with grep for `#E8A33D`/`#12151C`)
- Modify: `web/next.config.ts` (default tile origin for CSP)

**Interfaces:**
- Consumes: design tokens `--bg`, `--accent` from `globals.css`; `prefers-color-scheme` media query.
- Produces: `cssVar(name, fallback): string` helper; dark-mode map style by default, light style in light mode; no new hardcoded hex in map layers.

- [ ] **Step 1: Create the `cssVar` helper**

`web/src/lib/css-var.ts`:
```ts
export function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return (
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
  );
}
```

- [ ] **Step 2: Theme-aware basemap**

`web/src/lib/map-tiles.ts` — replace the default tile URL logic:
```ts
export const TILE_URL =
  process.env.NEXT_PUBLIC_MAP_TILES_URL ||
  "https://basemaps.cartocdn.com/{s}/dark_all/{z}/{x}/{y}.png";

const LIGHT_TILE_URL = "https://basemaps.cartocdn.com/{s}/light_all/{z}/{x}/{y}.png";

export function baseMapStyle(prefersDark = true): StyleSpecification {
  const url = prefersDark ? TILE_URL : LIGHT_TILE_URL;
  return {
    version: 8,
    glyphs: "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf",
    sources: {
      basemap: {
        type: "raster",
        tiles: [url],
        tileSize: 256,
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
      },
    },
    layers: [{ id: "basemap", type: "raster", source: "basemap" }],
  };
}
```
(`{s}` subdomains: MapLibre raster sources support `{s}` — if the subdomain placeholder causes issues, hardcode `a.` and `b.` in the two URLs above.)

`map-view.tsx`:
```ts
      style: baseMapStyle(window.matchMedia?.("(prefers-color-scheme: light)").matches === true ? false : true),
```
(Guard for SSR: the component is client-only — `window` is safe here; wrap in try/catch if worried about test environments.)

- [ ] **Step 3: Token-driven layer colours**

`map-view.tsx` — before the `useEffect` that builds the map:
```ts
  const accent = cssVar("--accent", "#E8A33D");
  const bg = cssVar("--bg", "#12151C");
```
and replace every hardcoded hex in the layer paints (lines 131-175): `#E8A33D` → `${accent}`, `#12151C` → `${bg}` (template literals in the style object). Same treatment for `web/src/components/map/pin.ts` (data-URI) — pin.ts is a static module, so move the colour into a function `pinIcon(color: string)` called from the components that render pins, passing `cssVar("--accent", "#E8A33D")`.

- [ ] **Step 4: CSP default origin**

`web/next.config.ts` — update the tile-origin fallback and the glyph origin block:
```ts
  const tileOrigin = originOf(
    process.env.NEXT_PUBLIC_MAP_TILES_URL,
    "https://basemaps.cartocdn.com",
  );
```
(Keep the glyph origin from Task 14.)

- [ ] **Step 5: Verify + commit**

```powershell
pnpm typecheck; pnpm test; pnpm lint
```
Manually: `/map` shows a dark basemap that matches the theme (light basemap in light OS mode), amber pins/clusters, readable cluster count labels.

```bash
git add web/ && git commit -m "feat: theme-matched basemap and token-driven map colours"
```

### Task 18: Per-route loading skeletons + rich empty/error states

**Files:**
- Create: `web/src/app/(public)/map/loading.tsx`, `web/src/app/(public)/report/loading.tsx`, `web/src/app/(public)/signin/loading.tsx`
- Modify: `web/src/components/load-more.tsx:46-70` (empty state)
- Modify: `web/src/app/(public)/page.tsx:71-75` (error state composition)

**Interfaces:**
- Consumes: existing skeleton classes (`animate-pulse ... bg-surface`), `StatusBanner`.
- Produces: route-appropriate skeletons instead of feed-row ghosts on map/report/signin; an on-brand empty state ("No records yet — be the first witness.") and a composed error panel on the home page.

- [ ] **Step 1: Create the per-route skeletons**

`web/src/app/(public)/map/loading.tsx`:
```tsx
export default function MapLoading() {
  return (
    <div className="relative h-[calc(100dvh-7rem)] lg:h-[calc(100dvh-4rem)]">
      <div className="absolute left-3 top-3 h-72 w-[min(20rem,calc(100vw-1.5rem))] animate-pulse rounded-md border hairline bg-surface" />
      <div className="absolute inset-x-3 bottom-3 mx-auto h-24 w-full max-w-xl animate-pulse rounded-md border hairline bg-surface" />
    </div>
  );
}
```
`web/src/app/(public)/report/loading.tsx`:
```tsx
export default function ReportLoading() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="h-10 w-2/3 animate-pulse rounded-md bg-surface" />
      <div className="mt-8 aspect-video w-full animate-pulse rounded-md border hairline bg-surface" />
      <div className="mt-8 h-11 w-full animate-pulse rounded-md border hairline bg-surface" />
    </main>
  );
}
```
`web/src/app/(public)/signin/loading.tsx`:
```tsx
export default function SignInLoading() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center px-4 py-12">
      <div className="size-10 animate-pulse rounded-md bg-surface" />
      <div className="mt-4 h-8 w-1/2 animate-pulse rounded-md bg-surface" />
      <div className="mt-8 h-11 w-full animate-pulse rounded-md border hairline bg-surface" />
      <div className="mt-4 h-11 w-full animate-pulse rounded-md border hairline bg-surface" />
    </main>
  );
}
```
(Route-group `loading.tsx` still serves the feed and other routes.)

- [ ] **Step 2: Rich empty state in `load-more.tsx`**

Inside the `section`, when `items.length === 0 && !isError && !ssrFailed`:
```tsx
      {items.length === 0 && !isError && !ssrFailed ? (
        <div className="rounded-md border hairline bg-surface/40 px-6 py-12 text-center">
          <p className="font-display text-xl font-extrabold tracking-tight">
            No records on the register yet.
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm text-fg/80">
            The register starts with its first witness. Have you seen something
            worth recording? Capture it safely and add it to the register.
          </p>
          <Link href="/report" className="btn btn-primary mt-5">
            <Camera className="size-5" aria-hidden />
            Record an encounter
          </Link>
        </div>
      ) : null}
```
(Import `Link` from `next/link` and `Camera` from `lucide-react`; show this only for the **unfiltered** feed — when `filters.q || filters.type || filters.policeForce` is set, keep the current terse "no matches" behaviour: `No records match these filters.`)

- [ ] **Step 3: Composed error panel on home**

`web/src/app/(public)/page.tsx:71-75` — replace the bare banner with:
```tsx
      {error ? (
        <div className="py-8">
          <StatusBanner kind="error" message={error} detail={detail ?? undefined} />
          <p className="mt-3 text-sm text-muted">
            The register needs its API service running. If you are viewing a live
            deployment this is a temporary outage — the records themselves are
            unchanged.
          </p>
        </div>
      ) : null}
```

- [ ] **Step 4: Verify + commit**

```powershell
pnpm typecheck; pnpm test; pnpm lint
```
```bash
git add web/ && git commit -m "feat: route-specific skeletons and on-brand empty/error states"
```

### Task 19: OG image for static pages

**Files:**
- Create: `web/src/app/opengraph-image.tsx`

**Interfaces:**
- Consumes: `ImageResponse` from `next/og` (already used by `web/src/app/assets/og/[id]/route.tsx` — mirror its font setup and palette).
- Produces: layout-level `/opengraph-image` (1200×630) referenced automatically by Next metadata for all static pages.

- [ ] **Step 1: Create the image route**

`web/src/app/opengraph-image.tsx`:
```tsx
import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "WitnessGrid — the public register of UK police interactions";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#12151C",
          color: "#E8E6DE",
          padding: 64,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 6,
              background: "#E8A33D",
              color: "#12151C",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: 32,
            }}
          >
            W
          </div>
          <div style={{ fontSize: 28, letterSpacing: 2, fontWeight: 700 }}>WITNESSGRID</div>
        </div>
        <div>
          <div style={{ fontSize: 64, fontWeight: 800, lineHeight: 1.1, maxWidth: 900 }}>
            The public register of police interactions.
          </div>
          <div style={{ marginTop: 24, fontSize: 28, color: "#A6A89F" }}>
            Timestamped · geolocated · media-backed records by witnesses.
          </div>
        </div>
        <div
          style={{
            height: 8,
            background: "repeating-conic-gradient(#E8A33D 0% 25%, #12151C 0% 50%)",
            backgroundSize: "16px 16px",
          }}
        />
      </div>
    ),
    size,
  );
}
```
(If the build complains about the `size` export shape, copy the exact export shape from `assets/og/[id]/route.tsx`.)

- [ ] **Step 2: Verify + commit**

```powershell
pnpm typecheck; pnpm build
```
Manually: `curl -I http://localhost:3000/opengraph-image` (after `next start`) returns `image/png`; sharing `/` shows the card.

```bash
git add web/ && git commit -m "feat: default OG share image for static pages"
```

### Task 20: Contact method + operator statement

**Files:**
- Create: `web/src/app/(public)/contact/page.tsx`
- Modify: `web/src/components/footer.tsx` (add Contact link)
- Modify: `web/src/app/(public)/about/page.tsx` (operator statement)
- Modify: `web/src/app/(public)/privacy/page.tsx:62` (point at the contact page)

**Interfaces:**
- Consumes: `footer` nav list pattern (`footer.tsx`), the `.timecode`/`.panel` classes.
- Produces: `/contact` page with the agreed contact email (default `contact@witnessgrid.app` — confirm with the project owner before publishing; keep the default if no answer), footer link, and privacy notice pointing there. **Decision point:** the contact address must be the user's real inbox.

- [ ] **Step 1: Create the contact page**

`web/src/app/(public)/contact/page.tsx`:
```tsx
import type { Metadata } from "next";
import { Tartan } from "@/components/tartan";

export const metadata: Metadata = {
  title: "Contact",
  description: "How to reach the people behind WitnessGrid.",
};

export default function ContactPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="font-display text-3xl font-extrabold tracking-tight">Contact.</h1>
      <p className="mt-2 text-fg/80">
        Questions about a record, a correction, or the register itself — email us.
      </p>
      <Tartan thin />
      <div className="mt-6 rounded-md border hairline bg-surface/60 p-5">
        <p className="label">Email</p>
        <a className="timecode text-accent underline-offset-4 hover:underline" href="mailto:contact@witnessgrid.app">
          contact@witnessgrid.app
        </a>
        <p className="mt-3 text-sm text-muted">
          Reports of harmful or unlawful content are also handled here. We aim to
          reply within one month, as required by UK data-protection law.
        </p>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Wire into footer + privacy**

`footer.tsx` — add `{ href: "/contact", label: "Contact" }` to the policies nav array (read the file first; it iterates a literal list).

`privacy/page.tsx` — replace the bare "contact us" wording with a link: `Contact us at <a href="/contact">/contact</a> and we will respond within one month.`

`about/page.tsx` — add a short operator paragraph, e.g. after the mission block:
> "WitnessGrid is run by a small, unpaid team of volunteers. We publish our code under the MIT licence, keep no advertising and no trackers, and answer to our witnesses first."

- [ ] **Step 3: Verify + commit**

```powershell
pnpm typecheck; pnpm lint
```
```bash
git add web/ && git commit -m "feat: contact page, footer link, operator statement"
```

### Task 21: About page FAQ

**Files:**
- Modify: `web/src/app/(public)/about/page.tsx`

**Interfaces:**
- Consumes: native `<details>/<summary>` (no JS, a11y-friendly), `.timecode` classes.
- Produces: a 5-question FAQ section at the bottom of `/about`.

- [ ] **Step 1: Implement**

Append to `about/page.tsx`:
```tsx
      <section aria-labelledby="faq" className="mt-12">
        <h2 id="faq" className="label">Questions witnesses ask</h2>
        <div className="mt-4 space-y-2">
          {FAQ.map(({ q, a }) => (
            <details key={q} className="group rounded-md border hairline bg-surface/40 px-4 py-3">
              <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 font-semibold">
                {q}
                <span aria-hidden className="timecode text-accent transition-transform group-open:rotate-90">
                  ▸
                </span>
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-fg/80">{a}</p>
            </details>
          ))}
        </div>
      </section>
```
With, near the top of the file:
```tsx
const FAQ = [
  {
    q: "What counts as an encounter?",
    a: "Any interaction between the public and UK police that a witness can record safely — stop and search, vehicle stops, arrests, use of force, questioning, or anything else worth keeping on the record.",
  },
  {
    q: "Is my report anonymous?",
    a: "Reports are pseudonymous. You sign in with an email and pick a username; neither your email nor your real name is ever shown. Only the username appears on records.",
  },
  {
    q: "Can I delete my report?",
    a: "Yes. From your profile, open the record and choose to withdraw it. It is removed from the register and its media is deleted immediately.",
  },
  {
    q: "Are these records verified?",
    a: "No. Every record is the witness's own account, and the register says so on every page. Timestamps, coordinates and hashes are captured at record time and can be checked, but the content is not independently verified.",
  },
  {
    q: "What happens if the police object to a record?",
    a: "Objections come through our report system and are reviewed by the team. Unlawful or harmful content is removed. Everything else stays — the register is public evidence, not a complaint channel.",
  },
];
```

- [ ] **Step 2: Verify + commit**

```powershell
pnpm typecheck; pnpm lint
```
```bash
git add web/ && git commit -m "feat: add FAQ section to the about page"
```

---

## Phase E — Hygiene, docs, CI

### Task 22: Repo hygiene, README fixes, git init

**Files:**
- Delete: `smoke.html`, `rename-tokens.ps1` (repo root)
- Modify: `README.md` (env paths, phase status, Postgres setup note)
- Run: `git init` + initial commit

**Interfaces:**
- Produces: a clean tree, an accurate README, and a git history baseline. **User decision:** initialising the repo and making the first commit is requested by the user's goal ("works locally before I publish it live") — the workspace has no `.git`.

- [ ] **Step 1: Remove stray artifacts**

```powershell
Remove-Item smoke.html, rename-tokens.ps1
```

- [ ] **Step 2: Fix the README**

- Section "Getting started" (`README.md:32-57`): replace the "PostgreSQL is not yet installed on this host" note with the actual state: Postgres 18 + PostGIS 3.6.2 local, database `witnessgrid` exists; env file paths are `backend/.env` (copy `backend/.env.example`, generate `JWT_SECRET` with `openssl rand -hex 32` or `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) and `web/.env.local` (copy `web/.env.example`).
- Fix `README.md:43-44`: the env templates live at `backend/.env.example` and `web/.env.example` — there is no `infra/env/`.
- Roadmap (`README.md:61-63`): mark Phase 1 complete and Phase 1.1 (ratings, stats, saved-area alerts) implemented; moderation queue, comments, clustering remain.
- Add a short "Current status" line: fully functional locally (web + API + PostGIS + seed data).

- [ ] **Step 3: Initialise git and commit**

```powershell
git init
git add -A
git status
```
Review the staged list — confirm no secrets (`.env` files must be gitignored — verify `.gitignore` covers `backend/.env`, `web/.env.local`, `backend/.dev-mail.log`, `.media/`; if not, extend it **before** committing).
```bash
git commit -m "chore: baseline after local bring-up, bug fixes and visual overhaul"
```

- [ ] **Step 4: Verify**

```powershell
pnpm -r typecheck; pnpm -r test
```

### Task 23: CI — lints, DB-backed integration tests, e2e gating

**Files:**
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: existing workflow structure (install → typecheck → test → backend lint).
- Produces: CI runs `contract` + `web` lint too; a `postgres` service container runs the backend integration suite with `RUN_DB_TESTS=1`; e2e stays gated on `RUN_E2E` (documented, not enabled — needs a full local stack).

- [ ] **Step 1: Update the workflow**

Add to the test job (read `ci.yml` first; adapt to its actual job names):
```yaml
    services:
      postgres:
        image: postgis/postgis:16-3.4
        env:
          POSTGRES_DB: witnessgrid
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U postgres"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
```
and for the backend test step:
```yaml
      - name: Backend tests (with database)
        working-directory: backend
        env:
          RUN_DB_TESTS: "1"
          DATABASE_URL: postgres://postgres:postgres@localhost:5432/witnessgrid
          JWT_SECRET: 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
          PUBLIC_ORIGIN: http://localhost:3000
        run: pnpm test
```
Add lint steps for `packages/contract` and `web`:
```yaml
      - name: Lint contract and web
        run: pnpm --filter @witnessgrid/contract lint && pnpm --filter @witnessgrid/web lint
```
(If `contract` has no lint script, add one mirroring `backend`'s eslint setup — check `packages/contract/package.json` first; if it has no eslint config, skip contract lint and lint web only.)

Add a comment next to the disabled deploy job (`ci.yml:41-48`) explaining it activates when Cloudflare credentials exist.

- [ ] **Step 2: Verify locally the commands CI will run**

```powershell
pnpm --filter @witnessgrid/web lint
pnpm -r typecheck
$env:RUN_DB_TESTS="1"; pnpm --filter @witnessgrid/backend test
```

- [ ] **Step 3: Commit**

```bash
git add .github/ && git commit -m "ci: lint web+contract, run DB-backed integration tests with PostGIS service"
```

### Task 24: Final end-to-end verification

**Files:** none (verification only)

**Interfaces:** — (final acceptance gate before this plan is considered complete)

- [ ] **Step 1: Fresh-stack run**

Stop any running processes. Then:
```powershell
pnpm dev
```
- [ ] **Step 2: Verify the read path**

- `http://localhost:3000/` — hero with ticking UTC clock, stats band (30 records / views / 48 forces / rating), tartan divider, filters, 25 rows with thumbnails + timecodes, "Load more records" works, disclaimer, how-it-works section, footer with Contact link.
- `http://localhost:3000/map` — themed basemap, amber clusters with counts, clicking a cluster zooms, clicking a point opens the incident, "My location" flies to GPS, filters persist across reload via URL.
- `http://localhost:3000/incident/<id>` — timecode band shows `±Xm` when the seed has accuracy (check a seed row; if all null, create one via the wizard and confirm), ratings panel lets a second account rate each axis independently, record facts table, report/withdraw actions.
- `http://localhost:3000/stats?period=7d` and `?period=90d` — switcher works.
- `http://localhost:3000/about`, `/contact`, `/terms`, `/privacy`, `/content-policy`, `/signin`, `/profile` — all render, no console errors; `/contact` shows the agreed address.
- `curl -I http://localhost:3000/opengraph-image` → `image/png`.

- [ ] **Step 3: Verify the write path (magic-link account + report)**

1. `/signin` → send link → paste token from `backend/.dev-mail.log` → signed in.
2. `/report` → upload a test image → Continue → pin on map (GPS or manual) → Details → submit → confirm "Report in the register".
3. The new record appears at the top of the feed and on the map at the pinned point, with `±Xm` in the timecode if GPS was used.
4. `/profile` → record listed, "Your stats" populated; withdraw the record → gone from feed, media gone (`.media/` dir cleaned).

- [ ] **Step 4: Verify resilience**

Stop the backend. Home shows the composed error panel (no dead stats band). Restart backend; Retry recovers. Then verify production CSP doesn't break the map: `pnpm build && pnpm start`, load `/map` with cluster labels visible (this catches the Task 14 fix).

- [ ] **Step 5: Full check-suite**

```powershell
pnpm -r typecheck
pnpm -r test
pnpm --filter @witnessgrid/web lint
pnpm --filter @witnessgrid/backend lint
```

- [ ] **Step 6: Commit any remaining fixes and report**

```bash
git add -A && git commit -m "chore: final verification fixes"
```

---

## Self-Review

**Spec coverage:** Reviewed against the review findings. Every numbered bug from the audit maps to a task: #1 accuracy round-trip → Task 2; #2/#4 flags+ratings → Task 3; #9 rate-limit/body-limit → Task 4; #8 media hardening → Task 5; #16 JWT + #19 auth-error masking → Task 6; #12 token pruning → Task 7; #3 rating axes → Task 8; #6 wizard gating → Task 9; #7 hydration flicker → Task 10; #5 open redirect → Task 11; #8 filter sync → Task 12; #6 map banner overlap + gaps → Task 13; #2 CSP glyphs → Task 14; stats period → Task 15; visual complaint → Tasks 16-18; #12 OG → Task 19; #11 contact → Task 20; FAQ → Task 21; #13 hygiene/README → Task 22; #10 CI → Task 23. The home-page complaint ("empty + error banner") is addressed end-to-end by Task 1 (data actually renders) plus Tasks 16-18 (page has substance even when the API is down).

**Placeholder scan:** No TBDs; every task carries concrete code and a verification command. Task 24 is deliberately a checklist, not a placeholder.

**Type consistency:** `location_accuracy_m` optional number flows DB → `IncidentBaseRow` → `serializeIncident` → contract → incident page (which already consumes it). `cssVar(name, fallback)` is defined in Task 17 and used only there. `buildScores(axis, value, existing)` defined and consumed in Task 8. `safeNext(raw, fallback)` defined and consumed in Task 11. `PeriodSwitch({ current, basePath })` consumed in Task 15. `baseMapStyle(prefersDark)` signature change is consumed in Task 17 step 3 and CSP change in step 4. `getUploadGrant(key)` consumed in Task 5.
