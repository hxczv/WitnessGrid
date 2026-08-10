# WitnessGrid

An independent, community-built register of police incidents across the United Kingdom. WitnessGrid makes interactions between the public and police visible and searchable: timestamped, geolocated, media-backed records submitted by witnesses and verified against a moderation queue.

## Architecture

- **Monorepo (pnpm workspaces)** — a single shared contract package, one API service, one web app, and a plain-SQL database layer shared between local and hosted PostgreSQL.
- **`packages/contract`** — the single source of truth: zod schemas, enums, and API types consumed by both the backend and the web app. No duplicated type definitions anywhere.
- **`backend`** — Hono API service. Runs on Node locally (`@hono/node-server`) and on Cloudflare Workers in production. First-party auth (email magic links + JWTs), Postgres-backed rate limiting, object-store adapter (local filesystem in dev, R2 in prod), email adapter (console in dev, Resend in prod).
- **`web`** — Next.js 15 App Router PWA (Serwist) with MapLibre GL JS + PMTiles map, offline capture queue (IndexedDB, SHA-256 via WebCrypto, no Background Sync dependency), SSR register feed and incident pages.
- **`infra`** — database migrations and seed data in pure SQL (PostgreSQL + PostGIS), runnable through a small Node runner, plus env templates for the services.
- **Data layer** — PostgreSQL + PostGIS. Locations are stored as `geography(Point,4326)` for real geospatial querying (bbox filtering, future clustering). Migrations are plain SQL so the exact same schema runs locally and on hosted Postgres.
- **Moderation & privacy** — public reads expose only `moderation_status='approved'` incidents; submissions are auto-approved in Phase 1; reporting flags feed a moderation queue.

## Monorepo layout

```
packages/contract/   shared zod schemas, enums, API types (source of truth)
backend/             Hono API service (Node dev / Cloudflare Workers prod)
web/                 Next.js PWA (register, map, report, profile)
infra/
  db/migrations/     SQL migrations, applied in sorted order by the runner
  db/seed.sql        development seed data (UK incidents + dev users)
  db/migrate.ts      migration runner (tracks applied files in schema_migrations)
  db/seed.ts         seed runner
backend/.env.example  backend environment template (copy to backend/.env)
web/.env.example      web environment template (copy to web/.env.local)
.github/workflows/   CI (install, typecheck, test; deploy gated until credentials exist)
```

## Getting started

Prerequisites: **Node 24**, **pnpm 9.12.0**, and **PostgreSQL with PostGIS enabled** (installed locally or reachable over TCP). Current development host runs Postgres 18 + PostGIS with a local `witnessgrid` database.

```sh
# 1. Install workspace + standalone infra dependencies
pnpm install
cd infra && pnpm install && cd ..

# 2. Create the database (or point DATABASE_URL at your PostGIS-enabled database)
#    e.g. createdb witnessgrid, or via your preferred tooling.

# 3. Copy the environment templates (both are commented):
#    backend/.env.example -> backend/.env
#    web/.env.example     -> web/.env.local
#    Generate a JWT secret with:
#    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 4. Apply migrations, then seed development data
cd infra
pnpm migrate       # applies infra/db/migrations/*.sql in order
pnpm seed          # inserts dev users + 8 approved UK incidents (idempotent)
cd ..

# 5. Run checks
pnpm -r typecheck
pnpm -r test
```

`pnpm migrate:dry` prints the migration plan without connecting to a database. If the database is unreachable, `migrate`/`seed` fail loudly with instructions — they never silently pretend to succeed.

## Current status

Fully functional locally: web app + API + PostGIS database + seed data, with the backend integration suite running against live Postgres. Pending live deployment (credentials-gated CI), the moderation queue UI, and map clustering.

## Roadmap

- **Phase 1 (complete):** core schema + migrations + seed, Hono API with auth/upload/incident endpoints, Next.js PWA with offline capture queue and map.
- **Phase 1.1 (implemented):** ratings, statistics pages, saved-area alerts.
- **Phase 1.1 (remaining):** moderation queue UI, clustering on the map.
- **Phase 2:** supporter subscriptions, comment threads, deeper geospatial analysis (cluster/trend views).

## License

MIT — see [LICENSE](LICENSE). Reporting policy, terms and privacy documents live with the web app.
