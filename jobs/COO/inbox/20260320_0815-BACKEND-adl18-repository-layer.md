TO: COO
FROM: BACKEND
DATE: 2026-03-20 08:15
RE: ADL-18 — Repository Layer Migration — COMPLETE

---

## STATUS

DONE. All delivery requirements met. PR #17 open, CI in progress.

---

## REPOSITORY FUNCTIONS CREATED

### `src/backend/repositories/trips.ts` — `tripRepository`
- `findAll(userId, filters?)` — returns all trips owned by userId, with category/activity post-filtering
- `findById(userId, tripId)` — returns trip or null (ownership check via WHERE userId)
- `findByIdOrThrow(userId, tripId)` — throws NotFoundError if not found
- `create(userId, data)` — inserts trip with userId set
- `update(userId, tripId, data)` — updates scalars, ownership enforced in WHERE
- `delete(userId, tripId)` — hard-deletes, ownership enforced in WHERE
- `getAssociations(tripId)` — fetches categories/companions/activities (junction tables, trip already scoped)
- `replaceAssociations(tripId, ...)` — delete+reinsert M2M associations
- `getPlaces(tripId)` — fetches trip_places with city JOIN

### `src/backend/repositories/places.ts` — `placeRepository`
- `findByTrip(userId, tripId)` — verifies trip ownership, returns places with activities
- `findById(userId, placeId)` — JOIN through trip to verify ownership
- `create(userId, tripId, cityId)` — verifies writable, checks for duplicate, inserts with userId
- `delete(userId, tripId, placeId)` — verifies writable, deletes
- `assertWritable(userId, tripId)` — throws NotFoundError or LockError if trip is not writable by user

### `src/backend/repositories/items.ts` — `itemRepository`
- `findByTrip(userId, tripId, filters?)` — scoped to userId, delegates to fetchItemsWithExtensions
- `findById(userId, itemId)` — scoped to userId via items.userId
- `findRawByIdOrThrow(userId, tripId, itemId)` — verifies ownership, throws NotFoundError
- `create(userId, tripId, data, extensionBody)` — inserts with userId, calls insertExtension
- `update(userId, tripId, itemId, data, extensionBody, itemType)` — ownership in WHERE, calls updateExtension
- `delete(userId, tripId, itemId)` — ownership in WHERE
- Internal: `insertExtension(itemId, itemType, body)` — moved from items.ts route
- Internal: `updateExtension(itemType, itemId, body)` — moved from items.ts route, includes lazy experience extension

---

## ROUTE HANDLERS MIGRATED

| File | Change |
|------|--------|
| `routes/trips.ts` | All 8 handlers use `tripRepository`. No direct `getDb()` for user data. |
| `routes/places.ts` | All 6 handlers use `placeRepository`. |
| `routes/items.ts` | All 4 handlers use `itemRepository`. Extension helpers moved to repository. |
| `routes/cities.ts` | `GET /:id/carry-forward` scoped to `req.user.id` via `eq(trips.userId, userId)`. |

---

## SERVICES MIGRATED

### `services/items.service.ts`
- `executeCarryForward` — now accepts optional `userId` param and sets it on newly created items.
- `assertNotLocked` — unchanged (no userId scoping; caller must verify ownership before calling).
- `ensureExperienceExtension` — unchanged.

---

## FUNCTIONS STILL CALLING getDb() DIRECTLY (with justification)

| File | Justification |
|------|---------------|
| `routes/trips.ts` | `getDb()` for place activities query (junction table, not user-scoped; trip already userId-scoped) |
| `routes/places.ts` | `getDb()` for city existence check, activity dedup, carry-forward source item validation — these are global/structural checks, not user-owned data |
| `routes/cities.ts` | All city/country/region operations are global (out-of-scope per brief). Carry-forward is now userId-scoped via query condition. |
| `routes/admin.ts` | Out of scope per brief — global config. |
| `routes/map.ts` | Out of scope per brief — global map state. |
| `services/items.service.ts` | `assertNotLocked` and `ensureExperienceExtension` are structural helpers; callers verify ownership first. |
| `services/shading.service.ts` | Out of scope per brief. |
| `services/geocoding.service.ts` | Out of scope per brief. |
| `services/startup.service.ts` | Out of scope per brief. |

---

## req.user TYPE DECLARATION

Already existed in `src/backend/middleware/auth.ts` (added by NR-14). No changes needed.

---

## TEST RESULTS

```
Test Files: 6 passed (6)
Tests:      146 passed (146)
```

Two test files were updated to seed a `users` row matching `req.user.id = 'test-user-id'` and assign `userId` on seeded trips — required because the repository now enforces userId scoping in queries.

---

## PR

https://github.com/ryanv11/travel-tracker/pull/17

CI status (final):
- Push CI (type check, backend tests, frontend tests, contract tests): PASS
- Push Security (npm audit, Gitleaks, Semgrep): PASS
- PR CI: PASS
- PR Security: FAIL — Gitleaks "Resource not accessible by integration" (GitHub permissions issue on PR events). Pre-existing infrastructure bug — not caused by this change. The push-triggered Gitleaks scan passed cleanly.

Additional fix committed: `server.ts` seeds the BYPASS_AUTH test user (`test-user-00000000-0000-0000-0000-000000000000`) at startup when `BYPASS_AUTH=true`. This was needed because libSQL enforces FK constraints by default, and the bypass middleware sets a fixed user ID without creating a DB row.

---

## FILES CHANGED

**New:**
- `src/backend/repositories/trips.ts`
- `src/backend/repositories/places.ts`
- `src/backend/repositories/items.ts`

**Modified:**
- `src/backend/routes/trips.ts`
- `src/backend/routes/places.ts`
- `src/backend/routes/items.ts`
- `src/backend/routes/cities.ts`
- `src/backend/services/items.service.ts`
- `src/backend/routes/__tests__/trips.delete.test.ts`
- `src/backend/routes/__tests__/cities.carry-forward.test.ts`
