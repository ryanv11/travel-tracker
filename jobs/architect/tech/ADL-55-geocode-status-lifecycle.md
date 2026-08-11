# ADL-55 — GE-19 geocode status-lifecycle model (BUG-85)

**Date:** 2026-08-10 · **Author:** Architect · **Status:** DESIGN — pending (a) resolution of the
flagged open questions §1, (b) OP-27 fresh-eyes Opus review, (c) implementation. **No production
code, no migration generated or applied.** This ADL specifies a migration; it does not run
`db:generate` / `db:migrate`.
**Tracker:** BUG-85 · **BRD:** GE-19 (v3.20, approved, Architect-gated) · **Absorbs:** R5b
(design-reflection secondary audit §1b) · **Reuses:** GE-16 re-point (ADL-46 D11), the QUAL-43
scoping chokepoint (ADL-53 `repositories/scope.ts`), the wildcard-upgrade path
(`cityIdentityService.findOrUpgradeCity`).
**Class (OP-32):** gap · **ATDD-first (OP-35):** the *build* is ATDD-first; §7 lists the acceptance
criteria QA turns into the red bar.

> This ADL will be cited by an implementation brief and gets a fresh-eyes Opus review. It is written
> to be stress-tested: every load-bearing "does not / only / never" claim carries the probe(s) that
> settle it, and every genuinely PO- or COO-level call is flagged in §1 rather than buried.

---

## 0. Summary table

