# WitnessGrid Phase 2 Design

**Status:** Approved (2026-08-05)
**Scope:** Ratings, search, stats, saved-area alerts, account deletion — on top of the completed Phase 1 PWA + Hono API + Postgres/PostGIS stack.
**Follow-ups:** Phase 3 (moderation/admin/audit/comments/clustering) and Phase 4 (Flutter apps, Stripe Supporter, notifications, dataset export) remain roadmap items with their own plan documents to come.

## 1. Goals

1. Raters: signed-in users can score any approved incident (except their own) on three axes; scores are replaceable; only aggregates are ever shown.
2. Search: full-text search over incident description + type + police force from the feed page, composing with the existing list filters and pagination.
3. Stats: public aggregate page (totals, by-type, by-force, 30-day series) and a personal stats view, both server-computed, palette-styled SVG charts, SSR for crawlers.
4. Saved areas + alerts: signed-in users draw polygons on the map, save them with a name and an optional email alert; new incidents inside a polygon produce in-app alerts and optionally an email. No push notifications (Phase 4).
5. Account deletion: full GDPR-style erasure of the account and personal data; submitted incidents remain in the public record with attribution removed, per the upload waiver added to the terms.

## 2. Policy decisions (from review)

- Ratings are aggregate-only. No per-user rating list is ever rendered; the signed-in user sees their own taps; everyone else sees per-axis averages + count. Own incidents cannot be rated (403).
- Upload waiver: submitting media waives deletion of that public-record footage. Per-incident withdrawal (`DELETE /incident/:id`) still works while the account exists. Account deletion erases the account and all personal data, but incidents + media objects remain, anonymized (`user_id` → NULL, UI shows "anonymous witness").
- Moderation stays strictly Phase 3: `POST /report` continues to queue flags with no public effect in Phase 2.
- Search is feed-only (the map keeps its filter panel, no search box there). Search results keep created_at ordering (cursor-compatible) rather than relevance ranking.
- Alerts have no read/unread state in Phase 2 — a plain newest-first feed.
- Feed filters are URL-driven (shareable, back-button friendly).
- All read paths (list, detail, search, stats) exclude anything not `moderation_status='approved'`.

## 3. Data model (migration `0002_phase2.sql`)

- `ALTER TABLE incidents ALTER COLUMN user_id DROP NOT NULL;` + FK change to `ON DELETE SET NULL` (existing `REFERENCES users(id) ON DELETE CASCADE` is replaced). Existing rows unaffected; de-identified incidents have `user_id = NULL`.
- `ratings`: `ALTER TABLE ratings ADD CONSTRAINT ratings_incident_user_key UNIQUE (incident_id, user_id);` (table + axis CHECKs already exist from 0001).
- `saved_areas`: `ADD COLUMN name text NOT NULL`, `ADD COLUMN alert_emails boolean NOT NULL DEFAULT false` (bounds geography(Polygon) already exists).
- New table `area_alerts (id uuid PK, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, saved_area_id uuid NOT NULL REFERENCES saved_areas(id) ON DELETE CASCADE, incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (user_id, incident_id))` — one alert per user per incident even when polygons overlap.
- Search: expression index only (no stored/generated column, which broke on PG18 in 0001):
  `CREATE INDEX incidents_search_idx ON incidents USING gin (to_tsvector('english', description || ' ' || type::text || ' ' || police_force::text));`
  Query uses the identical expression with `websearch_to_tsquery('english', $q)` so the index applies.

## 4. Contract (`packages/contract`)

