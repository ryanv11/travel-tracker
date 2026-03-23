TO: COO
FROM: Architect
DATE: 2026-03-21
RE: ADL-26 complete — region-aware map click filtering (MAP-01, #52)

---

## Summary of decisions made

ADL-26 has been written at `/workspace/jobs/architect/tech/ADL-26-region-aware-map-filtering.md` and a summary entry appended to the main ADL log.

### Core decisions

**1. Filter granularity = click layer ID, not zoom or API flag.**
MapLibre's `feature.layer.id` is `'regions-fill'` for region clicks and `'countries-fill'` for country clicks. This is a reliable discriminator — region polygons only appear in `regions-fill` for countries with `region_tier_enabled = 1`, so there is no ambiguity. No changes to the shading API or click handler are needed.

**2. City-to-region link = `cities.region_id → regions.iso_3166_2`.**
The DB chain is `trip_places → cities.region_id → regions.iso_3166_2`. The trip summary API response currently exposes `city.region_id` (the numeric FK) but not `iso_3166_2`. The region filter URL param is the ISO 3166-2 string (e.g. `"US-CA"`), so the backend must add one field — `region_iso: string | null` — to the city object in the trips summary response. This requires joining `cities → regions` in the trips summary query, which is a standard Drizzle join (the same pattern is already used in `shading.service.ts`).

**3. `filterAndSortTrips` implementation spec.**
Replace the `_regionFilter` stub with:
```typescript
} else if (regionFilter !== null) {
  result = result.filter((t) =>
    t.places.some((p) => p.city.region_iso === regionFilter)
  );
}
```
Priority: city > region > country. Rename parameter from `_regionFilter` to `regionFilter`.

---

## Open questions resolved

All four open questions from the MAP-01 tracker notes are resolved:

| Question | Resolution |
|---|---|
| Which field identifies city→region? | `cities.region_id → regions.iso_3166_2`; add `region_iso` to API response |
| What does a region click look like from MapLibre? | `feature.properties.iso_3166_2` (e.g. `"US-CA"`), layer `'regions-fill'` |
| How does the frontend know which countries have `region_tier_enabled`? | It doesn't need to — the click layer ID is the discriminator |
| What exactly needs to change in `filterAndSortTrips`? | See Decision 3 above |

---

## Open questions that remain unresolved

**Region filter label display.** The trip list currently shows `Region: US-CA` (raw ISO code) when a region filter is active. Showing a human-readable name (e.g. `Region: California`) requires either (a) including `region_name` in the URL param, or (b) a lookup from the `RegionShading` data already fetched by `useRegionShading`. This is a UX polish item outside MAP-01 scope. It is noted in the ADL (§5.5) as a follow-up ticket if desired.

---

## Agent unblock status

- **Frontend agent:** Unblocked. Can implement `filterAndSortTrips` once `region_iso` is available on the `City` type. Can add the type field speculatively now and implement the filter logic; the type change will be confirmed when the backend delivers the field.
- **Backend agent:** Unblocked. Can add the `regions` join to the trips summary query and include `region_iso` in the city serialisation immediately. No schema migration, no new endpoint.

Both agents can work in parallel — the contract is `city.region_iso: string | null`.

---

## Files written

- `/workspace/jobs/architect/tech/ADL-26-region-aware-map-filtering.md` — full ADL
- `/workspace/jobs/architect/tech/20260307-architecture-decisions-log.md` — ADL-26 summary entry appended
