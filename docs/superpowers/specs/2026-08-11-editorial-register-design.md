# Editorial Register — design spec

2026-08-11

## Goal

Make WitnessGrid read as a serious, living publication — "the public register" —
rather than a flat dashboard. Keep the existing identity (deep slate, warm
hierarchy, amber accent, Atkinson/Archivo/Plex Mono, tartan) and sharpen it with
editorial structure, per-type colour accents, and real-looking placeholder media
in dev so the register never presents blank or broken.

## Changes

1. **Type accents** — each incident type gets a restrained accent hue
   (CSS variables, dark+light aware). Used only for small signals: the row type
   tag + dot, and a coloured rule on the incident header. No rainbow layouts.

2. **Feed rows as ledger entries** — each register row shows a mono record
   reference (`REF <hash8>`), the type in display type with its accent, the
   timecode strip (time / force / coordinate / media count / views), and the
   thumbnail. Hover shows a left accent rule.

3. **Masthead** — home header strengthened: double top rule, larger display
   headline, kicker line retained; the stats band becomes a rule-separated
   "ledger" strip instead of a rounded card.

4. **Incident detail** — header gains the type-coloured rule and the record
   reference chip.

5. **Generated seed media** — `infra/db/seed.ts` renders deterministic
   abstract "scene" PNGs (gradient sky, silhouette cityscape, accent sun,
   seeded per incident id so original and thumbnail match) instead of 1×1
   gray squares. Seed keys/type switch to `.png`/`image/png` and become
   upserts (`DO UPDATE`) so re-seeding converges.

## Non-goals

- No new dependencies, no image-processing libraries (PNG encoder is
  built from `node:zlib` + manual chunks).
- No changes to layout structure, nav, filters, map, or report flow.
- Light theme keeps the same treatment (variables adjust per theme).

## Verification

`pnpm typecheck`, `pnpm lint`, `pnpm vitest run` (web); `pnpm test` (infra);
re-seed and confirm media URLs serve `image/png` and decode; full e2e suite;
13-page site probe clean; commit and push.