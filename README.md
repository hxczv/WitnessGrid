# WitnessGrid

An independent, community-built register of police incidents across the United Kingdom. WitnessGrid gives the public a way to record their own accounts of encounters with police — timestamped, geolocated, with evidence attached — and to search what other people have witnessed.

## What WitnessGrid is

Most of what we know about policing comes from official accounts or the news. WitnessGrid is the other side: a public register built from the accounts of people who were there. Anyone can read it, and anyone can add a record of their own — no account details required beyond an email address for sign-in, and witnesses stay pseudonymous.

A record carries a time, a place, a description, and optionally photos or video. The register is searchable by type, force, location, and keyword, and it's shown on a map so patterns become visible. The web app works as an installable app, and you can draft a report even with no connection — it syncs when you're back online.

Two things we say plainly:

- **Reports are the witnesses' own recordings; they have not been verified by anyone.** The moderation queue exists so problematic content can be flagged, not to vouch for what's true.
- **Only record if it is safe to do so.**

## What's in the repo

| Directory | What it is |
|---|---|
| `web/` | The app people use — the register feed, an interactive map, the guided report flow with offline capture, and profile pages. |
| `backend/` | The API — magic-link sign-in, media uploads, rate limiting, and everything the app talks to. |
| `packages/contract/` | The shared definitions of the API. Both the web app and the backend use them, so the two sides can't silently disagree. |
| `infra/` | The database — plain-SQL migrations and development seed data for PostgreSQL + PostGIS. |

The whole stack runs on PostgreSQL with PostGIS for location data, so the exact same database schema works locally and in production.

## Run it locally

You'll need **Node 24**, **pnpm 9.12**, and a **PostgreSQL database with PostGIS** (installed locally, or reachable over TCP).

```sh
# 1. Install dependencies
pnpm install

# 2. Copy the environment templates (both files are commented):
#    backend/.env.example -> backend/.env
#    web/.env.example     -> web/.env.local
#    Then generate a JWT secret and put it in backend/.env:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 3. Point DATABASE_URL at your database, then apply migrations
#    and seed some example UK incidents:
pnpm migrate
pnpm seed

# 4. Run it — the API on :8787, the web app on :3000
pnpm dev

# 5. Verify your changes
pnpm typecheck
pnpm test
```

`pnpm migrate:dry` prints what the migrations would do without touching a database. If the database is unreachable, `migrate` and `seed` fail loudly with instructions rather than pretending to succeed.

## Where things stand

The app is fully functional locally: web app, API, database, seed data, and the backend's integration suite all run against the real stack. Deployment is the one thing left to do — CI is ready and gated until hosting credentials exist.

Live today: the register (report, browse, search, map), sign-in with magic links, ratings, statistics, and saved areas with email alerts.

Next up: the moderation queue UI, map clustering, then supporter subscriptions, comment threads, and deeper analysis of what's been recorded.

## Contributing

We're glad to have you. Please read [CONTRIBUTING](CONTRIBUTING.md) and [CODE_OF_CONDUCT](CODE_OF_CONDUCT.md) first.

## License

MIT — see [LICENSE](LICENSE).
