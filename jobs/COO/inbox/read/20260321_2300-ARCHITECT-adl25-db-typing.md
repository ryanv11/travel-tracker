TO: COO
FROM: Architect
DATE: 2026-03-21
RE: ADL-25 complete — backend db typing decision; backend agent unblocked

---

## Decision summary

ADL-25 has been appended to `/workspace/jobs/architect/tech/20260307-architecture-decisions-log.md`.

**Option A — narrow `getDb()` to return `LibSQLDb` now.**

This clears all ~40–50 type errors. The backend agent can proceed immediately.

---

## Key findings

### Option C is not viable

I examined Drizzle ORM's type definitions directly in `node_modules/drizzle-orm/`.

- `LibSQLDatabase` extends `BaseSQLiteDatabase<'async', ResultSet, TSchema>` (sqlite-core hierarchy)
- `NodePgDatabase` extends `PgDatabase<NodePgQueryResultHKT, TSchema>` (pg-core hierarchy)
- These two hierarchies have **no shared callable ancestor**. There is no `AnyDatabase`, `BaseDatabase`, or dialect-agnostic type in Drizzle that would allow calling `.select()`, `.insert()` etc. on a variable typed as "either."

Option C is ruled out — not deferred, ruled out.

### Postgres migration timeline: indefinite (Phase 2)

The iOS scope decision (2026-03-11) says "Drizzle schema should target both SQLite and Postgres/Turso." This is a **schema design constraint**, not a runtime typing constraint. It means the table definitions in `schema.ts` must be re-expressible in Postgres when Phase 2 arrives — which they already are (same column names, only builder imports change). It does not mean the runtime `getDb()` must support both dialects today.

There is no Phase 2 deployment, no Postgres instance, and no near-term work item that requires a live Postgres connection. Paying the Option B abstraction cost against an untested second implementation would create the illusion of portability without the substance.

### Option B is deferred, not rejected

Option B (typed repository interface) is the correct architecture if dual-dialect support is required simultaneously. When Phase 2 begins and a Postgres instance exists, the ADL-18 repository layer is exactly the right seam to introduce it. That is the correct sequencing.

---

## What the backend agent must do

One change to `src/backend/db/index.ts`:

```typescript
// Before:
let _db: AppDatabase | null = null;
export function getDb(): AppDatabase { ... }

// After:
let _db: LibSQLDb | null = null;
export function getDb(): LibSQLDb { ... }
```

That is the complete fix. The `AppDatabase` union alias, `PgDb` alias, and `createPostgresDb()` function should remain in the file unchanged — they are the Phase 2 entrypoint and should not be deleted.

All ~40–50 type errors across `repositories/items.ts`, `repositories/trips.ts`, `repositories/users.ts`, `repositories/places.ts`, `routes/admin.ts`, `db/seed.ts`, and `middleware/__tests__/auth.test.ts` will clear automatically, because every one of them is downstream of `getDb()`'s return type.

No other files need to change for the type errors to resolve.

---

## ADL location

`/workspace/jobs/architect/tech/20260307-architecture-decisions-log.md` — appended as ADL-25 after ADL-23.

Note: ADL-24 (place date ranges, 2026-03-20) exists as a separate tech file at
`/workspace/jobs/architect/tech/ADL-24-place-date-ranges.md` and has not been merged
into the main ADL log. That is a housekeeping item for the COO if desired — it does
not affect the ADL-25 work.
