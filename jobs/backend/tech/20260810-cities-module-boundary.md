# Cities module boundary — route / repository / identity service

**Landed:** 2026-08-10 · **Tracker:** QUAL-43 (ADL-53 §4 / D3, §6 Stage 2) · also discharges BUG-84 U7/U8
**Canonical design home:** `jobs/architect/tech/ADL-53-userid-scoping-chokepoint.md` §4.
This note is a map of the resulting code, not a second authority — where the two differ, ADL-53 wins.

## No API change

**Zero behaviour change is the success criterion of the work this documents.** Every route, status
code, query parameter and response shape is exactly as documented before: `GET /api/cities`,
`POST /api/cities`, `GET /api/cities/:id`, `PATCH /api/cities/:id`,
`GET /api/cities/:id/carry-forward`, `GET /api/cities/:id/items`. Frontend needs no change and
should read the existing API reference. The 808 pre-existing backend tests pass unmodified, which
is what makes that claim checkable rather than asserted.

## Where each concern now lives

| Concern | Home |
|---|---|
| HTTP shape, validation middleware, `parseInt`/NaN 404 guards, `serializeCity` | `src/backend/routes/cities.ts` |
| Geocode **orchestration** — `resolveCityName`, the fire-and-forget re-resolve after a pending insert, the `ambiguous` skip | `src/backend/routes/cities.ts` (ADL-53 OQ-3: deliberately *not* in the identity service) |
| Identity **algebra** — `findOrUpgradeCity` (D13 three-step), `createOrReuseCarriedCity` (BUG-75 carried OSM ref), `insertCityOrReuse` (M1/F3 caught-violation → re-select) | `src/backend/services/cityIdentityService.ts` |
| Every SQL statement touching `cities` / `countries` / `regions`, plus the two city-scoped user-owned reads | `src/backend/repositories/cities.ts` |
| Geocoding itself | `src/backend/services/geocoding.service.ts` (unchanged) |

The route holds no database handle. `cityIdentityService` holds none either — it composes
`citiesRepository` primitives.

## The two scoping axes in `citiesRepository` (read before editing it)

They look alike and are not alike:

- **Ownership** — `findCarryForwardItems` and `findCityItems` join `trips` / `items`, which are
  user-owned. They compose the chokepoint: `scopeToUser(trips, userId)` / `scopeToUser(items, userId)`.
  Cities' user-owned *joins* join the chokepoint even though the cities table does not.
- **Creator visibility** — the GE-16 search containment and the wildcard-upgrade candidate's
  `created_by_user_id = caller OR IS NULL` scoping key on `cities.createdByUserId`. `cities` is
  **global reference data** (nullable creator, `ON DELETE SET NULL`), so this is a visibility /
  write-through rule, not ownership. It is correctly hand-written and must stay that way: `cities`
  is absent from `UserOwnedTable`, so routing it through `scopeToUser` is a **compile error**.

`scripts/scope-completeness-check.sh` passes on this file because its regex matches `.userId` and
the column is `.createdByUserId`. That is a correct pass, but note it is regex-shaped.

> **UPDATED 2026-08-10 (QUAL-43 Stage 5, PR #495).** That check is now **enforced** rather than
> warn-only, across all of `src/backend/**`. The pass above is still correct — `cities` is global
> reference data and `createdByUserId` is deliberately outside the ownership axis — but the
> regex-shaped margin now has build consequences rather than warning consequences. If a genuinely
> user-owned column is ever named such that the regex misses it, the guard goes quiet rather than
> loud; that is the blind spot to watch, and it is a reason to keep naming ownership columns
> `userId`, not a reason to loosen the regex.

## Testing this logic directly

`src/backend/services/__tests__/cityIdentityService.test.ts` is the direct unit suite (19 tests).
It runs against a real libSQL instance built by replaying the real migrations
(`repositories/__tests__/test-db.ts`), so `uniq_cities_osm_ref` and
`uniq_cities_pending_per_creator` are live and produce the unique violations the catch-path
consumes, and foreign keys are ON. Follow that pattern for new identity cases — a stubbed
"conflict" specifies nothing, because it passes identically against a dropped index.

Out of scope and untouched (ADL-53 D8/§9): transaction/atomicity behaviour — the `db.transaction()`
avoidance is preserved exactly; geocode dual-identity consolidation (GE-19); serializer unification.
