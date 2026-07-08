# BACKEND — DEP-01 dependency vulnerability pass — COMPLETE

**Tracker:** DEP-01 | **Issue:** #98 | **ADL:** ADL-30 | **Branch:** `chore/dep01-dependency-pass`

## What was bumped
- `npm audit fix` (non-breaking, 23 items): @clerk/shared 4.3.2→4.25.0 (critical),
  @clerk/react 6.1.2→6.12.0 (high), vitest + @vitest/coverage-v8 4.0.18→4.1.10 (critical),
  vite 7.3.1→7.3.6, form-data 4.0.5→4.0.6, js-cookie 3.0.5→3.0.7, path-to-regexp 8.3.0→8.4.2,
  picomatch 4.0.3→4.0.5, tmp 0.2.5→0.2.7, undici 7.24.4→7.28.0, ws 8.19.0→8.21.0, yaml 2.8.2→2.9.0
  + remaining moderates. Lock-only; no major jumps; package.json ranges unchanged.
- `drizzle-orm` 0.38.4→0.45.2 (ADL-30 Decision 1, fixes GHSA-gpj5-g38j-94v9 HIGH).
  drizzle-kit untouched at exact 0.31.9; patch-package applied cleanly; `db:generate` → no
  schema changes; `db:migrate` green against scratch DB. No source-code changes needed.

## Verification
- `npm audit --audit-level=high` exits 0; drizzle-orm no longer listed.
- test:backend 462 pass, test:frontend 78 pass, test:contract 99 pass (CI-style bypass server),
  type:check:all clean.
- Live flow verified (verify skill): trip list loads with joins, POST trip 201, invalid body 400,
  duplicate category 409; frontend renders Clerk 6.12 sign-in under Vite 7.3.6, no console errors.
- ADL-30 item 5: raw constraint violation now surfaces as `DrizzleQueryError` (wrapping
  `LibsqlError`), no statusCode → error-handler still returns generic 500, unchanged behavior.

## Residuals
- 4 moderates (esbuild via drizzle-kit/@esbuild-kit) — ACCEPTED per ADL-30 Decision 2;
  recorded in `_project/security-backlog.md` v1.1 (old Deferred section superseded).
  Revisit trigger: drizzle 1.0 GA (paired orm+kit upgrade + ADL-15 patch re-verification).