- `ListIncidentsQuerySchema` gains `q: z.string().min(2).max(100).optional()`.
- `IncidentSchema.username: z.string().nullable()` (de-identified incidents).
- New `RatingCreateSchema { incident_id: uuid, appropriateness: 1-5 int, professionalism: 1-5 int, safety: 1-5 int }`.
- New `RatingSummarySchema { appropriateness_avg, professionalism_avg, safety_avg: number nullable, count: int, my_rating: RatingCreate minus incident_id nullable }`; `GET /incident/:id` response gains optional `rating_summary` (only when count > 0).
- New `SavedAreaCreateSchema { name: string 1-40, polygon: array of [lon,lat] 3-32 pairs, alert_emails: boolean }`; `SavedAreaSchema` adds id + created_at; `SavedAreaUpdateSchema { name?, alert_emails? }`.
- New `AlertSchema { id, incident_id, saved_area_id, area_name, created_at, incident: Incident }` (nested incident so the list page links directly).
- New `StatsPublicSchema { total_incidents, total_views, by_type: [{type,count}], by_force: [{force,count}] (top-10 + other bucket), series_30d: [{day,count}] }`.
- New `StatsMeSchema { submissions, total_views, ratings_received_avg: {appropriateness, professionalism, safety} nullable, ratings_received_count, recent_submissions: Incident[] (5) }`.

## 5. Backend

### Endpoints

- `POST /rating` — auth, rate-limited. Validates schema; incident must exist and be `approved` (else 404); `incident.user_id === userId` → 403 FORBIDDEN. Upsert (`ON CONFLICT (incident_id, user_id) DO UPDATE`). Returns `{ ok: true }`.
- `GET /incidents` — gains `q`; when present adds `to_tsvector('english', description || ' ' || type::text || ' ' || police_force::text) @@ websearch_to_tsquery('english', $q)`. Composes with bbox/date/type/force/cursor/limit. Ordering unchanged (created_at, id). Empty `q` is omitted by the web client (never sent); a sent `q` shorter than 2 chars → 400.
- `POST /saved-areas` — auth. Validation: 3–32 vertices, ring closed implicitly (ST_MakePolygon closes), `ST_IsValid`, bounding box of polygon area ≤ 10,000 km², ≤ 10 areas per user (409 on cap). Inserts row (geography Polygon, 4326).
- `GET /saved-areas` — auth; list with names/toggles/polygons (WKT→lon/lat arrays), newest first.
- `PATCH /saved-areas/:id` — auth + owner; partial update (name, alert_emails). 404 otherwise.
- `DELETE /saved-areas/:id` — auth + owner; cascades alerts. 404 otherwise.
- `GET /alerts` — auth; latest 50 `area_alerts` joined to incident + area name, newest first.
- `GET /stats` — public; one query per block (totals via COUNT/SUM, by_type GROUP BY, by_force GROUP BY ordered DESC with LIMIT 10 + rest aggregated as 'other', series via generate_series over last 30 days LEFT JOIN). All scoped to `approved`.
- `GET /stats/me` — auth; counts + aggregates scoped to the user's incidents.
- `DELETE /auth/me` — auth. Deletes the user row; FK cascades remove ratings, saved areas, alerts, magic-link tokens, report flags. Incidents keep rows; `user_id` becomes NULL via `ON DELETE SET NULL`; media rows and objects untouched. Returns `{ ok: true }`. JWT becomes inert (no user match on next call).

### Alert + email hook

`createIncident` (after insert, same request): select saved areas where `ST_Intersects(bounds, ST_MakePoint(lon, lat)::geography)` and owner exists; for each: insert `area_alerts` (deduped by `UNIQUE(user_id, incident_id)` — a second matching area for the same user is skipped); if `alert_emails` → enqueue/emit email via the existing email adapter (dev: console/log mail with a `[area-alert]` marker; prod: Resend) with area name, incident type/force, and `${PUBLIC_ORIGIN}/incident/<id>` link. Alert emails are per (user, incident) regardless of polygon overlap.

### Rate limiting

The existing Postgres-backed rate limiter is applied to `POST /rating`, `POST /saved-areas`, `PATCH/DELETE /saved-areas/:id`, `DELETE /auth/me` (per-user fixed window), consistent with other mutating endpoints.

## 6. Web

