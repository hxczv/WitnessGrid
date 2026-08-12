# Map incident pins — design

**Date:** 2026-08-12

## Problem

Incident markers on `/map` are flat accent circles rendered by the map library
(circle layers). Verified pixel-exact on their coordinates, but centre-anchored
with no tip, so they read as "somewhere in this blob" instead of a precise
point, and carry no type or cluster affordance. User: "dots sit off the actual
spot" — a perceptual alignment problem that a tip anchor fixes.

## Design

1. **Teardrop pins** — a classic pin silhouette (circular head, sides tapering
   to a bottom tip), drawn at runtime onto 2× canvases (no sprite files) and
   registered with maplibre via `map.addImage(..., { pixelRatio: 2 })`.
   Rendered with symbol layers using `icon-anchor: "bottom"` so the **tip lands
   exactly on the incident's coordinates** and every pixel of the pin is above
   the point.
2. **Colored by incident type** — one canvas per type (8 total), tuned for the
   dark CARTO basemap, with a dark outline (`--bg`) for separation:

   | type | color |
   |---|---|
   | `stop_and_search` | `#FFB300` |
   | `vehicle_stop` | `#4FC3F7` |
   | `use_of_force` | `#FF8A65` |
   | `missing_person` | `#CE93D8` |
   | `arrest` | `#E57373` |
   | `traffic_collision` | `#81C784` |
   | `stop_and_question` | `#90A4AE` |
   | `other` | accent `--accent` (`#E8A33D`) |

3. **Clusters become pins** — three tiers sized by count, brand accent with
   dark outline: 34px (`<10`), 42px (`<25`), 52px (`25+`). Count rendered by a
   separate vector text layer (crisp at any DPR) centred on the pin head via a
   per-tier `text-offset` derived from the same geometry constants as the
   images.

4. **Behaviour preserved** — click pin → incident page; click cluster → zoom
   in; hover cursor; drawing mode ignores pin/cluster layers.

## Files

- `web/src/lib/map-pins.ts` (new): colours, pin-image construction,
  `registerPinImages(map, { accent, outline })`, shared geometry constants
  (`CLUSTER_TIERS`, head-centre ratio) used to build icon/text expressions.
- `web/src/components/map/map-view.tsx`: swap the three circle/symbol layers
  for `incident-pin`, `incident-cluster-pin`, `incident-cluster-count`
  (with per-tier text offsets and the type-colour icon expression); update
  click/hover/draw layer ids.
- `pin-map.tsx`: unchanged (its DOM pin is already tip-anchored).
- `web/e2e/phase2.spec.ts`: tip-anchor regression (see Testing).

## Testing

E2E (test-first): for a rendered pin, the incident's exact projected pixel
hits the `incident-pin` layer; a point **below** the coordinates does not
(nothing hangs under the tip); a point within the head **above** does. Also
asserts all three new layer ids exist after load. Existing map e2e, unit
suite, lint, typecheck and probe must stay green.

## Out of scope (YAGNI)

Accuracy halo rings, single-pin labels, animated pop-in, legend, click
popovers. Easy to add later.