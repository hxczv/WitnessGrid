# WitnessGrid — Product Design

**Date:** 2026-08-04
**Status:** Approved (all sections)
**Scope:** Full product design (Phases 1–4); this cycle builds **Phase 1** only.

---

## 1. Product overview

WitnessGrid is a free, open-source web + mobile platform for recording, uploading, and viewing public police interactions in the UK. It is an **evidence register, not a social feed**: structured reporting, incident ratings, geospatial visualization, search and saved-area alerts, and public data access. Free forever for every user — no feature gates, no tiered access.

- **Phase 1 client**: installable PWA from one Next.js codebase (web + "Add to Home Screen" mobile), full offline capture. Native Flutter apps in Phase 4.
- **Operating principle**: every screen reads as a verified public record — precise, calm, unmistakably not a generic SaaS template.

## 2. Goals & success criteria

- Fast capture: camera → structured report → submitted in under a minute with network present.
- Low-latency reads: SSR'd public pages; lazy-loaded media.
- Near-zero fixed infra cost (£0 starting).
- Discoverable: SSR/SSG public incident + map pages are the primary free acquisition channel; SEO-friendly URLs; auto-generated OG share cards.
- Visually distinct: evidence-register aesthetic (timecode strip, Sillitoe tartan motif, defined palette + type system).
- Pseudonymous by default; posting requires an account; guests can browse everything.

## 3. Non-goals (this cycle)

Phase 1 excludes: ratings, dashboard/stats, search UI, saved-area alerts, comments, moderation admin, dedup clustering, public API/dataset/embed, supporters/payments, native apps. Schema groundwork for these exists where cost-free (e.g. `tsvector` column, `cluster_id`, ratings/comments tables).

## 4. Architecture

Monorepo, pnpm workspaces:

```
WitnessGrid/
  package.json                 workspace root
  pnpm-workspace.yaml
  packages/contract/           zod schemas + REST types + enums — single source of truth
  web/                         Next.js App Router + Serwist PWA + Tailwind + React Query + Zustand
  backend/                     Hono on Cloudflare Workers (wrangler)
  mobile/                      placeholder (Phase 4)
  infra/supabase/migrations/   SQL migrations
  docs/superpowers/specs/      design + plan docs
```

### Runtime topology (local dev)

`supabase start` (Docker) serves Postgres + PostGIS + Auth (magic-link emails land in the local **Inbucket** inbox). `wrangler dev` runs the real Workers runtime with local R2 storage. Local Redis via Docker (`redis-stack`) behind a dev-only flag, `ioredis` on Upstash in prod. Web and worker hit each other with CORS configured for `localhost` and the deployed web origin. All credentials via env vars; `.env.example` documents each. A dev-only seed script populates sample UK incidents so the map and register render without manual data entry.

### Production topology (£0)

- **Web**: Cloudflare Pages (Next on Pages, or Worker build) + CDN. SSR/SSG for indexable pages.
- **Backend**: Hono on Cloudflare Workers (~100k req/day free), REST.
- **DB**: Supabase Postgres + PostGIS (EU region), full-text search via `tsvector` (no separate search infra).
- **Cache/rate-limit**: Upstash Redis (pay-per-request).
- **Storage**: Cloudflare R2 (free egress, 10GB free). Original + compressed + thumbnail per media item.
- **Analytics**: Cloudflare Web Analytics (free, cookieless).
- **Auth**: Supabase Auth — email/magic-link only (see §7).
- **CI/CD**: GitHub Actions on public repo.
- **Usage alerting**: dashboards for Workers/R2/Supabase/Upstash ceilings.

### Map tiles

MapLibre GL JS + Protomaps PMTiles. Dev: Protomaps public tile source (config-driven URL). Later: self-host a UK extract PMTiles on R2.

## 5. Visual design

An **evidence register, not a social feed** — verified public record, precise and calm.

### Color
```
--ink        #12151C   base dark background (blue-black)
--surface    #1A1E27   card/panel surface
--paper      #E8E6DE   light-mode background / dark-mode text
--amber      #E8A33D   primary accent — interactive elements, evidence-tag association
--verified   #4F8C7D   muted teal — verified/resolved states
--flag       #C24A3D   muted brick-red — reports, disputes, alerts
--line       #2A2F3A   hairline dividers
```

