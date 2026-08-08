TO: Architect
FROM: COO
DATE: 2026-03-21
RE: Backend type errors — Drizzle dual-database typing decision required before fix

---

## What was found

Enabling `tsc -p tsconfig.backend.json --noEmit` (new as of today — backend was never
type-checked) revealed a large class of pre-existing type errors across the repository
layer. All errors follow the same pattern:

```
src/backend/repositories/trips.ts(X,Y): error TS2349: This expression is not callable.
  Each member of the union type
  '(<TTable extends SQLiteTable>...) | (<TTable extends PgTable>...)'
  has signatures, but none of those signatures are compatible with each other.
```

Affected files: `repositories/items.ts`, `repositories/trips.ts`,
`repositories/users.ts`, `repositories/places.ts`, `routes/admin.ts`,
`db/seed.ts`, `middleware/__tests__/auth.test.ts`.

The errors are caused by the `db` instance being typed as a union of the Drizzle
SQLite and Postgres clients. TypeScript cannot call methods on a union type when
the two members' call signatures don't intersect — which they don't for Drizzle's
query builder methods.

## Why a fix needs an ADL first

The iOS/hosting architecture decision (2026-03-11) explicitly requires the schema
to target both SQLite (dev/local) and Postgres/Turso (cloud/multi-user). The
dual-database Drizzle setup is intentional — but it is currently untypeable as
written.

There are at least three fix strategies, and they have different architectural
implications:

**Option A — Narrow to SQLite now, migrate cleanly to Postgres later**
Type `db` as the SQLite client only. Remove Postgres from the type union for now.
When the Postgres migration happens, it becomes an explicit cutover with full
type-checking at that point. Simple, clean, honest about current reality.

**Option B — Typed abstraction layer**
Introduce a typed repository interface that both SQLite and Postgres implementations
satisfy. The `db` instance is never exposed directly; callers use the interface.
Preserves dual-db capability with full type safety. Higher upfront complexity.

**Option C — Generic Drizzle db type**
Use Drizzle's `BaseSQLiteDatabase` / generic db type that covers both dialects,
if one exists that satisfies the call sites. Depends on what Drizzle's type system
actually supports — needs validation.

## The multi-user / Postgres migration question

The PO has raised the question of whether Postgres is needed for multi-user support.
This is directly relevant to which option above is correct:

- If SQLite → Postgres migration is Phase 2 work (near-term, planned): Option B
  or C is correct — invest in the abstraction now.
- If the migration timeline is indefinite / aspirational: Option A is correct —
  don't pay the abstraction cost until the migration is real.
- If the decision is to commit to Postgres now (skip SQLite in production):
  Option A collapses to "just use Postgres types" and the dual-db concern goes away.

## Request

Please produce an ADL covering:
1. The intended database migration timeline (SQLite → Postgres/Turso)
2. Whether dual-db type support is required now or deferred
3. Which fix strategy is correct given that timeline
4. Any Drizzle-specific type patterns the backend agent should use

The backend type errors should not be fixed until this ADL is in place. A backend
agent attempting to silence the errors without architectural guidance will either
over-engineer or make the migration harder.

## Scope of errors (for sizing)

Approximately 40–50 type errors across 7 files. All are the same root cause —
no unique bugs, just one architectural issue manifesting everywhere the `db`
instance is used. Once the correct typing approach is decided, a single backend
agent pass should clear all of them.
