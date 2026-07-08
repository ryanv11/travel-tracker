# ADL-30 — DEP-01: drizzle-orm 0.45.2 upgrade ruling & drizzle-kit residual acceptance

**Date:** 2026-07-07
**Status:** Decided
**Tracker:** DEP-01 | **GitHub:** #98
**Depends on:** ADL-15 (migrate-only workflow, drizzle-kit 0.31.9 pin + patch-package patch)

> **Numbering note:** the dispatching brief assigned this ruling the number ADL-29, but
> ADL-29 is already in use ("Security enforcement mechanisms", 2026-03-23 — see the main
> log and `.semgrep/security.yml`). This ruling is therefore ADL-30. The next free number
> after this document is ADL-31.

---

## Context

`npm audit --audit-level=high` is red on main: 26 vulnerabilities (3 critical, 10 high,
12 moderate, 1 low), accrued since the March dependency freeze (issue #98). 23 of 26 have
non-breaking fixes via `npm audit fix` and are handled by the Backend DEP-01 brief. Two
clusters are architectural and are ruled on here:

1. **drizzle-orm 0.38.4 → 0.45.2** — HIGH advisory
   [GHSA-gpj5-g38j-94v9](https://github.com/advisories/GHSA-gpj5-g38j-94v9)
   ("SQL injection via improperly escaped SQL identifiers", CVSS 7.5, patched in 0.45.2).
   Semver-major in 0.x terms (`0.38.x → 0.45.x`), so `npm audit fix` will not take it.
2. **drizzle-kit / esbuild moderate cluster** — 4 moderate findings (`drizzle-kit` ←
   `@esbuild-kit/esm-loader` ← `@esbuild-kit/core-utils` ← `esbuild <= 0.24.2`,
   advisories GHSA-67mh-4wv8-2f99 and GHSA-g7r4-m6w7-qqqr). npm's suggested "fix" is
   `drizzle-kit@0.18.1` — a downgrade to a 2023-era kit.

Constraints in force: `db:push` remains forbidden (ADL-15); drizzle-kit is pinned at
0.31.9 with the mandatory `patches/drizzle-kit+0.31.9.patch` fixing four upstream SQLite
bugs; Node runtime and CI runner versions are out of scope (standing PO guardrail).

---

## Decision 1 — drizzle-orm: upgrade to 0.45.2 **now**, inside the DEP-01 pass

### Exposure analysis (why we are *probably* safe today — and upgrade anyway)

The advisory: dialect `escapeName()` implementations did not double embedded quote
delimiters, so attacker-controlled input reaching **identifier/alias construction**
(`sql.identifier()`, `.as()`, dynamic `orderBy` column names, CTE/alias names from request
params) can break out of the quoted identifier. Applications using only static schema
objects are not affected.

Audit of our backend (`src/backend/`, non-test code, 2026-07-07):

- **Zero** uses of `sql.identifier()`, `.as()`, or `sql.raw()`.
- All `` sql` ` `` template usage is in `src/backend/db/schema.ts` — static column
  defaults, CHECK constraints, and partial-index WHERE clauses. No runtime input.
- All nine `orderBy` call sites (`repositories/trips.ts`, `routes/cities.ts`,
  `routes/admin.ts`, `routes/items-helper.ts`, `services/geocoding.service.ts`) order by
  **static column references** (`desc(trips.startDate)`, `countries.name`, …). No sort
  field is ever derived from request parameters.

So our current code does not hit the vulnerable path. **We upgrade anyway** because:

1. The CI gate `npm audit --audit-level=high` stays red as long as a HIGH residual exists.
   Accepting a HIGH means a permanent documented exception in a gate whose entire value is
   "red means act" — that erodes the gate for every future advisory.
2. "Not exposed today" is a point-in-time claim. Dynamic sorting is exactly the kind of
   feature a future brief adds casually; the vulnerable primitive should not be lying
   around beneath it.
3. The upgrade cost turns out to be **low** (see compatibility analysis below).

### Compatibility analysis — no drizzle-kit bump required

This was the decisive question: if orm 0.45.2 forced a kit bump, the ADL-15 patch
(`patches/drizzle-kit+0.31.9.patch`) would be invalidated (patch-package fails loudly) and
the four SQLite bugs would need re-verification against a new kit. Verified directly:

- drizzle-kit 0.31.9 gates on `compatibilityVersion` imported from `drizzle-orm/version`
  and requires `requiredApiVersion = 10` (see `node_modules/drizzle-kit/bin.cjs`).
- drizzle-orm **0.38.4 (current)** exports `compatibilityVersion = 10`.
- drizzle-orm **0.45.2 (target)** exports `compatibilityVersion = 10` (verified against
  the published npm tarball, `package/version.cjs`).

The orm/kit handshake is unchanged. **drizzle-kit stays pinned at 0.31.9, the patch stays
valid, ADL-15 is untouched.** Peer ranges also hold: 0.45.2 wants `@libsql/client >= 0.10.0`;
we have `^0.14.0`.

### Breaking-change survey 0.39.0 → 0.45.2 (GitHub release notes)

No SQLite/libSQL breaking changes in the range. Items reviewed:

- **0.44.0 — `DrizzleQueryError` wraps all driver errors.** The only real behavioral
  change for us. Risk assessed as low: the backend never inspects driver error codes —
  uniqueness is enforced via pre-flight SELECTs (`routes/admin.ts`,
  `repositories/places.ts`), and `middleware/error-handler.ts` distinguishes only known
  application errors from generic 500s. Any code that *did* match on
  `LibsqlError`/`SQLITE_CONSTRAINT` would break; none exists.
- **0.44.0 — cache module:** opt-in (`global: false` default); no effect.
- **0.41.0 — sql-js query-preparation change, decimal/numeric type fixes:** we use libsql,
  not sql-js; schema uses no `numeric`/`decimal` columns.
- **0.39.x / 0.40.x / 0.42.x / 0.43.x / 0.45.x:** additive features (Bun SQL, Gel dialect,
  CTE inserts, cross join, TS-enum support) and fixes in dialects we don't use.

### Ruling

**Upgrade `drizzle-orm` to `^0.45.2` in the DEP-01 Backend pass.** Not separate tracked
work — the compatibility analysis shows no kit interaction, so splitting it out would just
leave the HIGH (and the red gate) open longer for no risk reduction.

---

## Decision 2 — drizzle-kit/esbuild moderate cluster: **accept residual**, revisit at drizzle 1.0 GA

### Exposure analysis

The chain is `drizzle-kit` → `@esbuild-kit/esm-loader` → `@esbuild-kit/core-utils` →
`esbuild <= 0.24.2`. The esbuild advisory (GHSA-67mh-4wv8-2f99) concerns esbuild's **dev
server** accepting cross-origin requests. drizzle-kit uses the (deprecated) esbuild-kit
loaders solely to load `drizzle.config.ts` during CLI invocations (`db:generate`,
`db:migrate`); it never starts esbuild's serve mode. `drizzle-kit` is a devDependency,
never bundled, never present at runtime. Practical exploitability in our usage: none.

### Options considered

- **A — npm's suggested fix, `drizzle-kit@0.18.1`:** rejected outright. A massive
  downgrade predating our schema features and the migrate workflow; would also discard the
  0.31.9 pin and its patch (ADL-15 violation).
- **B — upgrade drizzle-kit forward past the esbuild-kit dependency:** no stable kit
  release currently drops the chain; the fix lands in the drizzle-kit 1.x line, which is
  still beta and pairs with drizzle-orm 1.0 beta. Taking a beta toolchain to silence four
  dev-only moderates is a worse risk trade. Any kit bump also mandates re-verifying the
  four patched SQLite bugs (ADL-15 / memory notes) — a real cost, spent only when there is
  a real benefit.
- **C — accept the residual, documented, with a revisit trigger:** chosen.

### Ruling

**Accept all four moderates as residual risk.** They are dev-only, unexploitable in our
usage, and — being moderate — do **not** fail the `npm audit --audit-level=high` CI gate,
so no gate exception is needed. Revisit trigger: when **drizzle-orm/drizzle-kit 1.0 goes
GA**, schedule a paired orm+kit major upgrade as its own tracked issue, including
mandatory re-verification of the four patched SQLite bugs against the new kit
(patch-package will fail loudly on the version change, per ADL-15).

---

## Instructions for the Backend DEP-01 implementation brief

1. **Pin:** change `package.json` → `"drizzle-orm": "^0.45.2"` (caret in 0.x permits
   patch-level only: `>=0.45.2 <0.46.0` — correct). **Do not touch**
   `"drizzle-kit": "0.31.9"` (exact pin stays).
2. **Install check:** after `npm install`, confirm postinstall output shows
   `patch-package` applying `drizzle-kit+0.31.9.patch` successfully, and
   `node_modules/drizzle-orm/package.json` reports 0.45.2.
3. **Kit handshake check:** run `npm run db:generate` — it must complete without a
   version-compatibility error and report no schema changes (any generated migration file
   from a docs-free diff is a red flag: stop and report). Run `npm run db:migrate` against
   a scratch copy of the dev DB to confirm the CLI end-to-end. `db:push` remains forbidden.
4. **Regression:** `npm run test:backend`, `npm run test:contract` (backend running),
   `npm run test:frontend`, `npm run type:check:all` — all green. Boot both dev servers
   and exercise a core flow (trip list + one write) per the verify skill.
5. **Error-handling spot check:** confirm a constraint-violating write (e.g. duplicate
   admin category name path) still returns the mapped 409/500 as before — this exercises
   the 0.44.0 `DrizzleQueryError` wrapping against `error-handler.ts`.
6. **Audit:** `npm audit --audit-level=high` must no longer list `drizzle-orm`.
7. **security-backlog.md (same PR, per document-lifecycle rule):** add/refresh an
   "npm audit — DEP-01 (2026-07-07)" section recording:
   - drizzle-orm GHSA-gpj5-g38j-94v9 — **FIXED** by upgrade to 0.45.2 (this ADL);
   - `drizzle-kit` / `@esbuild-kit/esm-loader` / `@esbuild-kit/core-utils` / `esbuild`
     (GHSA-67mh-4wv8-2f99, GHSA-g7r4-m6w7-qqqr) — **ACCEPTED (moderate, dev-only)**:
     esbuild dev-server advisory; drizzle-kit only loads config via esbuild-kit, never
     serves; not in the runtime bundle; below the `--audit-level=high` gate. Revisit at
     drizzle 1.0 GA with a paired orm+kit upgrade and ADL-15 patch re-verification.
8. **Tracker/issue hygiene:** reference `DEP-01` and `#98` in the PR; the issue closes
   only when the full pass (this + the 23 `npm audit fix` items) lands and the gate is
   green.

---

## What this ADL does NOT decide

- The 23 non-breaking `npm audit fix` items (Clerk, vite/vitest, form-data, etc.) — those
  are COO-triaged and dispatched directly; no architectural content.
- Node runtime or CI runner versions — out of scope (standing PO guardrail).
- The eventual drizzle 1.0 orm+kit migration — a future ADL when 1.0 is GA.