### Type — three roles, never interchanged
- Display: **Archivo** (Expanded, bold) — headlines and big stat numbers only, sparingly.
- Body/UI: **Atkinson Hyperlegible** — legibility under stress/low light.
- Data (monospace): **IBM Plex Mono** — every machine-verified fact (timestamp, GPS, hash, collar number). This consistency is the trust signal.

### Layout
- Feed = register, not card grid: dense rows, monospace metadata column (time · force · type) left, thumbnail + description right.
- Map = full-bleed, translucent floating control panel.
- Incident detail = timecode-strip header band → media → narrative body.
- Dashboard = desktop sidebar → mobile bottom nav (Phase 2).

### Report flow
Capture → **Pin location** (drag the pre-pinned GPS point to the exact spot, or place manually) → Fill form → Submit. Ratings join the flow in Phase 2.

### Signature elements
- **Timecode strip**: monospace dashcam-style burned-in metadata bar, identical on every card/header/detail: `14:32:07 · 03 AUG · MET POLICE · 51.50,-0.12 · #a91f…`
- **Sillitoe tartan**: UK police cap-band checkerboard as structural divider / loading motif.

### Responsive & motion
- Mobile-first: <640px single column; 640–1024 tablet; 1024+ sidebar/split.
- Touch targets ≥44px, visible keyboard focus, `prefers-reduced-motion` respected.
- Functional motion only: marker clustering on zoom, fast report-flow steps, live-tick animation on timecode when new incidents post. No page-load choreography.

## 6. Data model

Postgres + PostGIS (Supabase, EU region). RLS enabled on all tables.

### Enums (in `packages/contract`, mirrored as Postgres types)

- `incident_type`: `stop_and_search | vehicle_stop | arrest | use_of_force | stop_and_question | traffic_collision | missing_person | other`
- `police_force`: the 43 territorial forces + British Transport Police + Ministry of Defence + Civil Nuclear Constabulary (~46 values)
- `moderation_status`: `pending | approved | removed` (incidents + comments)
- `subscription_tier`: `free | supporter`

### Tables

```
Users
  id (uuid, = Supabase auth id), username (unique, pseudonymous), email (nullable, login-only),
  created_at, subscription_tier, supporter_since (nullable)

Incidents
  id, user_id, type, police_force, location (geography(Point,4326)),
  timestamp, description, officer_count, created_at,
  cluster_id (nullable — populated by Phase 3 clustering), view_count,
  moderation_status (default pending)
  + generated tsvector column (description, type, police_force) w/ GIN index (Phase 2-ready)
  + GiST index on location

Media
  id, incident_id, url (R2 key), type, sha256 (unique), thumbnail_url

Ratings
  id, incident_id, appropriateness, professionalism, safety   (1–5; Phase 2)

Officers
  id, incident_id, collar_number

Comments
  id, incident_id, user_id, body, created_at, moderation_status   (Phase 3)

SavedAreas
  id, user_id, bounds (geography(Polygon,4326)), created_at   (Phase 2)

AuditLog                       (Phase 3)
  id, actor, action, target_type, target_id, created_at
```

### RLS rules
- Public read: rows with `moderation_status = 'approved'` (and, for own rows, owner access to any status).
- Writes: require authenticated session (email/magic-link). Users may only insert incidents as themselves; media linked to own incidents.
- No anonymous-write paths.

## 7. Auth & permissions

- **Supabase Auth: email/magic-link only** (passwordless). Registration requires a chosen unique pseudonymous username (set at signup).
- Guests (unauthenticated): browse all public pages, map, feed, incident detail. No mutations.
- **Every mutating endpoint requires a registered session** — including `/upload` and `/incident`.
- Email is stored for login only; never displayed anywhere.
- Session via Supabase JWT; the worker verifies JWTs on every protected route.

## 8. API contract

Defined in `packages/contract` (zod request/response schemas); backend implements, web consumes. Error shape: `{ error: { code, message } }`; zod 400s carry machine-readable codes.

### Phase 1 endpoints

