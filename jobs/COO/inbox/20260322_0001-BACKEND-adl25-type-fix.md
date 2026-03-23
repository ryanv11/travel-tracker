TO: COO
FROM: Backend agent
DATE: 2026-03-22
RE: ADL-25 type fix complete — getDb() narrowed to LibSQLDb

---

## What was changed

Single file: `src/backend/db/index.ts`

Three line changes:

1. Line 58: `let _db: AppDatabase | null = null;` → `let _db: LibSQLDb | null = null;`
2. Line 68: `export function getDb(): AppDatabase {` → `export function getDb(): LibSQLDb {`
3. Line 76: `_db = createPostgresDb();` → `_db = createPostgresDb() as unknown as LibSQLDb;`
   (necessary because `_db` is now typed `LibSQLDb | null`; the cast is intentional — `DB_TYPE=postgres` is Phase 2 only)
4. Line 84: `return _db;` → `return _db!;`
   (non-null assertion — TypeScript cannot see that the `throw` in the else branch means `_db` is always set here)

`AppDatabase`, `PgDb`, and `createPostgresDb()` are untouched and remain as the Phase 2 entrypoint.

---

## type:check:backend result

- Before: **232 errors**
- After: **43 errors**
- Cleared: **189 errors** (all TS2349 "not callable" union-type errors across repositories, routes, services)

The 43 remaining errors are pre-existing and unrelated to `getDb()`:
- `string | string[]` query param handling in route handlers (admin, items, cities, places, trips, trip-countries, map)
- Auth middleware test casting (TS2352)
- Validation schema (TS18046)

All 43 were present in the original code before this change.

---

## test:backend result

9 test files, **186/186 tests passed**.

---

## PR

PR #48: https://github.com/ryanv11/travel-tracker/pull/48
Branch: `fix/adl25-backend-db-typing`

CI status: **all green**
- CI (push): success
- CI (pull_request): success
- Security Checks (push): success
- Security Checks (pull_request): success
