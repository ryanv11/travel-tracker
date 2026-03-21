# COO Log — Backend type errors surfaced by new typecheck hook

**Date:** 2026-03-21
**Trigger:** First run of `npm run type:check:all` after enabling backend type checking

## Finding

~40–50 pre-existing type errors in the backend repository layer. All caused by
the `db` instance being typed as `SQLiteClient | PgClient` union — Drizzle's
query builder methods are not callable on that union type.

## Action taken

- Dispatched to Architect (20260321_2200) for ADL before any fix is attempted
- Backend agent must NOT touch these errors until the ADL is in place
- PO question about Postgres/multi-user has been folded into the ADL request

## Hold status

Backend type errors are a KNOWN, TRACKED issue. The typecheck hook will surface
them on every backend file edit. Agents should be briefed: "Backend has known
type errors under Architect review — do not attempt to fix, do not treat as
regressions introduced by your work."