```
POST /upload            auth → { uploadUrl (signed PUT, 5 min), key, hash }   (stages one media file)
POST /incident          auth → creates incident + links staged media
DELETE /incident/:id    auth + owner → deletes incident + cascades R2 media   (withdraw/erasure)
GET  /incidents         public — filters: bbox, date range, type, police_force; paginated (cursor)
GET  /incident/:id      public — single approved incident (SSR detail page)
```

### Deferred endpoints (Phases 2–4)

```
POST /rating · POST /report · POST /incident/:id/comment · GET /incident/:id/comments
GET /search · POST/GET/DELETE /saved-areas · GET /stats · GET /stats/me
GET /dataset (CSV/JSON) · GET /embed · GET /supporters · POST /webhooks/billing
```

## 9. Data flows

### Capture → upload (core Phase 1 pipeline)

1. In-app camera (`getUserMedia`): photo or video — one capture session holds **multiple media items** before submit. If the camera is unavailable or the permission is denied, a **file-picker/gallery upload** offers the same flow. Video compressed client-side (WebM); poster/thumbnail generated client-side (canvas) at capture — **no server-side image processing** (keeps R2/Worker cost £0).
2. SHA-256 hash computed client-side (WebCrypto) **before** upload. Integrity proof + de-dup key.
3. `POST /upload` → worker verifies auth + rate limit → signed PUT URL → client PUTs original + compressed + thumbnail to R2 under `media/[incident_id]/[hash].[ext]`. R2 bucket has CORS enabled so the browser can PUT directly; the worker sets CORS for the web origin on every response.
4. `POST /incident` persists row + media refs. **Phase 1 rule: incidents are auto-approved on creation** (`moderation_status = 'approved'` immediately). When the Phase 3 moderation pipeline ships, new submissions default to `pending` and the auto-approve flag flips off.
5. GPS + timestamp captured at shutter time. **Pin-location step**: the report flow shows a map with the shutter-time GPS point pre-pinned; the witness drags the pin to the exact spot where the incident occurred (across the street, at a kerb, a doorway) or places a pin manually if GPS was unavailable. The adjusted coordinate becomes the incident's stored point.

### Report form (Phase 1)

- `incident_type` (required, enum), `police_force` (required, searchable picker over ~46 forces), `timestamp` (defaults to shutter time, adjustable), `officer_count` (optional int), `collar_number(s)` (optional free-text array), `description` (optional, ≤ 2000 chars), media (1–N items from the capture session).
- **Confirmation checkbox** (required, blocks submit): "I confirm this is my own recording, I have the right to share it, and I am 16 or over. My report stays pseudonymous."
- **Evidence integrity**: incidents cannot be edited after submit. Withdrawal is the only mutation — the owner deletes via `DELETE /incident/:id` (hard delete of rows + R2 media). Moderation removal (Phase 3) is a soft hide with an audit record; owner-erasure is immediate.

### Media sizes

- **No per-media or per-report caps** — longer, higher-fidelity recordings preserve context and evidence value. Client-side compression reduces size without shortening recordings.
- The 10GB free tier is protected by R2 usage alerting (§4), not by upload caps.

### Offline capture queue

- Entire submission (fields + media blobs) queued in IndexedDB when offline.
- Flush triggers: app foreground (`pageshow`/`visibilitychange`), `online` event, retry with backoff.
- **No Background Sync API on iOS Safari** — foreground flush only.
- `navigator.storage.persist()` requested explicitly at install/first use.
- Media hashes computed at capture time (queue stores blobs + hashes together).

### View pipeline

- SSR/ISR public pages: feed/map SSR'd for crawlers; `/incident/[id]` SSG/ISR-rendered with `revalidate`.
- Client hydration: React Query for filter changes; MapLibre GL JS renders clusters (client-side marker clustering on zoom).
- OG share card per incident via `next/og` `ImageResponse` (free server-side generation; timecode-strip styling).
- `sitemap.xml` + `robots.txt` for discovery; canonical URLs on public pages.
- Missing/withdrawn/removed incidents render a consistent "record not available" page (no 404 leak of existence) — with a `410`-style signal appropriate to crawlers.
- Lazy-load media: `loading="lazy"` + CDN caching, R2 egress free.

## 10. Security

