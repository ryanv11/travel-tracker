TO: BACKEND
FROM: COO
DATE: 2026-03-21 24:00
RE: ADL-23 — trip_countries API + shading (GitHub #31)

Database migration (PR #38) is merged. tripCountries table + TripCountry / NewTripCountry
types are in schema.ts. Build on them now.

Branch: `feat/adl23-trip-countries-api`

---

## Overview of changes

1. tripRepository — add 4 new methods for country CRUD
2. buildTripResponse — include countries in every trip response
3. GET /api/trips — add lean country_codes[] to list items
4. POST /api/trips — accept country_codes, insert atomically
5. PATCH /api/trips/:id — accept country_codes, replace when present
6. GET /api/trips?country=XX — filter by country
7. Country sub-resource router (POST + DELETE)
8. Validation schemas — add country_codes fields + country filter param
9. shading.service.ts — Query C + case (d) for trip_countries path

Read all files before editing. Key files:
- src/backend/repositories/trips.ts
- src/backend/routes/trips.ts
- src/backend/services/shading.service.ts
- src/backend/validation/trips.schemas.ts
- src/backend/db/index.ts (check what's exported — add tripCountries if missing)

---

## 1. db/index.ts

Ensure `tripCountries` and `countries` are exported. The migration added tripCountries
to schema.ts — check that index.ts re-exports it, and add it if not.

---

## 2. tripRepository — new methods (src/backend/repositories/trips.ts)

Add to the tripRepository object:

```ts
/** Returns all countries directly associated with a trip. */
async getCountries(tripId: number): Promise<{ country_code: string; name: string }[]> {
  const db = getDb();
  const rows = await db
    .select({ country_code: countries.countryCode, name: countries.name })
    .from(tripCountries)
    .leftJoin(countries, eq(countries.countryCode, tripCountries.countryCode))
    .where(eq(tripCountries.tripId, tripId))
    .orderBy(countries.name);
  return rows.map(r => ({ country_code: r.country_code!, name: r.name! }));
},

/** Replaces the full country list for a trip (delete all + reinsert). */
async setCountries(tripId: number, codes: string[]): Promise<void> {
  const db = getDb();
  await db.delete(tripCountries).where(eq(tripCountries.tripId, tripId));
  if (codes.length) {
    await db.insert(tripCountries).values(codes.map(c => ({ tripId, countryCode: c })));
  }
},

/** Adds countries idempotently (insert or ignore duplicates). */
async addCountries(tripId: number, codes: string[]): Promise<void> {
  if (!codes.length) return;
  const db = getDb();
  await db
    .insert(tripCountries)
    .values(codes.map(c => ({ tripId, countryCode: c })))
    .onConflictDoNothing();
},

/** Removes one country association. Returns true if it existed, false if not found. */
async removeCountry(tripId: number, code: string): Promise<boolean> {
  const db = getDb();
  const result = await db
    .delete(tripCountries)
    .where(and(eq(tripCountries.tripId, tripId), eq(tripCountries.countryCode, code)));
  return (result.rowsAffected ?? 0) > 0;
},
```

Add necessary imports: `tripCountries` from db/index, `countries` from db/index.

---

## 3. buildTripResponse (src/backend/routes/trips.ts)

Add countries to the existing helper. It already calls `getAssociations` and `getPlaces`
in parallel — add `getCountries` to that Promise.all:

```ts
const [assoc, placesRows, countriesRows] = await Promise.all([
  tripRepository.getAssociations(trip.id),
  tripRepository.getPlaces(trip.id),
  tripRepository.getCountries(trip.id),
]);
```

Add to the returned object:
```ts
countries: countriesRows,
```

---

## 4. GET /api/trips — lean country_codes[]

The list endpoint calls `buildTripResponse` per trip which now includes countries.
This is fine — no separate change needed. The full countries array is returned
for both list and detail responses. (ADL-23 specifies lean country_codes[] for list,
but since buildTripResponse already fetches it, returning the full [{country_code, name}]
array is acceptable and avoids inconsistency.)

---

## 5. POST /api/trips — accept country_codes

**Validation (src/backend/validation/trips.schemas.ts):**

Add to CreateTripSchema:
```ts
country_codes: z.array(z.string().length(2)).optional(),
```

**Route (src/backend/routes/trips.ts):**

Destructure `country_codes` from req.body. After creating the trip and associations,
call setCountries:
```ts
const { name, start_date, end_date, photo_album_ref, category_ids, companion_ids, activity_ids, country_codes } = req.body;

const trip = await tripRepository.create(userId, { ... });
await tripRepository.replaceAssociations(trip.id, category_ids ?? [], companion_ids ?? [], activity_ids ?? []);
if (country_codes?.length) {
  await tripRepository.setCountries(trip.id, country_codes);
}
```

---

## 6. PATCH /api/trips/:id — replace country list when present

**Validation:** Add to UpdateTripSchema:
```ts
country_codes: z.array(z.string().length(2)).optional(),
```

**Route:** After existing update logic, add:
```ts
if (body.country_codes !== undefined) {
  await tripRepository.setCountries(tripId, body.country_codes);
}
```
(Only replaces when field is explicitly present — undefined means unchanged.)

---

## 7. GET /api/trips?country=XX filter

**Validation:** Add to ListTripsQuerySchema:
```ts
country: z.string().length(2).optional(),
```

**Repository — update findAll:**

Add a `country` filter using post-filter pattern (consistent with existing category/activity filters):

```ts
if (filters?.country) {
  const db = getDb();
  // Path A: trips that have a city in this country
  const placeTrips = await db
    .select({ tripId: tripPlaces.tripId })
    .from(tripPlaces)
    .leftJoin(cities, eq(cities.id, tripPlaces.cityId))
    .where(eq(cities.countryCode, filters.country));
  // Path B: trips directly associated via trip_countries
  const directTrips = await db
    .select({ tripId: tripCountries.tripId })
    .from(tripCountries)
    .where(eq(tripCountries.countryCode, filters.country));
  const ids = new Set([
    ...placeTrips.map(r => r.tripId),
    ...directTrips.map(r => r.tripId),
  ]);
  filtered = filtered.filter(t => ids.has(t.id));
}
```

**Route:** Pass country through to repository:
```ts
const { status, category_id, activity_id, country } = req.query;
const allTrips = await tripRepository.findAll(userId, { status, category_id, activity_id, country });
```

Update the TripFilters type to include `country?: string`.

---

## 8. Country sub-resource router

Create `src/backend/routes/trip-countries.ts`:

```ts
import { Router } from 'express';
import { asyncHandler } from '../middleware/error-handler.js';
import { validateBody } from '../middleware/validate.js';
import { z } from 'zod';
import { tripRepository } from '../repositories/trips.js';
import { NotFoundError, LockError } from '../errors.js';

const router = Router({ mergeParams: true });

const AddCountriesSchema = z.object({
  country_codes: z.array(z.string().length(2)).min(1),
});

/** POST /api/trips/:tripId/countries — add countries (idempotent) */
router.post(
  '/',
  validateBody(AddCountriesSchema),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const tripId = parseInt(req.params.tripId, 10);
    const { country_codes } = req.body;

    const trip = await tripRepository.findByIdOrThrow(userId, tripId);
    if (trip.status === 'locked') throw new LockError();

    await tripRepository.addCountries(tripId, country_codes);
    const countries = await tripRepository.getCountries(tripId);
    res.json({ countries });
  }),
);

/** DELETE /api/trips/:tripId/countries/:code — remove one country */
router.delete(
  '/:code',
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const tripId = parseInt(req.params.tripId, 10);
    const { code } = req.params;

    const trip = await tripRepository.findByIdOrThrow(userId, tripId);
    if (trip.status === 'locked') throw new LockError();

    const removed = await tripRepository.removeCountry(tripId, code);
    if (!removed) throw new NotFoundError('Country association');
    res.status(204).end();
  }),
);

export default router;
```

**Mount in trips.ts** (alongside the places/items mounts):
```ts
import tripCountriesRouter from './trip-countries.js';
tripsRouter.use('/:tripId/countries', tripCountriesRouter);
```

---

## 9. shading.service.ts — Query C + case (d)

The existing `getAllCountryShading()` only traverses trip_places → cities → countries
(Path A). Countries with trip_countries rows but no city visits would show
`never_visited` — wrong.

**Import tripCountries** at the top of shading.service.ts.

**Add Query C function:**

```ts
/** Query C — aggregate trip status counts from trip_countries (Path B). */
async function getTripCountriesStats(): Promise<Map<string, { hasActive: number; completedCount: number; planningCount: number }>> {
  const db = getDb();
  const rows = await db
    .select({
      countryCode: tripCountries.countryCode,
      hasActive:      sql<number>`MAX(CASE WHEN ${trips.status} = 'active' THEN 1 ELSE 0 END)`,
      completedCount: sql<number>`COUNT(DISTINCT CASE WHEN ${trips.status} IN ('review_pending', 'locked') THEN ${trips.id} END)`,
      planningCount:  sql<number>`COUNT(DISTINCT CASE WHEN ${trips.status} = 'planning' THEN ${trips.id} END)`,
    })
    .from(tripCountries)
    .leftJoin(trips, eq(trips.id, tripCountries.tripId))
    .groupBy(tripCountries.countryCode);

  return new Map(rows.map(r => [r.countryCode, {
    hasActive:      Number(r.hasActive),
    completedCount: Number(r.completedCount),
    planningCount:  Number(r.planningCount),
  }]));
}
```

**Update getAllCountryShading():**

```ts
export async function getAllCountryShading(): Promise<CountryShadingResult[]> {
  const db = getDb();
  const [config, coverage, tcStats] = await Promise.all([
    getConfigMap(),
    getRegionCoverageMap(),
    getTripCountriesStats(),     // NEW
  ]);

  const rows = await db
    .select(countrySelectShape(countries, cities, trips))
    .from(countries)
    .leftJoin(cities, eq(cities.countryCode, countries.countryCode))
    .leftJoin(tripPlaces, eq(tripPlaces.cityId, cities.id))
    .leftJoin(trips, eq(trips.id, tripPlaces.tripId))
    .groupBy(countries.countryCode, countries.regionTierEnabled);

  return rows.map((r) => {
    // Merge Path B stats (trip_countries) into Path A counts — take max of each
    const tc = tcStats.get(r.countryCode);
    const merged = tc ? {
      ...r,
      hasActive:      Math.max(Number(r.hasActive), tc.hasActive),
      completedCount: Math.max(Number(r.completedCount), tc.completedCount),
      planningCount:  Math.max(Number(r.planningCount), tc.planningCount),
    } : r;

    const stateKey = computeCountryState(merged, coverage.get(r.countryCode));
    return { countryCode: r.countryCode, ...buildResult(stateKey, config) };
  });
}
```

Also update `getCountryShading()` (single country) the same way — fetch tcStats for
just that country and merge before calling computeCountryState.

---

## Pre-push checklist

```bash
npm run type:check
npm run test:backend
npm run test:frontend
```

---

## PR

```bash
gh pr create --repo ryanv11/travel-tracker \
  --title "feat: trip_countries API — CRUD endpoints + shading update (ADL-23, #31)" \
  --body "$(cat <<'EOF'
Part of #31

- tripRepository: getCountries, setCountries, addCountries, removeCountry
- POST /api/trips + PATCH /api/trips/:id accept country_codes
- GET /api/trips?country=XX filters via trip_countries UNION trip_places path
- POST /api/trips/:id/countries (idempotent add)
- DELETE /api/trips/:id/countries/:code
- All trip responses include countries: [{country_code, name}]
- shading.service.ts: Query C (trip_countries path) + case (d) merge

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

After CI passes, notify COO — Frontend #31 brief is blocked on this.
