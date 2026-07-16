# Brief: MAP-02 — Map legend explaining shading colours

**From:** COO | **To:** Frontend agent | **Date:** 2026-07-16
**Tracker:** MAP-02 | **GitHub:** #121 | **Priority:** P3
**Branch:** `feat/map02-legend`

## Context

COO UI review (2026-07-16): /map shades countries and regions with no explanation of what
the colours mean. Shading state config is already data: `GET /api/map/shading/config`
returns `{ stateKey, displayName, colorHex }[]` (six fixed state keys; schema
`map_shading_config`). A query hook already exists in `src/frontend/hooks/useMapShading.ts`.
Map page: `src/frontend/pages/MapPage.tsx` + `src/frontend/components/Map/`.

## Requirements

1. Legend overlay on the map page — bottom-LEFT suggested (MapLibre attribution occupies
   bottom-right; do not cover it). Small, unobtrusive card: one row per shading state,
   colour swatch + displayName.
2. **Fully data-driven** from the shading config query (reuse the existing hook/cache —
   an admin change to a colour must be reflected without new plumbing). No hardcoded
   colours or state names in the legend component.
3. Graceful when config hasn't loaded (render nothing — no skeleton flash) and at narrow
   viewport widths (must not block map interaction).
4. Scope boundary: map routes are owner-gated today (ADL-28 per-user shading is decided
   but unimplemented) — do NOT touch backend gating; the legend simply won't render for
   non-owners since the config query 403s, which matches the map's current behaviour.

## Success criteria

- Legend visible on /map for the owner, listing every configured state with current colour + name
- No hardcoded colour/name values in the component (assert by reading the diff)
- Attribution unobstructed; map pan/zoom unaffected
- Component test: legend renders entries from a mocked config response; renders nothing while loading
- E2E `map.spec.ts` (console-error assertion) still passes

## Workflow (per CLAUDE.md)

Branch off main → commit everything → /pre-push → PR titled
`feat(MAP-02): map legend for shading colours (#121)`, body `Closes #121`
→ verify CI green → do NOT merge → completion report text in your final response (COO files it).
