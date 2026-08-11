# AGENTS.md

## Git workflow

- The user's explicit standing instruction: **after every update or improvement, push everything to GitHub** (`origin`, branch `master`).
- This means: after completing any code change and running its verification (typecheck, lint, tests), commit and `git push origin master` — do not wait to be asked.
- Only push verified work: run the relevant check commands first (see below) and confirm they pass before committing.
- Never commit secrets. `backend/.env` is gitignored and local-only.

## Verification commands

- Backend (`backend/`): `pnpm typecheck`, `pnpm lint`, `pnpm vitest run` (unit), plus integration: `RUN_DB_TESTS=1 pnpm test` against a live Postgres (`DATABASE_URL=postgres://postgres:postgres@localhost:5432/witnessgrid`). The integration suites truncate `rate_limit` themselves; e2e still needs `TRUNCATE rate_limit` before each run.
- Web (`web/`): `pnpm typecheck`, `pnpm lint`, `pnpm vitest run`.
- E2E (`web/`): `RUN_E2E=1 pnpm e2e` — requires the dev servers (API on 8787, web on 3000) running and `backend/.env` with `MAGIC_LINK_IP_LIMIT=100`.
  - Start the API (`backend/`): `pnpm dev` (tsx watch). Start the web app (`web/`): `pnpm dev` (next dev). They are long-running background processes; if e2e fails with "Cannot reach the API (Failed to fetch)" or connection refused, the servers have died — restart them and rerun.
- CI runs the same gate: typecheck, lint, unit + integration tests.
