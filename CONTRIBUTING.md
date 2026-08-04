# Contributing to WitnessGrid

Thanks for helping build an independent, accountable register of police incidents. Everything in the repo is real: no mocks, no stubs, no placeholder code.

## Setting up

Prerequisites: Node 24, pnpm 9.12.0, PostgreSQL + PostGIS (see [README](README.md)).

```sh
pnpm install
cd infra && pnpm install && cd ..
```

## Running checks

```sh
pnpm -r typecheck   # TypeScript strict, every workspace
pnpm -r test        # vitest suites, every workspace
pnpm migrate:dry    # from infra/ — print migration plan without a database
```

Database-backed work (migrations, seed, integration tests) requires a running PostgreSQL + PostGIS instance. The migration and seed runners fail loudly with actionable messages when `DATABASE_URL` is unreachable — do not fake success in tests or scripts.

## Pull request checklist

- [ ] No mock, stub, or placeholder code — new behavior is implemented for real and testable.
- [ ] All enums, zod schemas and API types imported from `@witnessgrid/contract` — never redefined in `web` or `backend`.
- [ ] All timestamps are UTC (ISO-8601) at rest and on the wire; only rendering converts to viewer-local time.
- [ ] New behavior ships with tests (unit and, where it touches a route or store, integration against the real database).
- [ ] `pnpm -r typecheck` and `pnpm -r test` pass locally, including the contract package.
- [ ] Public read paths expose only `moderation_status='approved'` incidents; mutating endpoints require a valid JWT.
- [ ] Commit messages follow conventional style (`feat:`, `fix:`, `chore:`, `docs:`).

## Reporting issues

Include the incident context, expected vs observed behaviour, and the reproduction steps. For safety-sensitive content, prefer filing a report flag through the app rather than pasting media into an issue.
