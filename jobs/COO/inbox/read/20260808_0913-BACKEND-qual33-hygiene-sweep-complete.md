# BACKEND — QUAL-33 code-hygiene sweep — COMPLETE

PR: https://github.com/ryanv11/travel-tracker/pull/432 (`chore/qual33-backend-hygiene` → `main`)
CI: all 18 checks green (`scripts/ci-wait.sh pr 432` → PASS)
Not merged (per brief — COO merges).

## Per-item disposition

**U2 — false comment (server.ts header).** Done. "5. auth stub (SEC-09)" → "5. auth —
requireAuth verifies Clerk JWTs via JWKS, applied globally (SEC-09)". Verified
`app.use('/api/', requireAuth)` at server.ts:198 gates every `/api/` route.

**U3 — false semgrep comment.** Done. Rewrote the rule-2 TODO comment: live shading
queries in `shading.service.ts` ARE user-scoped via JOIN (`eq(trips.userId, userId)`
inside `.leftJoin(...)`), not unscoped — confirmed by reading every query in the file.
Comment-only change; the `rules:` block (patterns/message/severity/paths) is
byte-for-byte unchanged; no suppression added or widened (OP-30 compliant).

**U4 — dead code, shading.service.ts.** Done, two probes per deletion:
- `getCityShading` — 0 callers. Probe 1: grepped `getCityShading` across `src/`, only
  the definition matched. Probe 2: read `routes/map.ts` (the only route file that
  imports from this service) — it imports `getAllCountryShading`, `getCountryShading`,
  `getRegionShading`, not `getCityShading`. **Correction to the audit doc**: the audit
  (`audits/session-b-code-safety.md`) claims this function is *unscoped* — that's now
  stale. Reading the current function body shows it takes `userId` and joins on
  `eq(trips.userId, userId)` (ADL-28 R1 already fixed this before the audit's finding
  was acted on). It was dead, but correctly scoped. Removed as dead code only; did not
  cite it as a scoping fix.
- `_coverage` param on `computeCountryState` — function body never referenced it.
  Probe 1: read the function body. Probe 2: the pre-existing test file already had a
  test literally titled "coverage parameter is ignored — same result with or without
  coverage", independently confirming the same fact before I touched anything.
- `getRegionCoverageMap` — its only consumer was the now-dead `_coverage` param;
  removing it drops one full extra query from every `getAllCountryShading` /
  `getCountryShading` call (was previously computed and discarded).
- `*Unregioned` SQL aggregates in `countrySelectShape` — 3 extra `CASE WHEN`
  expressions per query, confirmed never read by `computeCountryState`'s body.

Rewrote `shading.service.test.ts`'s `computeCountryState()` suite in full (**Write, not
Edit** — declaring per CLAUDE.md's source-rewrite rule) to drop the now-invalid second
argument from every call and the Unregioned fixture fields. Small, fully-owned test
file, not a shared-record file; the rewrite was a mechanical consequence of the U4
signature change (every test case needed one line changed). All prior test *cases*
(state combinations covered) preserved; only the dead-parameter plumbing removed.

**U5 — unused CORS credentials.** Done. Removed `credentials: true` + "Reserved for
Phase 2 session cookies" comment from `server.ts`, and the identical flag from its
test-harness mirror `server-test-app.ts` (that file's own docstring states its purpose
is to exercise the identical pipeline as `server.ts`, so left it out of sync would have
been wrong). Confirmed no cookie reliance via grep: no `cookie-parser`, `req.cookies`,
`res.cookie(` anywhere in `src/`, and no frontend fetch uses
`credentials: 'include'`/`withCredentials`. **One item beyond the brief's literal
scope, flagging for visibility**: also removed an adjacent stale comment on the same
CORS block, `// Authorization reserved for Phase 2`, on the `allowedHeaders` line —
Authorization is actively used today (Clerk header-based auth, confirmed via grep
showing `Authorization` header usage in `apiClient.ts`/`main.tsx`), not reserved. Same
false-comment class as U2/U3, directly adjacent to the line I was already touching;
flagging so this can be double-checked as a deliberate small addition, not scope creep
that hid something.

**U6 — vestigial dynamic imports.** Done for `items.ts` (4 call sites: lines ~47, 66,
147, 184 per brief, now static `and`/`eq`). **Brief drift noted**: `trips.ts` has no
dynamic imports — grepped `import(` in the file (no match) and read its import block
(already fully static `and, desc, eq` from drizzle-orm at the top). Left untouched,
nothing to fix there.

**U11 — dead eslint-disable directives.** Done. Removed from `auth.ts:28` and
`error-handler.ts:25`. Verified two ways: no `.eslintrc*`/`eslint.config.*` file
anywhere in the repo, and no `eslint` package in `package.json` dependencies (`lint`
script is `biome lint src/`).

**U12 — dead branch, cities.ts.** Done. `useRatingSort` ternary's false-branch and the
true-branch's `sort_order !== 'asc'` case both evaluated to `desc(effectiveRatingSql)`.
Collapsed to `useRatingSort && sort_order === 'asc' ? asc(...) : desc(...)`. Verified
behaviourally identical across all 4 input combinations before changing.

## Security checklist (server.ts/auth-adjacent + semgrep)

1. U5 removal does not affect auth — Clerk is Authorization-header based, not
   cookie-based; confirmed no cookie reliance anywhere in the app (backend or
   frontend).
2. U3 is comment-only — semgrep rule logic (patterns, message, severity, paths)
   unchanged; no suppression added or widened.
3. No route auth changed by this sweep — `requireAuth`/`requireOwner` placement
   untouched everywhere.

## Verification

- `npm run check` (Biome) — 0 errors, exit 0 (5 pre-existing info-level suggestions in
  an unrelated geocoding test file — out of scope, not touched, flagged to whichever
  agent owns that file)
- `npm run type:check:all` — clean
- `npm run test:backend` — 759/759 passed
- `npm run test:frontend` — 321/321 passed
- `npm run status:check` — up to date
- CI on PR #432 — 18/18 checks green

## Not touched (per brief)

`requireAuth` catch-all swallow, `DB_TYPE=postgres` scaffolding, transaction-convention
question, `asyncHandler`, routes→repo layering, `buildApp()` factory. Did not edit
`_project/tracker.json` (left for COO per brief, avoiding collision with the 3 other
parallel sweeps).

## Files touched

- `.semgrep/security.yml`
- `src/backend/server.ts`
- `src/backend/server-test-app.ts`
- `src/backend/middleware/auth.ts`
- `src/backend/middleware/error-handler.ts`
- `src/backend/repositories/items.ts`
- `src/backend/routes/cities.ts`
- `src/backend/services/shading.service.ts`
- `src/backend/services/__tests__/shading.service.test.ts` (full rewrite, declared above)