- HTTPS everywhere; signed R2 upload URLs (5-min expiry, object-level, no public-write bucket). R2 bucket CORS + worker CORS scoped to the web origin.
- JWT auth on all mutations; Redis-backed rate limiting (Upstash) on mutating endpoints + honeypot field on report form.
- RLS on every table; owner-scoped delete enforced server-side; audit log (Phase 3) for moderator actions.
- Media hash verification on download paths; content-type allowlist for uploads (image/jpeg, image/png, image/webp, video/webm, video/mp4).

## 11. Privacy & legal guardrails (UK GDPR / DPA)

- Pseudonymous by default: no email on profiles; email login-only, never rendered.
- Report form collects nothing personal beyond what the witness chooses to describe; no phone-number harvesting (form validation discourages, moderation removes).
- Location is stored as a **single incident point**: one coordinate per incident, pre-filled from shutter-time GPS and adjustments the witness makes by dragging the pin to the exact spot (a pin can also be placed manually if GPS was unavailable). The app never samples position in the background, never records a trail of your movements, and does not use continuous/geofence location. No geo data is stored about account sessions — the only locations stored are incident points and saved-area polygons you explicitly draw on the map.
- Moderation pipeline (Phase 3): report → review → remove; removal cascades to R2 objects.
- **Owner erasure, immediately**: any user can delete their own incidents (`DELETE /incident/:id`), hard-removing rows + R2 media. This is the Phase 1 right-to-erasure path; full account deletion ships later.
- **Age requirement**: only people 16 or over may submit (confirmation checkbox). Content stays English-only in Phase 1.
- **Retention**: media is retained while visible; withdrawn/removed media is purged. The register holds no billing, analytics-beacon, or third-party-tracker data (Cloudflare Web Analytics is cookieless).
- Hashes are integrity metadata, not personal data.
- Guest browsing leaves no account trail.

## 12. Performance

Lazy-loaded media, CDN caching, paginated feeds, background/queued uploads, client-side compression, dedup clustering before render (Phase 3, server-side). Bundle discipline: code-split map + capture modules; keep the base bundle lean.

## 13. Testing & CI

- `packages/contract`: zod schema tests.
- `backend`: vitest — integration tests against local Supabase (real migrations + seeded data), plus contract-schema unit tests.
- `web`: Playwright smoke — signup → capture → submit → appears in feed; unit tests for offline-queue logic. The camera flow runs end-to-end in CI using Chromium's built-in test media-device flag; the file-picker path covers uploads where no camera exists.
- GitHub Actions: `lint + typecheck + test` on push; deploy (wrangler + Supabase migrations) on main — wired and ready, runs once credentials exist.
- Visual: reduced-motion and focus-state checks in the smoke suite.

## 14. Phase 1 exit criteria

1. `pnpm dev` runs web + worker + local Supabase together.
2. Email/magic-link signup works; a registered user captures photo/video, auto GPS+timestamp, hashes, uploads through signed URLs, pins the exact location on the map, and the incident renders on map + feed at the pinned point.
3. Offline capture queues locally and flushes on foreground/online.
4. Public SSR pages (`/incident/[id]`, feed/map) render approved incidents, indexable, with OG card.
5. PWA installs on mobile; `storage.persist` requested; reduced-motion + focus states pass.
6. CI green; repo ready for real credentials (placeholders documented in `.env.example`).

## 15. Roadmap (beyond Phase 1)

- **Phase 2**: ratings + tap UI, dashboard/stats (palette charts), filters, search UI (`tsvector`), saved-area alerts.
- **Phase 3**: moderation + admin panel + audit log, comments, dedup clustering (`ST_ClusterDBSCAN` cron), scaling, analytics.
- **Phase 4**: Flutter native apps (Riverpod, GoRouter, `flutter_map` + PMTiles), notifications, public API/dataset export, embeddable widget, Supporter membership (Stripe Payment Link / Open Collective / GitHub Sponsors; webhook flips `subscription_tier`; zero functional unlock).

## 16. Open source structure

```
/web        (Next.js PWA — Phase 1)
/backend    (Hono on Workers)
/mobile     (Flutter — Phase 4)
```
MIT License. `CONTRIBUTING.md` added in the implementation cycle. Public repo; GitHub Actions CI/CD free.