### Feed (`/`)
- Server-rendered as today; gains a search input + filter controls (type, force, date range) reading/writing URL search params (client-side React Query refetch on change; SSR honors initial params).
- No-results empty state ("No records match — try fewer filters").

### Incident detail
- Rating block below the narrative when signed in and not the owner: three labeled axes (Appropriateness, Professionalism, Safety), each a 1–5 tap row; tapping posts `POST /rating` (React Query mutation, optimistic update) — replaceable. Averages + count render from `rating_summary`; own taps highlighted. Own incident → no panel. Guests see averages only.
- De-identified incidents show "anonymous witness" instead of the username.

### Stats (`/stats` public, `/stats/me` in profile)
- SSR page fetching `GET /stats`; hand-rolled SVG palette charts (bars for by_type/by_force, line/area for 30-day series) using the existing design tokens; `aria-label`s + data table fallback for screen readers. `/stats/me` rendered in the profile tab (client fetch, auth).

### Map + saved areas
- Polygon draw mode on `/map`: click to add vertices (visual feedback), close button completes; cancel discards. Hand-rolled (no draw library).
- Save dialog: name (required), email-alert toggle; POST /saved-areas. Errors inline (validation/cap).
- Profile: "Saved areas" section listing polygons (name, toggle, delete, rename via PATCH) and "Alerts" section listing recent area_alerts linking to incidents.

### Profile / account deletion
- Delete-account flow: button → modal explaining consequences (account + personal data erased; your incidents and footage remain as public record with attribution removed, per the upload waiver) → type-to-confirm ("delete my account") → DELETE /auth/me → session cleared, redirect to `/`.

### Terms + report flow
- `/terms` gains the waiver clause: submitting media grants WitnessGrid a perpetual, irrevocable right to retain and display it as part of the public record; uploading waives deletion of that footage; per-incident withdrawal remains available while the account exists.
- Report submit step shows a one-line notice referencing the waiver next to the existing confirmation checkbox.

### Navigation
- Bottom nav "Stats" routes to `/stats`.

## 7. Testing

### Contract unit
- New schemas: valid/invalid rating, saved-area polygon (too few vertices, too many, bad coords), alert/stats shapes, `q` min-length, nullable username.

### Backend integration (live Postgres, `RUN_DB_TESTS=1`)
- Rating: create → 200 + appears in summary; replace → upsert (count stays 1); own incident → 403; missing/removed incident → 404; guest → 401; unapproved incident not rateable.
- Search: `q` matches description/type/force; no match returns empty; composes with type filter + cursor pagination; too-short `q` → 400.
- Saved areas: create/validate (bad polygon → 400; cap → 409), list, patch, delete (alerts cascade).
- Alerts: new incident inside polygon → alert row + email log line; outside → none; overlapping areas → single alert per user; `alert_emails=false` → no email.
- Stats: shape + counts consistent with seeded data; only approved counted.
- Account deletion: account + ratings/areas/alerts gone; incidents remain with `user_id` NULL; media rows intact; incident readable via API with null username; old JWT → 401.
- Migration: `0002` applies cleanly over an existing Phase 1 database.

### Web
- Unit: URL-param filter parsing, SVG chart helpers, saved-area polygon reducer.
- E2E: search from feed (find seeded incident), rate an incident (tap → averages update), draw+save an area then verify an alert appears after a new incident is filed inside it, delete account (verify redirect + incident page shows anonymous witness). Existing suite must stay green.

## 8. Verification & delivery

- Task 0: re-verify Phase 1 §14 exit criteria; file any follow-ups.
- `pnpm -r typecheck`, backend suite (`RUN_DB_TESTS=1` + `DATABASE_URL`), web unit suite, Playwright e2e — all green before the phase commit.
- Manual smoke: search, rate, save area + alert email in dev console log, delete account round-trip.
- Commits per feature area (contract → infra → backend → web), final phase commit + this spec.
