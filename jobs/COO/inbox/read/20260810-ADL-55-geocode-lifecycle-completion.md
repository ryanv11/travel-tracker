# Completion — ADL-55 GE-19 geocode status-lifecycle model (BUG-85)

**From:** Architect · **Date:** 2026-08-10 · **PR:** #503 (CI green, 18/18) · **Branch:**
`chore/adl-ge19-geocode-lifecycle` · **Status:** DESIGN complete, not merged. No production code, no
migration generated. Next gate: resolve the flagged OQs with the PO, then dispatch the OP-27
fresh-eyes **Opus** review (never Fable — userId-scoping/access boundary).

Deliverables: `jobs/architect/tech/ADL-55-geocode-status-lifecycle.md` (full) +
summary/pointer entry in `jobs/architect/tech/20260307-architecture-decisions-log.md`.

---

## LEAD: flagged open questions to resolve with the PO before the fresh-eyes review (ADL-52 refinement)

**OQ-1 (PO — HIGH; gates whether any new table exists).** What does *"remove it from their queue"*
mean? **(a)** remove the referencing place (delete/re-point → the derived query drops it; **zero new
state**), or **(b)** a soft-dismiss that keeps the place but suppresses the badge (**new per-user
`user_dismissed_cities` table**). My rec: **(a)** — it reuses existing delete/re-point, adds no
schema, and matches the BRD's own "no longer references … stops contributing" clause. This is the one
OQ that changes the schema surface, so settle it first.

**OQ-3 (COO — MEDIUM; refines shipped ADL-46 D10).** I recommend transitioning an **ambiguous**
verdict straight to `needs_attention` on the first verdict instead of consuming 4 more retries on a
deterministic answer. This is more correct (distinct-from-resolving immediately, which GE-19 wants)
and cheaper (saves 4 Nominatim calls/city), but it changes shipped ADL-46 behaviour — your call to
bless.

**OQ-4 (COO/frontend — MEDIUM).** The derived server query becomes the indicator's source of truth,
superseding the NR-06 localStorage retry queue. Rec: the frontend brief **retires** the localStorage
list (browser-bound, stale after place-deletion, not userId-safe) rather than keeping it as a second
source of truth.

**OQ-2 (PO — LOW/MED).** Confirm the five-label set is the target (finer ambiguous split —
"multiple matches" vs "couldn't confirm your region" — is deferrable).

**OQ-5 (Backend — LOW).** Endpoint path (`GET /api/geocode-queue` rec). Contract is fixed; name isn't.

---

## Decisions made and why (full reasoning + probes in the ADL)

- **D1 — one new `needs_attention` status + a nullable `geocode_cause` column.** Rejected reusing
  `unresolvable` (conflates two recoveries and two labels — two probes) and a purely-derived
  `pending AND attempts>=cap` (keeps the invalid state representable, bloats the pending index, and
  the cause isn't derivable regardless — two probes). The principle: make a stuck row
  *unrepresentable as `pending`*. Cost is one CHECK-widening migration.
- **D1a — transitions.** Ambiguous → terminal-on-first (OQ-3); the retry cap becomes an *active*
  transition inside `resolveCity` so a row never sits `pending`-at-cap.
- **D2 — re-open reuses GE-16, not a parallel path.** Primary recovery is the existing re-point
  (`PATCH /api/places/:id {city_id}`, ADL-46 D11 — verified built end-to-end, incl. `ChangeCityModal`
  frontend). The stuck row is abandoned and drops from the derived queue. Secondary in-place re-open
  for the *region-less* case extends the existing wildcard-upgrade path (one whitelist entry + a
  status/attempts/cause reset). No new endpoint, no new recovery machinery.
- **D3 — a derived userId-scoped query composing `scopeToUser(trips, userId)`** (the ADL-53/QUAL-43
  chokepoint), identical composition to `findCarryForwardItems`. Cross-user isolation is **structural**
  (the `trips` join is the ownership axis), not a droppable filter — it adds one row to the QUAL-43
  cross-tenant matrix. The brief must **not** hand-roll `eq(trips.userId, …)` (scope-guard
  build-enforced). This replaces the localStorage list as source of truth.
- **D4 — persist the cause; frontend owns the copy.** Endpoint returns `{status, cause}` codes.
- **D5 — no new module.** See below.

## R5b verdict (the probe that settled it)

**Closes as overtaken-by-events — no standalone consolidation is load-bearing for GE-19.** The
lifecycle composes with the existing name-fallback algebra via exactly two local edits inside GE-19's
own build: (1) add `needs_attention` to `findRegionlessUpgradeCandidate`'s status whitelist; (2)
`findByIdentityKey` must stay status-blind. **Settling probe:** reading `findByIdentityKey`
(`cities.ts:206-224`) — it matches on `(country, name COLLATE NOCASE, COALESCE(region,0))` with **no**
status/creator filter, so the `needs_attention` transition (which removes a row from the
`WHERE pending` partial index) cannot create a duplicate on re-add. One honest residual: that method's
doc comment still justifies its blindness by "the unique index is unconditional," which migration 0017
made stale — a same-PR doc fix, not a consolidation. The reflection's "two parallel identity models"
framing was already stale at authoring (0017 predated it), confirming the secondary audit §2.2.

## Module-boundary recommendation (audit §3.4)

**Do not create a lifecycle module.** Extract only the *policy* — a pure `nextGeocodeState(row,
verdict) → {status, attempts, cause}` — which is also the OP-35 test unit (exhaustive table test, no
DB/geocoder mocks). Keep the DB writes + Nominatim IO in `resolveCity`. Put the queue query in
`citiesRepository` beside its user-scoped siblings — **not** in `geocoding.service.ts`. Net: the
554-LOC god file grows ~net-flat. A full module is a later option if churn returns; GE-19 doesn't
justify it.

## What I'd challenge (BRD / audit)

- **BRD "how a user-supplied region re-opens a terminal record"** cleanly fits only the *region-less*
  case (wildcard-upgrade re-opens the same row). The actual observed stuck row (city 6) is already
  regioned; "supply a region" to it means picking a *different* region → a different identity → really
  a **re-point to a different city** (row abandoned), not an in-place re-open. The BRD's own "reuse
  GE-16's re-point path" already points here; I made the two-mechanism split explicit.
- **Audit §3.4's "the lifecycle will grow `geocoding.service.ts`"** is true only of the naive
  approach; D5 neutralizes it by placement + the pure extraction. The audit's instinct is right; the
  remedy is placement, not a module.
- Nothing else in the audit's GE-19 section (§1c/A3) is contradicted — its three probes reproduced.

## Migration warning for the implementing Database brief

The CHECK change forces a SQLite 12-step table rebuild (as 0017) that **regenerates
`uniq_cities_pending_per_creator` and will recur ADL-15 bug 4** (drizzle-kit splits the COALESCE
commas) — hand-correct exactly as `0017_bug75_identity_switch.sql:77-82` did. Plus a trailing backfill
(`pending AND attempts>=5 → needs_attention`, cause NULL). It lands as a **single green step** given
single-instance + migrate-before-serve + backward-compatibility with old code (all stated in §3.5);
reverts to staged expand/contract if any of those three ceases to hold.

## Guardrail notes
- OP-19/20: worktree cwd confirmed, `npm install` run, no bare `git stash`.
- Negative-findings: every "does not / only / never" claim carries two probes or `UNVERIFIED`
  (city 6's per-attempt cause is explicitly UNVERIFIED, as the tracker already noted).
- No production code, no migration generated/applied. Design only.
