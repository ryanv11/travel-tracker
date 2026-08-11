# GE-19 / BUG-85 — Geocode queue indicator (component + data flow)

**Date:** 2026-08-11 · **BRD:** GE-19 (v3.20) · **Design:** ADL-55 · **Branch:** feat/ge19-frontend

Component documentation for the interactive geocode-status indicator, so another
engineer can extend it without a handover.

## Data flow

```
GET /api/geocode-queue  ──poll──►  useGeocodeQueue()  ──►  bucketGeocodeQueue()
   (source of truth,                (refetch 30s /             { resolving[],
    userId-scoped)                   focus / mutation           needsAttention[] }
                                     invalidation)                    │
                                                                      ▼
GET /api/trips ──► useTrips() ──► buildCityPlaceIndex()  ──►  GeocodeQueueIndicator
   (city→place refs)               Map<cityId, PlaceRef[]>        badge + panel
                                                                      │
                                          recovery ─────┬── ChangeCityModal (re-point)
                                                        └── useRemovePlace (remove place)
```

- **`GET /api/geocode-queue`** is the badge's single source of truth (ADL-55 D3/OQ-4).
  It returns the requesting user's own not-`resolved` cities, each with
  `geocode_status` ∈ {`pending`,`needs_attention`,`unresolvable`} and
  `geocode_cause` ∈ {`ambiguous`,`unreachable`,`null`}. The retired NR-06
  localStorage queue no longer participates.
- **`GET /api/trips`** supplies the city→place join. The queue endpoint returns
  cities; re-point/remove need `{tripId, placeId}`. `useTrips()` places carry
  `city_id`, so `buildCityPlaceIndex` derives every referencing place. Both the
  queue and the trips list derive from the same userId-scoped `trip_places →
  trips`, so every queue city has ≥1 referencing place (invariant, not luck).

## Key modules

| Module | Responsibility |
|---|---|
| `utils/geocodeQueueLabels.ts` | Pure. `geocodeQueueLabel(status,cause)` = ADL-55 §4 copy; `bucketGeocodeQueue` = resolving vs needs-attention split; `isNeedsAttentionStatus`. Frontend owns the copy (D4). |
| `hooks/useGeocodeQueue.ts` | Polls the endpoint; returns buckets + counts. Invalidates `['cities']`/`['trips']` when queue contents change (map/search freshness). Exports `GEOCODE_QUEUE_QUERY_KEY`. |
| `components/GeocodeQueue/GeocodeQueueIndicator.tsx` | Badge (two separate counts) + panel + recovery. Renders `null` when the queue is empty. |
| `hooks/usePlaces.ts` | `useAddPlace`/`useRemovePlace`/`useChangeCity` invalidate `['geocode-queue']` so the panel refreshes after a mutation. |

## The (status, cause) → label map (ADL-55 §4)

| status | cause | label |
|---|---|---|
| `pending` | `null` | Resolving… |
| `pending` | `unreachable` | Couldn't reach the geocoder — retrying |
| `needs_attention` | `ambiguous` | Needs region — multiple matches |
| `needs_attention` | `unreachable` | Gave up — couldn't reach the geocoder |
| `needs_attention` | `null` | Couldn't be resolved — needs attention |
| `unresolvable` | (any) | Not found |

Buckets: **resolving** = `pending`; **needs-attention** = `needs_attention` ∪
`unresolvable`. The badge's resolving number is `resolving.length` alone — a
needs-attention row is never counted in it (criterion 10).

## Visual treatment — NOT UX-spec'd (flagged for PO UAT)

No mockup specified the needs-attention state. Current default:
- Badge: amber warning chip `⚠ N need attention` (border-amber-500/bg-amber-50)
  next to a muted `☁ M resolving` chip.
- Panel: needs-attention rows are amber cards with a ⚠ label + per-place
  `Change city` / `Remove` buttons; resolving rows are muted with a ⟳ and no
  actions. Locked-trip references render `locked — unlock to fix` (read-only,
  matching PlaceSection's existing locked rule).

If the PO wants different styling, it is localised to `GeocodeQueueIndicator.tsx`
(and copy to `geocodeQueueLabels.ts`) — no data-flow change needed.

## Extending

- New label/copy → edit `geocodeQueueLabels.ts` only (no backend deploy).
- New cause value → add to `GeocodeCause` (types/api.ts) + a branch in
  `geocodeQueueLabel`; the bucket split keys on status, so it is unaffected.
- Recovery that needs a place id → it is already available via the ref index;
  do not add a second endpoint call.