| # | Decision | Ruling | Confidence |
|---|----------|--------|------------|
| **D1** | Terminal-state model | **One new status value `needs_attention` (additive to the CHECK) + one new nullable `geocode_cause` column** ∈ {`ambiguous`,`unreachable`}. NOT reuse of `unresolvable`; NOT a purely-derived predicate. | High |
| **D1a** | Transition timing | **Ambiguous → `needs_attention` on the FIRST ambiguous verdict** (not after burning 5 retries — ambiguity is deterministic). Unreachable → stays `pending`+`cause=unreachable`, retries; at the cap → `needs_attention`+`cause=unreachable`. This **refines ADL-46 D10** — flagged (OQ-3). | Medium |
| **D2** | Re-opening a terminal record | **Primary = GE-16 re-point (reused, not reinvented):** `PATCH /api/places/:id {city_id}` points the place at the correct city; the stuck row is abandoned and drops from the derived queue. **Secondary (region-less case) = the existing wildcard-upgrade path, extended** to admit `needs_attention` and reset it to `pending`/attempts 0/`cause` null + re-fire. No new endpoint. | High |
| **D3** | Queue visibility | **A derived, userId-scoped server query, NOT a maintained client list.** New read composing `scopeToUser(trips, userId)` — same pattern as `findCarryForwardItems`. Cross-user isolation is structural (the `trips` join is the ownership axis), not a filter that can be forgotten. Retires the NR-06 localStorage list as source of truth. | High |
| **D4** | Cause labelling | **Persisted in `geocode_cause`** (not fully derivable — two probes §3). Endpoint returns stable `status`+`cause` codes; the **frontend** owns the display copy so wording changes need no backend deploy. | High |
| **D5** | Module boundary | **No new "lifecycle module."** Extract only the *policy* as a pure function `nextGeocodeState(row, verdict) → {status, attempts, cause}` (trivially table-testable — serves OP-35); leave DB writes + geocoder IO in `resolveCity`; the queue query lands in `citiesRepository`, where sibling user-scoped city reads already live. Net growth of the 554-LOC `geocoding.service.ts` is ~3 small branches. | Medium-High |
| **R5b** | Name-fallback consolidation | **Not load-bearing for GE-19; closes as overtaken-by-events.** The lifecycle composes with the existing identity algebra via exactly two local edits (both inside GE-19's own build). Probe: `findByIdentityKey` is status-blind. | High |

---

## 1. Flagged open questions — resolve these BEFORE the fresh-eyes review (ADL-52 refinement)

These are the calls that are not mine to make silently. I state a recommendation for each; the PO/COO
decides, and the reviewer should receive a settled spec.

**OQ-1 (PO — product; HIGH, determines whether any new table exists).**
What does *"remove it from their queue"* (BRD GE-19) mean?
- **(a) Remove the reference** — the user deletes or re-points the referencing place; the city drops
  from the derived queue automatically because nothing of theirs references it. **No new persisted
  state.** Matches the BRD's own sentence *"a pending city the user's account no longer references
  (all referencing places deleted) stops contributing."*
- **(b) Soft-dismiss** — the user keeps the place (the city stays unresolved, still no map pin) but
  suppresses the indicator. This requires a **new per-user `user_dismissed_cities` table** (userId +
  cityId), cross-user-safe but new state and a new write path.
- **Recommendation: (a).** It reuses the existing delete/re-point paths, adds zero schema, and is
  exactly what the BRD's "no longer references" clause describes. (b) re-introduces the localStorage
  `dismiss()` semantics as server state; I do not think the PO's *"I wouldn't even know what to
  delete or edit"* asks for a hide-without-fixing — it asks to *see and act*. But this is a product
  call and it gates a table, so it must be settled first.

**OQ-2 (PO — product; LOW-MEDIUM).**
Label granularity. My model persists `cause ∈ {ambiguous, unreachable}`, yielding five plain-language
labels (§4). The finer ambiguous split that `classifyCandidates` already computes in-memory
(`multi-region` = "several matching regions" vs `region-unconfirmed` = "we couldn't confirm the
region you chose") is **not** persisted. Recommendation: ship the five-label set for v1; the finer
split is a later `cause` value if the PO wants distinct copy. Confirm five labels is the target.

**OQ-3 (COO / Architect — refines shipped ADL-46 D10; MEDIUM).**
D1a transitions an **ambiguous** verdict straight to `needs_attention` instead of consuming the retry
budget. ADL-46 D10/F1 (`geocoding.service.ts:484-495`) deliberately *consumes* the budget on
ambiguous ("a bounded question, re-askable if the row's region_id later changes"). My change keeps
the re-askability (the re-open path resets attempts) but stops spending four retries on a
**deterministic** answer (the identical name+region query returns the identical ambiguous verdict —
verified by reading `classifyCandidates`, which is a pure function of its inputs). Recommendation:
adopt — it is both more correct (distinct-from-resolving *immediately*, which the BRD wants) and
cheaper (saves four 1-req/s Nominatim calls per ambiguous city). But it changes shipped behavior, so
I flag it rather than bury it.

**OQ-4 (COO / frontend scope; MEDIUM).**
D3 makes the server query the **source of truth** for the indicator, superseding the NR-06
localStorage retry queue (`geocodeRetryQueue.ts`). Recommendation: the frontend brief **retires** the
localStorage list (it is browser-bound, survives place-deletion staleness, and cannot be userId-safe)
and replaces it with a poll of the new endpoint. The alternative — keep localStorage as a secondary
cache — creates two sources of truth for one badge and should be rejected. Confirm the frontend brief
may remove NR-06's localStorage machinery.

**OQ-5 (Backend/COO — mechanical; LOW).**
Endpoint path. I specify the *contract* (§5); the path (`GET /api/geocode-queue` vs
`GET /api/cities/pending-queue` vs a sub-route of the existing `geocode.ts`) is a naming call for the
Backend brief. Recommendation: `GET /api/geocode-queue` (it is neither a single-city read nor the
Nominatim proxy).

---

## 2. Problem, verified from ground truth (probed today, not inherited)

BUG-85: a city that cannot auto-resolve is left **`pending` forever**, silently dropped from the
processing scan but still counted as in-progress by the badge, with no user visibility or recovery.

- **Probe 1 (schema, `schema.ts:151-154`):** `chk_cities_geocode_status` admits exactly
  `('pending','resolved','unresolvable')`. There is **no terminal retry-exhausted state** — corroborated
  by the tracker BUG-85 independent probe (a second probe that fails differently: reading the CHECK vs.
  the tracker's staging DB inspection of city id 6).
- **Probe 2 (server, `geocoding.service.ts:532-538`):** `processQueue` selects
  `WHERE geocode_status='pending' AND geocode_attempts < GEOCODE_ATTEMPT_CAP` (cap = 5). A capped row is
  never re-selected but stays `pending` — a passive drop, not a state transition.
- **Probe 3 (client, `geocodeRetryQueue.ts:164-174`):** the localStorage queue removes an entry only on
  `resolved` or a 404; a capped-`pending` **or** an `unresolvable` city badges forever.
- **Probe 4 (why `pending`, not `unresolvable`):** the only branch that leaves a row `pending` after the
  geocoder answers is the ambiguous branch (`geocoding.service.ts:484-495`) — it `incrementAttempts` and
  stays `pending`. So the stuck class is dominated by **ambiguous, budget-exhausted** rows. (city 6's
  exact per-attempt cause is `UNVERIFIED` per the tracker — the log window rotated out — but the
  *mechanism* is code-verified and the *fix* is cause-agnostic.)

The genuine data-model defect is narrow: **a stuck row is still literally `pending`.** Everything else
GE-19 wants (visibility, causes, recovery, scoping) is query/UX built on top of fixing that.

---

## 3. D1 — the terminal-state model

### 3.1 Ruling

Add **one** status value and **one** column:

1. `geocode_status`: add **`needs_attention`** → CHECK becomes
   `IN ('pending','resolved','unresolvable','needs_attention')`.
2. New column **`geocode_cause TEXT`** (nullable), CHECK `geocode_cause IN ('ambiguous','unreachable')
   OR geocode_cause IS NULL`.

The four statuses:

| status | meaning | in pending index? | user bucket |
|--------|---------|-------------------|-------------|
| `pending` | actively resolving / retrying | yes | in-progress |
| `resolved` | coordinates confirmed | no | (hidden) |
| `unresolvable` | geocoder answered "no match" / carried OSM ref gone — terminal (ADL-46 D10, unchanged) | no | needs-attention |
| `needs_attention` | **new** — retry-exhausted or ambiguous; user action required | **no** | needs-attention |

`geocode_cause` splits the two states where one status maps to two labels: `pending`
(null = "Resolving…" vs `unreachable` = "Couldn't reach — retrying") and `needs_attention`
(`ambiguous` = "Needs region" vs `unreachable` = "Gave up — couldn't reach").

### 3.2 Transitions (D1a) — the state machine

Extracted as a **pure function** `nextGeocodeState(current, verdict) → { status, attempts, cause }`
(see D5), called by `resolveCity`:

| verdict from the geocoder | next status | attempts | cause |
|---|---|---|---|
| `ok` (single confident candidate) | `resolved` | — | `null` (cleared) |
| `no_match` (geocoder answered, zero usable) | `unresolvable` | — | `null` |
| carried OSM ref no longer a settlement (M-B) | `unresolvable` | — | `null` |
| **`ambiguous`** (multi-region / region-unconfirmed) | **`needs_attention`** | unchanged | **`ambiguous`** |
| `unreachable` (recoverable: network/timeout/5xx/429) **and** `attempts+1 < cap` | `pending` | `+1` | `unreachable` |
| `unreachable` **and** `attempts+1 >= cap` | **`needs_attention`** | `+1` | `unreachable` |
| `disabled` (GEOCODING_ENABLED=false / global) | unchanged | unchanged (D10: no increment) | unchanged |

Two changes vs. today, both deliberate:
- **Ambiguous is terminal-on-first-verdict** (OQ-3), not budget-consuming. Deterministic answer ⇒
  retrying is waste.
- **The cap becomes an active transition** inside `resolveCity` (increment-then-check), not a passive
  `WHERE attempts < cap` drop. A row therefore never sits `pending`-at-cap. `processQueue`'s
  `attempts < cap` predicate **stays** as defense-in-depth (belt-and-braces; costs nothing).

### 3.3 Re-open transitions (see D2 for the trigger)

| from | to | resets |
|---|---|---|
| `needs_attention` (region-less, via wildcard-upgrade) | `pending` | `attempts=0`, `cause=null`, `region_id` set, re-fire `resolveCity` |
| `unresolvable` (region-less, via wildcard-upgrade) | `unresolvable` (unchanged) | `attempts=0`, `region_id` set, **no** re-fire (ADL-46 §2.5 asymmetry: a no-match cannot become a match by adding a region — verified against the existing `findOrUpgradeCity` §2.5 comment) |

### 3.4 Why this model — alternatives considered and rejected

- **Reject reusing `unresolvable` for retry-exhausted.** Two probes that fail differently:
  (i) `unresolvable` is documented and coded as "geocoder answered: no match — terminal, never
  retried" (`schema.ts:114-115`, `geocoding.service.ts:12-16`); (ii) the recovery semantics differ —
  "supply a region → re-resolve" is meaningful for ambiguous-exhausted and meaningless for a no-match,
  and the labels differ ("Needs region" vs "Not found"). Reusing would force a second discriminator
  column anyway, saving nothing while conflating two recoveries.
- **Reject a purely-derived stuck state** (`pending AND attempts>=cap`, no schema change). It is
  cheaper (no CHECK migration) and the *re-scan* behavior is already correct — but: (i) the BRD's hard
  "**not counted silently alongside** cities actively resolving" is then a query-discipline invariant
  every reader must remember, instead of a structural one (a stuck row would still be `geocode_status
  = 'pending'` to every naive reader); (ii) stuck rows would accumulate in `idx_cities_geocode` (the
  partial index whose entire purpose is a tight `processQueue` scan) — "fine at two users" is not a
  justification (memory: don't-architect-for-current-user-base); (iii) the cause is not derivable
  regardless (below), so a column is coming anyway. Making the invalid state **unrepresentable** (a
  stuck row is *not* `pending`) is the senior call at the cost of one CHECK-widening migration.
- **Reject two new statuses (`needs_region` + `unreachable_exhausted`) with no cause column.** It
  supports only four labels — it cannot distinguish a fresh `pending` from a `pending` whose last
  attempt hit a connection error, so it drops the BRD's fifth example label ("Couldn't reach —
  retrying"). The `status`+`cause` pair delivers all five and future-proofs finer causes without a
  second status migration.

**Cause is not derivable from existing columns — two probes that fail differently:**
(i) `CityResolution.reason`'s doc comment states verbatim it is *"Not persisted anywhere"*
(`geocoding.service.ts:88-93`); (ii) the cities table has no reason/cause column — the full column
list is id, country_code, region_id, name, latitude, longitude, geocode_status, geocode_attempted_at,
geocode_attempts, created_by_user_id, created_at, updated_at, osm_type, osm_id, display_name
(`schema.ts:105-142`). `geocode_attempts` counts **both** ambiguous verdicts and recoverable errors
(both call `incrementAttempts`), so `(status, attempts)` alone cannot tell "needs region" from
"couldn't reach." Persisting the cause is required, not optional.

### 3.5 Migration shape (specified, not generated) — ADL-47 + ADL-15 warnings

A CHECK change has no SQLite `ALTER`; drizzle-kit emits the **12-step table rebuild** (`__new_cities`
+ `INSERT…SELECT` + drop/rename + index recreation) — exactly the shape migration 0017 used.
Consequences the Database engineer **must** handle:

1. **ADL-15 bug 4 will recur.** The rebuild regenerates `uniq_cities_pending_per_creator`, whose
   `COALESCE(region_id, 0)` / `COALESCE(created_by_user_id, '')` expressions drizzle-kit **splits on
   their internal commas** into bogus quoted identifiers (0017 hand-corrected exactly this — see
   `0017_bug75_identity_switch.sql:77-82`). The generated SQL for that one index must be hand-corrected
   and verified against `schema.ts`.
2. **New column + CHECK** go into `__new_cities`; the `INSERT…SELECT` carries existing columns
   (`geocode_cause` defaults NULL for existing rows).
3. **Backfill** as an explicit trailing statement:
   `UPDATE cities SET geocode_status='needs_attention' WHERE geocode_status='pending' AND
   geocode_attempts >= 5;` — cap literal 5 is point-in-time-correct for a migration. Backfilled rows
   get `geocode_cause = NULL` (their historical cause is **UNVERIFIED** — we do not assert
   `ambiguous`; the null-cause `needs_attention` label §4 is a deliberate generic). Both staging and
   prod hold disposable data and the one known stuck row (city 6) is orphaned (0 trip_places), so
   backfill risk is low — but it must still be correct for any real referenced row.

**ADL-47 staging:** although a CHECK change is "breaking" in the ADL-47 sense, this lands as a **single
green step**, not a multi-PR expand/contract, because all three conditions hold and must be stated:
(i) Railway is **single-instance**; (ii) `start` = `drizzle-kit migrate && tsx server.ts`, so the
migration completes **before** any new code serves (`package.json:13`); (iii) every schema change is
backward-compatible with the *old* code too — old `processQueue` simply never selects a
`needs_attention` row, old search treats it like `pending`/`unresolvable` (creator-scoped), old
`findRegionlessUpgradeCandidate` just won't upgrade it yet. The one ordering invariant — the migration
must precede any code that writes `needs_attention` — is guaranteed by the start script. If any of
(i)-(iii) ceases to hold, this reverts to a staged expand/contract.

---

## 4. D4 — cause labelling

The endpoint (D3) returns stable machine codes `{ geocode_status, geocode_cause }`; the **frontend**
maps them to display copy (so copy edits need no backend deploy). The mapping:

| status | cause | label |
|--------|-------|-------|
| `pending` | `null` | Resolving… |
| `pending` | `unreachable` | Couldn't reach the geocoder — retrying |
| `needs_attention` | `ambiguous` | Needs region — multiple matches |
| `needs_attention` | `unreachable` | Gave up — couldn't reach the geocoder |
| `needs_attention` | `null` | Couldn't be resolved — needs attention *(backfilled rows only)* |
| `unresolvable` | (any) | Not found |

The in-progress vs needs-attention split the BRD requires is `status = 'pending'` (in-progress) vs
`status IN ('needs_attention','unresolvable')` (needs-attention) — derivable client-side from the
returned status, so the badge can show the counts separately without conflation.

---

## 5. D3 — the userId-scoped queue query (the security-load-bearing decision)

### 5.1 Ruling: a derived server query composing the QUAL-43 chokepoint

New `citiesRepository` method — the queue is **derived**, never a stored/maintained per-user list:

```
findUserGeocodeQueue(userId):
  SELECT DISTINCT c.id, c.name, c.country_code, c.region_id,
                  c.geocode_status, c.geocode_cause,
                  r.name AS region_name
  FROM cities c
  JOIN trip_places tp ON tp.city_id = c.id
  JOIN trips t        ON t.id = tp.trip_id
  LEFT JOIN regions r ON r.id = c.region_id
  WHERE scopeToUser(trips, userId)         -- the chokepoint, NOT eq(trips.userId, userId)
    AND c.geocode_status <> 'resolved'
```

- **Ownership is the `trips` join, expressed through `scopeToUser(trips, userId)`** — identical
  composition to `findCarryForwardItems`/`findCityItems` (`cities.ts:354,387`), whose header already
  documents the rule: *cities is global reference data and is deliberately absent from
  `UserOwnedTable`, so it never composes the chokepoint itself; its user-owned JOINS
  (`trips`/`items`) do.* The Backend brief **must not** hand-roll `eq(trips.userId, userId)` — the
  scope-completeness guard (`scripts/scope-completeness-check.sh`, build-enforced by QUAL-43 Stage 5)
  fails the build on a hand-authored predicate anywhere in `src/backend/**`.
- **Cross-user isolation is structural**, not a filter that can be dropped: a city referenced *only*
  by another user's trips has no `trip_places` row satisfying `scopeToUser(trips, userId)`, so it
  cannot appear. This composes the QUAL-43 / ADL-53 chokepoint rather than re-deriving ownership. It
  is the same isolation the QUAL-43 cross-tenant matrix (ADL-53 §5.1) already tests — GE-19 adds one
  row to that matrix.
- `DISTINCT` because one city may be referenced by several of the user's places/trips.
- `<> 'resolved'` returns the whole indicator set in one query; the client splits in-progress vs
  needs-attention on `geocode_status`.
- **GE-16 note:** this endpoint is a *user's own* references, so it does not re-implement GE-16 search
  containment (that hides *other* users' pending rows from search) — a user always sees a city *their
  own* place points at, whatever its status. Correct and non-conflicting: containment governs
  discovery of others' rows; this governs your own queue.

### 5.2 What it replaces

This supersedes the NR-06 localStorage `geocodeRetryQueue` as the indicator's source of truth (OQ-4).
The localStorage list is browser-bound (shows only cities added on *this* browser), goes stale when
places are deleted, and is not userId-safe by construction. The client polls this endpoint instead
(on load + an interval, and/or after place mutations). Endpoint path per OQ-5.

---

## 6. D5 — module boundary (secondary-audit §3.4)

**Recommendation: do not create a "geocode lifecycle" module.** The audit's concern —
`geocoding.service.ts` at 554 LOC is the largest backend file and this work lands in it — is valid,
but a lifecycle module that reached into `resolveCity`'s IO, the repository's queries, and the
frontend labels would *raise* coupling, not lower it (the cities-god-route lesson cuts the other way
here). Instead, distribute along the existing seams and extract exactly one thing:

- **Extract the *policy* as a pure function** `nextGeocodeState(current, verdict) → {status, attempts,
  cause}` — no DB, no `fetch`. It is the state machine of §3.2, and it is **the OP-35 unit under
  test**: the entire lifecycle becomes an exhaustive table test with no mock DB or geocoder. This is a
  small module (or a `geocoding.service.ts` co-located export) — cohesive, ~30 lines.
- **Leave the *mechanism* in `resolveCity`** — the DB writes and the Nominatim calls stay where the
  verdict is produced; `resolveCity` shrinks to "produce verdict → `nextGeocodeState` → apply."
- **The queue query goes to `citiesRepository`** (`findUserGeocodeQueue`), beside its user-scoped
  siblings — *not* into `geocoding.service.ts`. This is where the largest new chunk lands, so
  `geocoding.service.ts` grows only by the ~3 transition branches (net roughly flat after the pure
  extraction removes the inline branch bodies).
- **Re-open reuses `cityIdentityService.findOrUpgradeCity`** (extended whitelist) + `PATCH
  /api/places` — no new module.
- **Labels live frontend-side** (D4).

Net: extract the testable policy, keep IO in place, put the query where queries live. A full lifecycle
module is available as a later refactor if churn returns, but it is not justified by GE-19.

---

## 7. Acceptance criteria (OP-35) — what QA turns into the red bar

The **build** is ATDD-first. QA writes these to a red bar before implementation:

1. A city receiving an **ambiguous** verdict lands `geocode_status='needs_attention'`,
   `geocode_cause='ambiguous'` (not `pending`), and consumes **no** further retries (D1a / OQ-3).
2. A city hitting `GEOCODE_ATTEMPT_CAP` **recoverable** errors lands
   `needs_attention`/`cause='unreachable'` (never sits `pending`-at-cap).
3. A **no-match** city → `unresolvable` (unchanged); a `disabled`/global condition increments nothing.
4. **Cross-user isolation (the security bar, composing the QUAL-43 matrix):** `GET
   /api/geocode-queue` returns only cities referenced by the requesting user's own trips/places; a
   city stuck-`needs_attention` referenced **solely** by user B never appears for user A.
5. The queue **excludes** resolved cities and cities the user no longer references (delete the last
   referencing place → the city leaves the queue).
6. **Duplicate-safety:** re-adding a `needs_attention` city (same name/country/region) **reuses** the
   existing row — no second row (asserts step-1 status-blindness, §8).
7. **In-place re-open:** supplying a region for a **region-less** `needs_attention` city resets it to
   `pending`/attempts 0/`cause` null and re-fires resolution → it resolves.
8. **Re-point recovery:** `PATCH /api/places/:id {city_id}` to a corrected city drops the abandoned
   stuck city from the user's queue (BRD end-to-end recovery criterion).
9. The `(status, cause)` → label mapping (§4) renders the correct string for every combination.
10. `needs_attention`/`unresolvable` rows are counted in the needs-attention bucket, **not** the
    in-progress/resolving count (BRD "not conflated in the same silent count").
11. `nextGeocodeState` table test: every (current-row × verdict) cell of §3.2 yields the specified
    `{status, attempts, cause}`.

---

## 8. R5b verdict — absorbed here (secondary-audit §1b)

**Question posed:** does the name-based fallback algebra need consolidating to reach a clean lifecycle,
or is it fine to leave? **Verdict: fine to leave — R5b closes as overtaken-by-events.** GE-19's
lifecycle composes with the existing identity algebra (`cityIdentityService`) via exactly **two local
edits**, both inside GE-19's own build, no separate consolidation:

1. `findRegionlessUpgradeCandidate`'s status whitelist changes `['pending','unresolvable']` →
   `['pending','unresolvable','needs_attention']` (`cities.ts:253`) so a region-less stuck row is
   upgradeable — this **is** the D2 in-place re-open.
2. Step 1 `findByIdentityKey` must **stay status-blind** (it already is) so a re-add of a
   `needs_attention` city finds and reuses it instead of inserting a duplicate.

**The probe that settled it:** reading `findByIdentityKey` (`cities.ts:206-224`) — it matches on
`(country_code, name COLLATE NOCASE, COALESCE(region_id,0))` with **no** status or creator filter.
Therefore the `needs_attention` transition (which removes a row from the partial
`uniq_cities_pending_per_creator` index, `WHERE geocode_status='pending'`) **cannot** create a
duplicate on re-add: step 1 finds the row before any insert is attempted. The one theoretical gap — a
`needs_attention` row plus a *new* `pending` row for the same key coexisting because the terminal row
left the pending index — is closed by step 1's status-blindness (verified) and pinned by acceptance
criterion §7.6. No wider refactor of the wildcard-upgrade / reverse-single-match algebra is
load-bearing for GE-19.

**One honest residual (a doc nit, not a blocker):** `findByIdentityKey`'s doc comment justifies its
status/creator-blindness by *"the unique index is unconditional"* (`cities.ts:203-204`) — that
justification is **stale**: migration 0017 replaced the unconditional index with two partials. The
blindness is still *correct* (for a different reason — reuse-not-duplicate across creators/statuses),
but the *stated reason* is outrun by 0017. This is precisely the "a premise inherited without
re-probing the branch it describes" pattern the audit itself flagged (§3.1). Recommend the
implementation PR refreshes that comment in the same PR (doc-lifecycle same-PR rule) — it is not a
consolidation and not a behavior change.

The reflection's original R5b target — "two parallel identity models, both unique indexes" — was
already stale when written (0017 predated it by two days, secondary-audit §2.2). What the seam
actually unblocks is this small, contained composition, not a consolidation pass. **R5b's record is
this section.**

---

## 9. What I would challenge in the BRD / audit

- **BRD GE-19 phrasing "how a user-supplied region re-opens a terminal record."** This cleanly
  describes the *region-less* case (wildcard-upgrade re-opens the same row, D2 secondary). It does
  **not** cleanly fit the observed stuck row: city 6 is `region_id=14` (already regioned) and
  ambiguous because that region couldn't be confirmed. You cannot "supply a region" to a row that has
  one without either colliding on identity or performing a curation (`PATCH /api/cities`, owner-only,
  which pollutes shared seed data). For the regioned case the honest recovery is **re-point to a
  different city** (D2 primary) — the stuck row is abandoned, not re-opened. The BRD's own instruction
  to "reuse GE-16's re-point path" already points here; I am flagging that "re-opens the same record"
  and "re-point to a different record" are two different mechanisms and only the former applies to
  region-less rows. Neither is wrong; the ADL just makes the split explicit.
- **Audit §3.4's framing that the lifecycle "will grow" `geocoding.service.ts`.** True of the naive
  approach; D5 largely neutralizes it by routing the biggest new chunk (the query) to
  `citiesRepository` and extracting the policy as a pure function. The audit's instinct (watch the god
  file) is right; the remedy is placement, not a new module.
- **Nothing else in the audit's GE-19 section (§1c/A3) is contradicted** — its probes (three states;
  client clears on resolved/404; nothing upstream blocks) reproduced exactly.

---

## 10. Implementation implications (for the brief this ADL will cite)

- **Schema/migration (Database, Architect-gated):** add `needs_attention` to
  `chk_cities_geocode_status`; add `geocode_cause TEXT` + its CHECK. Hand-generated table rebuild;
  **hand-correct the regenerated `uniq_cities_pending_per_creator` index (ADL-15 bug 4)**; trailing
  backfill UPDATE (§3.5). Single green step under the three stated conditions.
- **Backend:** `nextGeocodeState` pure function + `resolveCity` rewired to it; the cap becomes an
  active transition; `findRegionlessUpgradeCandidate` whitelist +`needs_attention`; `findOrUpgradeCity`
  re-open resets (status/attempts/cause + re-fire) for adopted `needs_attention`; new
  `citiesRepository.findUserGeocodeQueue` composing `scopeToUser(trips, userId)`; new `GET
  /api/geocode-queue` route (`requireAuth`, OQ-5 path). ATDD-first.
- **Frontend:** replace the NR-06 localStorage source of truth with a poll of the new endpoint (OQ-4);
  render the panel grouped by in-progress vs needs-attention; the `(status,cause)`→copy map (§4);
  wire the recovery actions to the existing re-point (`ChangeCityModal` / `PATCH /api/places`) and
  delete flows. Not ATDD-first (UAT-visible UI, OP-35 frontend exclusion).
- **Docs same-PR:** refresh the stale `findByIdentityKey` "unconditional index" comment (§8); update
  any OP-06 / status-doc that asserts the three-state geocode model.
- **BRD:** GE-19 is already approved v3.20; no BRD bump. GE-19's inline "the exact status-lifecycle
  model … is an Architect ADL decision" is **answered by this ADL**; stamp that as resolved (pointer
  to ADL-55) in the **implementing** PR, not now (nothing is built yet).
- **No production code and no migration are produced by this ADL.**
