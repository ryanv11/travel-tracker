TO: BACKEND
FROM: COO
DATE: 2026-03-21 13:00
RE: ADL-18 — Repository layer migration (GitHub #6)

---

## OVERVIEW

ADL-18 requires that all user-scoped queries go through a repository layer in `src/backend/repositories/`. Route handlers must not call `getDb()` directly for user-scoped data. Repository functions accept `userId` and always include `WHERE user_id = ?`.

**Hard dependency:** This work requires `user_id` columns on `trips`, `items`, and `trip_places` — added by the Database NR-03 migration (separate dispatch). Do not start this brief until that migration has been applied and `schema.ts` reflects the new columns.

---

## SCOPE

### In scope — user-scoped tables (must go through repositories)

These files call `getDb()` for user-owned data and must be migrated:

| File | Functions to migrate |
|------|---------------------|
| `src/backend/routes/trips.ts` | `getTripOrThrow`, `replaceAssociations`, `getTripAssociations`, `buildTripResponse` + all route handlers |
| `src/backend/routes/places.ts` | `assertTripWritable` + all route handlers |
| `src/backend/routes/items.ts` | `insertExtension`, `updateExtension` + all route handlers |
| `src/backend/routes/items-helper.ts` | `fetchItemsWithExtensions` |
| `src/backend/services/items.service.ts` | `assertNotLocked`, `ensureExperienceExtension`, `executeCarryForward` |

### Out of scope — system/global data (leave as-is, no userId scoping needed)

| File | Reason |
|------|--------|
| `src/backend/routes/admin.ts` | Global config — categories, activities, companions. Not user-scoped in MVP. |
| `src/backend/routes/map.ts` | Map shading — global computed state. Not user-scoped in MVP. |
| `src/backend/routes/cities.ts` | City data is global. Carry-forward queries are user-scoped — see note below. |
| `src/backend/services/geocoding.service.ts` | System-level geocoding queue. Not user-scoped. |
| `src/backend/services/shading.service.ts` | Global map state computation. Not user-scoped. |
| `src/backend/services/startup.service.ts` | App startup seeding. Not user-scoped. |
| `src/backend/db/seed.ts` | Dev seed script. Not user-scoped. |

**Cities carry-forward note:** `GET /api/cities/:id/carry-forward` returns items from a city across the user's trips. This should be user-scoped. Handle it in the cities route by passing `req.user.id` to the query directly (no need for a full cities repository unless the scope expands).

---

## REPOSITORY FILES TO CREATE

Create `src/backend/repositories/` directory (it already has `users.ts` from NR-14).

### `src/backend/repositories/trips.ts`

```ts
export const tripRepository = {
  findAll(userId: string, filters?: TripFilters): Promise<TripSummary[]>
  findById(userId: string, tripId: number): Promise<Trip | null>
  create(userId: string, data: NewTrip): Promise<Trip>
  update(userId: string, tripId: number, data: Partial<Trip>): Promise<Trip | null>
  delete(userId: string, tripId: number): Promise<boolean>
  // association helpers (categories, companions, activities)
  getAssociations(userId: string, tripId: number): Promise<TripAssociations>
  replaceAssociations(userId: string, tripId: number, assocs: TripAssociations): Promise<void>
}
```

Every function includes `WHERE user_id = userId` (or verifies trip ownership before operating).

### `src/backend/repositories/places.ts`

```ts
export const placeRepository = {
  findByTrip(userId: string, tripId: number): Promise<Place[]>
  findById(userId: string, placeId: number): Promise<Place | null>
  create(userId: string, data: NewPlace): Promise<Place>
  update(userId: string, placeId: number, data: Partial<Place>): Promise<Place | null>
  delete(userId: string, placeId: number): Promise<boolean>
  assertWritable(userId: string, placeId: number): Promise<void>  // throws if trip is locked or not owned
}
```

### `src/backend/repositories/items.ts`

```ts
export const itemRepository = {
  findByPlace(userId: string, placeId: number): Promise<Item[]>
  findById(userId: string, itemId: number): Promise<Item | null>
  create(userId: string, data: NewItem): Promise<Item>
  update(userId: string, itemId: number, data: Partial<Item>): Promise<Item | null>
  delete(userId: string, itemId: number): Promise<boolean>
  // extension helpers
  getExtension(userId: string, itemId: number, type: ItemType): Promise<ItemExtension | null>
  upsertExtension(userId: string, itemId: number, type: ItemType, data: object): Promise<ItemExtension>
}
```

---

## IMPLEMENTATION PATTERN

Every repository function that queries a user-owned resource must scope to userId. Two acceptable patterns:

**Pattern A — Direct WHERE clause:**
```ts
findById(userId: string, tripId: number) {
  return db.select().from(trips)
    .where(and(eq(trips.id, tripId), eq(trips.userId, userId)))
    .get();
}
```

**Pattern B — Ownership check (for nested resources):**
```ts
// When querying items, verify the parent trip is owned by userId
findById(userId: string, itemId: number) {
  // JOIN through place → trip to verify ownership
  // OR: check trip ownership first, then query item
}
```

Use whichever is cleaner for each query. The invariant is: **no user-owned row is returned or mutated unless the userId matches**.

---

## ROUTE HANDLER CHANGES

After creating repositories, update route handlers to:
1. Remove direct `getDb()` calls for user-scoped queries
2. Call `repository.method(req.user.id, ...)` instead
3. `req.user` is guaranteed to be set (auth middleware runs first)

The `req.user` type needs to be declared. Add to `src/backend/middleware/auth.ts` or a types file:
```ts
declare global {
  namespace Express {
    interface Request {
      user?: { id: string; clerkId: string; email: string };
    }
  }
}
```

---

## WHAT NOT TO CHANGE

- `admin.ts`, `map.ts`, `cities.ts` (city search), `shading.service.ts`, `geocoding.service.ts`, `startup.service.ts`, `seed.ts` — leave these calling `getDb()` directly
- Auth middleware (`auth.ts`) — do not modify
- Users repository (`repositories/users.ts`) — do not modify
- Schema, migrations — do not modify (Database handles those)

---

## DELIVERY REQUIREMENTS

1. Three repository files created (`trips.ts`, `places.ts`, `items.ts`)
2. All in-scope route handlers migrated to use repositories
3. `items.service.ts` user-scoped functions migrated
4. Cities carry-forward query scoped to `req.user.id`
5. `req.user` type declaration in place
6. `npm run test:backend` passes (146 tests)
7. `npm run type:check` passes

---

## BRANCHING

```bash
git checkout main && git pull   # important — get NR-03 migration first
git checkout -b feat/adl18-repository-layer
git push -u origin feat/adl18-repository-layer
gh pr create --title "feat: ADL-18 — repository layer migration (#6)" \
  --body "Closes #6\n\nMigrates all user-scoped route handlers to repository pattern.\nEvery query against trips/items/places now scopes to req.user.id.\n\nBRD N/A — ADL-18"
```

---

## COMPLETION REPORT

File to: `/workspace/jobs/COO/inbox/YYYYMMDD_HHMM-BACKEND-adl18-repository-layer.md`

Include:
- List of repository functions created
- List of route handlers migrated
- Any functions left calling getDb() directly (with justification)
- Test pass count
- PR link
