# ADL-53 — The userId-scoping chokepoint: a single `scopeToUser` + a universal repository layer

**Tracker:** QUAL-43 (design-reflection R1) · absorbs BUG-84's routes→repo fold (U7/U8)
**BRD:** n/a — internal structure/security; no user-facing requirement (confirmed with COO gate)
**Status:** DESIGNED (REVISED 2026-08-10; FOLLOW-ONS FOLDED 2026-08-10) — spec only, no production
code changed this thread. The second OP-27 fresh-eyes review (fresh Opus) returned
**SOUND-WITH-FOLLOW-ONS** — the design ships; its four follow-ons (F1–F4) + one UNVERIFIED note are
folded here (see **§R2**). Implementation is staged (§6, revised) and gated on OP-35 ATDD-first QA.
**Date:** 2026-08-08 · **Revised:** 2026-08-10 · **Follow-ons folded:** 2026-08-10 · **Author:** Architect (design-reflection R1)

---

## R. Revision log — 2026-08-10 (clears the OP-27 fresh-eyes blocking findings, PR #461)

This revision resolves the two **blocking** findings from ADL-53's own fresh-eyes review
(`jobs/architect/tech/20260808-ADL53-fresh-eyes-review.md`, PR #461) plus its three
non-blocking notes. The design's **principles were validated** by that review (D1/D2/D3/D4/D7/D8
and OQ-1/OQ-2/OQ-3 all credited); this is a bounded re-scope of the *migration plan* (§6) and a
reconciliation of an internal numbering contradiction — **not** a redesign.

- **B1 (blocking) — the migration was scoped one route too small.** The premise *"cities is the
  last route holding `getDb()`"* (old §3 D2.1, old §6 S3) is **false**. I re-inventoried
  `getDb()` across **all** route files myself as a fresh probe (grep + reading every handler); it
  is called directly in **six** route files, several on **user-owned** tables. The fresh inventory
  and its global-reference-read vs user-owned-read classification are now **§5.1 (new)**, and that
  split is the **organising spine** of the revised staging plan (**§6, revised**). The user-owned
  relocations are marked **`ATDD-first: yes`** with a cross-tenant isolation red-bar as their
  executable definition of done, and staged expand/contract (ADL-47) so no intermediate commit
  red-mains. The guard flip moves to **strictly last** (after *every* route is `getDb`-free), not
  "after cities."
- **B2 (blocking) — the COO OQ-4 adjudication contradicted §6's stage numbering.** Reconciled: the
  old §6 stage table and the OQ-4 stage labels are both **stamped superseded** and replaced by one
  coherent scheme in the revised §6. (I was explicitly authorised to revisit the OQ-4 adjudication
  rather than force-fit the contradiction — see §11, new.) B1 independently grows the build from
  three implementation briefs to **four** (the old single "S3" splits into a global-safe stage and
  a user-owned-dangerous stage), which the revised §6 and §11 record.
- **N1 — OP-06 seam.** Old §10 cited/instructed-updating OP-06 §5.1–5.3, which sits under a
  `SUPERSEDED (2026-07-15)` banner. §10 (revised) now points at OP-06's **live** homes: §2.1
  (current access matrix, ADL-46) and §6's **HC-05 / HC-10 / HC-11** cross-user isolation items.
- **N2 — the "4 inline `eq(...userId...)`" count** is a fragile grep artifact (case-sensitive
  probe missed `cities.ts:205`); it is **no longer treated as load-bearing** — D3's axis-split
  carries the argument, not the exact number.
- **N3 — cosmetic drift** (cities.ts line refs, the F4 "shading" over-claim) corrected inline
  where it appears.
- **ADL-log numbering (ADL-53 ↔ ADL-54).** `main` advanced ADL-52 → **ADL-54** (BUG-87 city-picker)
  while ADL-53 stayed on this unmerged branch, so the log shows a 53-shaped gap on `main` and a
  54-shaped gap here. The two numbers are **distinct — no duplicate** (verified: `main`'s log has
  no ADL-53 entry; this branch's log has no ADL-54 entry). On merge, the ADL-53 log block slots in
  **before** ADL-54; the only mechanical step is resolving the after-ADL-52 insertion seam so the
  entries read 52 → 53 → 54 in order. Flagged for the merging COO in the completion report.

Superseded material below is **retained in place** and stamped per the document-lifecycle rule;
read the revised sections (§5.1, §6-revised, §10-revised, §11) as current truth.

---

## R2. Follow-on fold — 2026-08-10 (second OP-27 fresh-eyes review: verdict SOUND-WITH-FOLLOW-ONS)

The revised ADL-53 passed its **second** OP-27 fresh-eyes review (fresh Opus — high-stakes
userId-scoping/access-matrix class): B1/B2 genuinely resolved, no cross-tenant hole, the design
ships. The reviewer raised **four bounded follow-ons + one UNVERIFIED note**; all are folded below.
These are reviewer-specified fixes, **not a redesign** — each was verified against live code before
folding (probes noted). Where each landed:

- **F1 [HIGH] — the "single Phase-3 change-point" claim is false as code stands: ownership is
  expressed *two* ways.** (a) a **SQL predicate** (`findById`/list-reads' `eq(table.userId, userId)`),
  foldable into `scopeToUser`; and (b) an **application-layer JS comparison** — `assertWritable`
  (`repositories/places.ts:273`, `repositories/items.ts:95`) selects `where(eq(trips.id, tripId))`
  then does `if (rows[0].userId !== userId) throw NotFoundError` — which has **no `eq(*.userId, …)`
  predicate for a grep-driven Stage 0 to collapse (verified: read both sites 2026-08-10)**. Stage 0
  as originally scoped ("collapse the `eq(table.userId, userId)` predicate") would never touch
  `assertWritable`, leaving write-gate ownership as a separate JS check while `scopeToUser` becomes
  the single *read*-scoping point — so D7/D1's "exactly one edit for Phase-3" is quietly false.
  **Folded:** Stage 0's charter is **widened** (§6 Stage 0) so *every* ownership expression in
  `repositories/**` — JS-comparison gates included — resolves through the chokepoint
  (`assertWritable` becomes a `.where(and(eq(trips.id, tripId), scopeToUser(trips, userId)))`
  existence check, **preserving the lock check**); a **completeness exit-check** mirroring the routes
  `getDb` guard is specified (grep for **both** `eq(\w+\.userId` predicates **and**
  `\.userId\s*[!=]==` comparisons returns clean, sole allowed match = the chokepoint's own definition
  in `scope.ts`); and the D1/D7 "single change-point" wording is corrected to hold **only once Stage 0
  covers the JS gates too** (§0 D1/D7, §2, §7).
- **F2 [MED] — the chokepoint is two mechanisms, one undefined.** `scopeToUser(table, userId)` needs a
  `userId` column, but three user-owned reads run against `tripPlaceActivitiesMap` (a join table with
  **no `userId` column**): `places.ts:289/352` (activity tag/untag) and the `placeActivities` read at
  `trips.ts:207-216`. §5.1 correctly says these are guarded by a **prior ownership assertion** (verified:
  `placeRepository.findById(userId, placeId)` precedes both join reads at places.ts) — but §6 Stage 4
  mislabelled them as "composing `scopeToUser`" (they inherit isolation, they compose nothing), and the
  doc **named `assertOwned`** (D1 row, §2 header, §3 layer-3) while §2's code **never defined it**.
  **Folded:** §2 now defines the **second helper as a first-class part of the chokepoint** — an
  ownership-assertion (`assertOwned`; the existing `assertWritable` is its writable-path instance)
  returning **404** for derived/join-table reads that carry no `userId` column of their own; §5.1 and §6
  Stage 4 now **label each user-owned site** *predicate-composed (`scopeToUser`)* or *assertion-guarded
  (`assertOwned`/`assertWritable`)*. The chokepoint is honestly **"one predicate helper + one assertion
  helper,"** not "one function."
- **F3 [LOW] — Drizzle `.where()`-replaces footgun in the Stage 0 refactor.** `tripRepository.findAll`
  (`repositories/trips.ts:61,64`) re-applies the full predicate on the filtered branch because
  `.where()` **overwrites** rather than appends (verified: read the method 2026-08-10 — `:61` sets
  `.where(eq(trips.userId, userId))`, `:64` re-applies `and(eq(trips.userId, userId), eq(trips.status,
  …))`). **Folded:** a footgun line in §6 Stage 0 — on any `$dynamic()`/multi-`.where()` builder,
  `scopeToUser` must appear in **every** terminal `.where(and(...))`, never only the first.
- **F4 [LOW] — Stage 1 matrix conflates read-isolation vs mutate-isolation.** **Folded:** §6 Stage 1
  now specifies expected shape **per endpoint class** — **empty result** for cross-tenant *reads* (city
  items, carry-forward list) and **404** for cross-tenant *mutations* (activity POST/DELETE on another
  user's place).
- **UNVERIFIED note (carried into the Stage 1 QA brief).** The reviewer did **not** run `test:backend`;
  "existing suites green as the regression net" is **UNVERIFIED** (its blind spot: a suite that is
  already red would invalidate the Stage-0 equivalence argument). **Folded:** §6 Stage 1 now requires the
  QA brief to (a) confirm the cross-tenant matrix runs against a **real libSQL instance** (FKs + partial
  unique indexes, per QUAL-22 mock-fidelity) and seeds **two distinct real users**, and (b) confirm the
  existing backend suites are green *before* Stage 0 lands, as the equivalence baseline.

**Scope note (per the brief's "flag anything beyond the reviewer's spec" gate).** Every fold above is
exactly the reviewer's specified fix. **One clarifying refinement**, entailed by the reviewer's own
"zero residual **hand-authored** userId ownership" wording and called out for transparency: the Stage-0
completeness grep's *sole permitted match* is the single chokepoint definition inside `scope.ts` (which
necessarily contains `eq(table.userId, userId)`) — every other match is a residual to resolve. This
narrows *how the exit-check is read*, not the design, and does **not** trigger a re-review.

---

## 0. Summary table (decisions)

| # | Decision | Recommendation | Confidence |
|---|---|---|---|
| D1 | The chokepoint | **Two** composable helpers — a `scopeToUser(table, userId)` **predicate** (for tables with a `userId` column) **and** an `assertOwned`/`assertWritable` **ownership-assertion** (for derived/join-table reads that carry none) — that every user-owned query routes through. **(REVISED 2026-08-10 F1/F2:** the "single Phase-3 change-point" holds **only once Stage 0 also folds the JS-comparison ownership gates** like `assertWritable` into the chokepoint — as code stood it did not; see §R2, §2, §6 Stage 0, §7.) | High |
| D2 | Enforcement — can a forgotten filter be made *impossible*? | **No** (not cheaply in Drizzle). Make it **caught**: routes never call `getDb()` (grep-guard, fail-closed) + an ATDD cross-tenant matrix at every user-data route | High |
| D3 | `citiesRepository` + `cityIdentityService` | Extract both from the 840-LOC god-route. Justified on **consolidation/testability/BUG-87-seam**, *not* as a cross-tenant fix — cities are global reference data | High |
| D4 | Reuse, don't reinvent | Extend the existing `tripRepository`/`companionRepository` pattern (OP-06 §5.2/§5.3 already marks it PASS); the helper is the DRY collapse of `eq(table.userId, userId)` already written N times | High |
| D5 | Global reads leave the route layer too | Route handlers touch **no** `getDb()` at all; global reference reads (countries/regions/city-by-id) route through unscoped-but-explicit repo methods so the guard is a trivial grep. **(REVISED §5.1: absolutist scope confirmed; its true cost is larger than first stated — six route files hold `getDb`, not one.)** | Medium |
| D6 | Staged migration — organised by the global-vs-user-owned split (REVISED) | **6 stages, spined on §5.1's split**: global-reference-read consolidation (no cross-tenant axis, `ATDD-first: no`) is kept *separate* from user-owned-read relocation (silent-cross-tenant-drop risk → `ATDD-first: yes`, cross-tenant red-bar, expand/contract). Guard flip is **strictly last**. Each stage independently green + deployable | High |
| D7 | Phase-3 seam shape | Design the single change-point signature (`scopeToUserOrShared`) now; defer sharing *semantics* (roles, `shared_with`) to Phase-3/SE-01. **(REVISED 2026-08-10 F1:** "single change-point" is contingent — it is true for *read-scoping* once `scope.ts` exists, and true for *ownership* only once Stage 0 also folds the JS-comparison gates (`assertWritable`) through the chokepoint; the assertion helper `assertOwned`/`assertWritable` is the second edit-point a sharing change touches for derived/join reads — see §7.) **(CORRECTED 2026-08-10 post-Stage-0, COO:** also contingent on a premise the ADL never stated — that ownership lives only in `repositories/**`+`routes/**`. It does not: four predicates sit in `services/shading.service.ts` with no owning stage. Folded into Stage 3; the residual set is now determined by the widened `scope-completeness-check.sh`, not by hand-inventory — see §7's CORRECTION block.) | High |
| D8 | Explicitly out of scope | Transaction/atomicity (reflection risk #3), geocode dual-identity consolidation (risk #2 / GE-19), serializer unification (risk #5). Each rides its own decision | High |
| **D9** | **Fresh `getDb`-in-routes inventory + global/user-owned classification (REVISED, B1)** | **Six route files call `getDb()` directly (cities, places, trips, map, admin, items-helper). Each call site is classified global-reference-read vs user-owned-read in §5.1; the classification determines its stage, its ATDD-first mark, and whether it carries a cross-tenant red-bar** | High |
| **D10** | **Stage-numbering reconciliation (REVISED, B2)** | **The old §6 table and the COO OQ-4 adjudication assigned different work to S0/S2/S3. Both are stamped superseded; one coherent scheme replaces them (revised §6). Authorised to revisit the OQ-4 adjudication — see §11** | High |

**The one-sentence throughline:** scoping is *already* structurally routed through repositories
for every user-owned table (OP-06 §5.2 PASS) — the residual debt is that (a) the filter is
*written N times* instead of *composed once* (Phase-3 pain), (b) nothing *enforces* the
convention (a future edit can bypass it and only a partial test would catch it), and (c) one
route — `cities.ts` — never got a repository at all. This ADL closes all three without changing
one row of behaviour.

---

## 1. What is actually true today (two-probe findings)

The design-reflection frames this as *"row-level userId-scoping is a convention, not a
structure — enforced at ~65 hand-threaded `req.user!.id` sites with no central chokepoint."*
That framing is directionally right but imprecise, and the imprecision matters because it would
mis-aim the QA. The verified picture:

**F1 — The "~65 sites" number is exact but mostly benign.** `grep -rn "req.user" src/backend/routes/`
returns **65** (probe 1: count; probe 2: per-file breakdown — map 11, trips 8, places 7,
companions 6, categories 6, activities 6, items 4, cities 4, me 3, trip-countries 2). But the
*majority* of these are `const userId = req.user!.id` immediately **passed into a repository or
service** that scopes internally — not 65 independent hand-written WHERE clauses. A case-sensitive `grep -rc
"eq(.*userId" src/backend/routes/*.ts` finds **4** inline `eq(...userId...)` predicates in route
handlers; a case-insensitive probe finds **5** (adds `cities.ts:205`'s creator-visibility predicate
on the *global* cities table — a different axis, see F3/D3). The scoping is far more structural than
"65 loose sites" implies. **(REVISION note, N2: the exact inline-predicate count is a fragile grep
artifact and is *not* load-bearing — D3's global-vs-user-owned axis-split carries the argument.
What *is* load-bearing is the `getDb`-in-routes inventory, re-probed fresh in §5.1.)**

**F2 — The repository layer already exists and is the primary control.** Repositories present:
`trips, items, places, companions, activities, tripCategories, shadingConfig, users` (+ the
`shading.service`). OP-06 §5.2/§5.3 marks trip/place/item repository scoping and query predicates
**PASS** — *"every mutating operation and every read … takes `userId` as a parameter and includes
`eq(trips.userId, userId)`."* This ADL **completes and enforces** that doctrine; it does not
introduce it.

> **CORRECTION (2026-08-10, B1).** "Every read goes through the repo" is the *goal* of this ADL,
> **not** the current state — and this over-claim is exactly what let the old getDb inventory
> undercount. Verified false at the *route* layer: `trips.ts:198` (trip-detail assembly) and
> `places.ts:231` (carry-forward) run **user-owned raw reads in the handler** despite their tables
> *having* repositories, and `items-helper.ts:87` is a `routes/` file running the item read for
> both. Not a bleed today — the predicates are present and correct (I re-checked each) — but the
> "already structural" story is weaker than F2 stated. "Has a repository" ≠ "holds no `getDb`". The
> full picture is the fresh inventory in **§5.1**. Also: OP-06 §5.2 sits under a
> `SUPERSEDED (2026-07-15)` banner — its live status is OP-06 §2.1 / §6 (see §10-revised); scope
> the §5.2 PASS claim to the three named repositories, not "every route read".

**F3 — `cities.ts` is the one route with no repository, but cities are GLOBAL data.** Two probes:
(1) `ls src/backend/repositories/` — no `cities.ts`; (2) reading `cities.ts` — 840 LOC,
find-or-create/wildcard-upgrade/OSM-merge logic inline in handlers (`findOrUpgradeCity`,
`createOrReuseCarriedCity`, `insertCityOrReuse`, `findCityByOsmRef`). **Crucial nuance:** the
`cities` table is global reference data (`schema.ts:113-121` — `createdByUserId` is *nullable*,
`ON DELETE SET NULL`, comment: *"cities are global reference data, not user data"*). So the
cities scoping axis is **creator-visibility** (GE-16 containment: a `pending` row is visible only
to its creator until `resolved`), **not ownership**. A `citiesRepository` is warranted — but
**as identity-logic consolidation, testability, and the seam for BUG-87's city-picker backend,
NOT as a cross-tenant read fix.** Framing it as the latter would send QA to write vacuous
cross-tenant tests against a global table (the QUAL-22 trap). This ADL keeps the two axes
separate deliberately.

**F4 — The access-matrix test checks the tier gate, not every row filter — accurately.** Two
probes: (1) reading `security.access-matrix.test.ts` — Part A (28 × unauth→401), Part B
(25 × non-owner→403), Part C cross-user isolation covers **only** trips (empty list / 404),
companions (empty), and nested POST items/places→404. (2) There is **no** per-route assertion
that user B cannot *read* user A's items, places, categories, or activities. So the
claim *"checks the tier gate, not that every row filter is present"* holds: Part C is a handful
of routes, not the full user-data surface. **This is the exact gap the ATDD matrix (D2) closes.**
*(N3 correction: shading cross-user isolation **is** already covered — `services/__tests__/shading.user-scope.test.ts` — so "shading" is removed from the uncovered list above; the gap is items/places/categories/activities reads.)*

**F5 — No *active* cross-tenant hole was found; the invariant is simply not structural.** The
non-owner UAT (2026-08-08) observed no data bleed, and I found no user-owned-table query in a
route handler lacking either a `userId` predicate or a prior ownership assertion (re-checked
2026-08-10 across the full fresh inventory in §5.1 — every user-owned raw read either carries its
own predicate, e.g. `places.ts:253`'s `eq(items.userId, userId)`, `trips.ts:223`'s, `cities.ts:727`/`:771`'s
`eq(trips.userId,…)`/`eq(items.userId,…)`, or is guarded by a prior ownership assertion, e.g.
`placeRepository.assertWritable(userId, tripId)` before the carry-forward reads). **This is
a gap-class defect (OP-32), not a live regression:** the risk is that a *future* edit introduces
a hole and only the incomplete Part C would maybe catch it. The fix is to make the invariant
structural and enforced *before* Phase-3, not to chase a bleed that isn't there today.

> **Reframe (per "question the frame"):** the honest problem statement is not *"65 unsafe sites"*
> — it is *"the right pattern exists but is (a) not DRY, (b) not enforced, (c) not universal
> (cities)."* Everything below attacks those three, and nothing pretends cities are user data.

---

## 2. D1 — The chokepoint: one predicate helper (`scopeToUser`) + one assertion helper (`assertOwned`/`assertWritable`)

**Recommendation.** Introduce one small module, `src/backend/repositories/scope.ts`, exporting the
single predicate that every user-owned query composes. Repositories call it instead of writing
`eq(table.userId, userId)` by hand.

```ts
// src/backend/repositories/scope.ts  (DESIGN — illustrative signature, not final code)
import { and, eq, type SQL } from 'drizzle-orm';

/** The user-owned tables. A table not in this union cannot be passed — a compile error,
 *  so "is this table user-scoped?" is answered once, in the type, not per call site. */
type UserOwnedTable = typeof trips | typeof tripPlaces | typeof items
  | typeof companions | typeof activities | typeof tripCategories | typeof mapShadingConfig;

/** The single ownership predicate. Phase-3 changes ONLY this function. */
export function scopeToUser(table: UserOwnedTable, userId: string): SQL {
  return eq(table.userId, userId);
}

/** Compose the scope with caller conditions — the shape repos actually use. */
export function ownedAnd(table: UserOwnedTable, userId: string, ...extra: (SQL | undefined)[]): SQL {
  return and(scopeToUser(table, userId), ...extra)!;
}

/** The SECOND chokepoint mechanism (REVISED 2026-08-10, F2). For a read whose target row has NO
 *  `userId` column of its own — a derived/join-table read (e.g. `tripPlaceActivitiesMap`), or a
 *  write-gate that must reject a non-owner opaquely — ownership cannot be expressed as a
 *  `scopeToUser` predicate; it is expressed as an ASSERTION against the owning row and returns 404
 *  (opaque per SE-05, never 403). `assertWritable` (already in `placeRepository`/`itemRepository`,
 *  `repositories/places.ts:273` / `repositories/items.ts:95`) is this helper's writable-path
 *  instance; it MUST itself route ownership through the predicate — an existence check, not a JS
 *  compare — so the two mechanisms share one ownership definition:
 *
 *    async assertOwned(userId: string, tripId: number): Promise<void> {  // read-gate variant
 *      const [row] = await getDb().select({ id: trips.id })
 *        .from(trips)
 *        .where(and(eq(trips.id, tripId), scopeToUser(trips, userId)))  // <- through the chokepoint
 *        .limit(1);
 *      if (!row) throw new NotFoundError('Trip');                       // 404, opaque (SE-05)
 *    }
 *    // assertWritable = assertOwned + the `status === 'locked' -> LockError()` check, preserved.
 */
export function assertOwned(/* … */): Promise<void>; // contract only — see §6 Stage 0 for the fold
```

**The chokepoint is two mechanisms, not one (REVISED 2026-08-10, F2).** Honestly stated, it is **one
predicate helper (`scopeToUser`) + one assertion helper (`assertOwned`/`assertWritable`)**. A read
against a table with a `userId` column *composes the predicate*; a read against a derived/join table
with no `userId` column (`tripPlaceActivitiesMap`) is *guarded by the assertion* on the owning row and
**inherits** isolation — it composes nothing. Both are first-class parts of the single ownership
definition: `assertWritable`/`assertOwned` express ownership by calling `scopeToUser` in an existence
check (never a hand-written `rows[0].userId !== userId` JS compare — see §6 Stage 0, the F1 fold), so
there remains **one** place ownership is defined even though there are **two** ways it is applied.

**Reasoning (High confidence):**
- It is the **DRY collapse** of a predicate already written ~a dozen times across repos —
  low-risk, mechanical, and each repo's existing tests prove equivalence.
- It is the **single Phase-3 change-point** for read-scoping (D7): `owner` → `owner OR
  shared-with(user, resource)` becomes an edit to `scopeToUser`, not an edit to N repositories. This
  is the headline reason the reflection raised the priority — sharing changes the *access predicate*,
  and after this there is exactly one. **(REVISED 2026-08-10, F1/F2:** for derived/join reads with no
  `userId` column, the sharing change is applied via the assertion helper `assertOwned`/`assertWritable`,
  which *calls* `scopeToUser` — so the ownership definition stays single even though sharing touches
  the predicate directly for predicate-composed reads and via the assertion for assertion-guarded ones.
  This single-ness holds only once Stage 0 folds the JS-comparison gates in — see §6 Stage 0.)
- The `UserOwnedTable` union does real structural work: passing a global table (`cities`,
  `countries`, `regions`) to `scopeToUser` is a **compile error**, so the "is this user data?"
  question is answered in the type system, once, rather than re-litigated at each call site.
- It composes with Drizzle's existing `and(...)`/`$dynamic()` usage (see `tripRepository.findAll`,
  `trips.ts:58-108`) — no ORM fighting, no builder rewrite.

**What it does NOT do (stated so it isn't over-claimed):** it does not *force* a repository author
to call it. A repo method can still `db.select().from(items)` and forget the scope. That residual
is D2's job — the helper makes the filter *composable and reviewable in one place*; the guard +
ATDD matrix make an omission *caught*.

---

## 3. D2 — Enforcement: "impossible" is too expensive; make it "caught"

This is the load-bearing engineering call and the one the brief presses hardest on
(*"how the chokepoint makes a forgotten filter structurally impossible or caught"*). I am
**overriding the implicit "make it impossible" framing** and I owe the full reasoning.

**Recommendation.** A two-layer *caught* net, plus an optional third:

1. **Routes never call `getDb()` (mandatory, fail-closed).** A CI/lint guard asserts the string
   `getDb` does not appear in `src/backend/routes/**`. Once every route is repo-routed, flip the
   guard to **error**. This makes "a route handler ran an unscoped query against a user table"
   *impossible to merge* — the route layer physically has no `db` handle. Trivially checkable (one
   grep), no ORM coupling, no false-negative surface.

   > **CORRECTION (2026-08-10, B1).** The original text here said *"cities is the last holdout"* and
   > the guard flips *"after Stage 3 (cities)."* **That is false** and was the central blocking
   > finding. A fresh cross-file re-inventory (§5.1) shows `getDb()` is called directly in **six**
   > route files — cities, places, trips, map, admin, items-helper — several on **user-owned**
   > tables. The guard can only flip to error **after every one of them is relocated** (revised §6,
   > Stage 5), not after cities. The guard's *door-completeness* is unaffected and remains sound —
   > the fresh-eyes review independently verified `getDb()` is the **only** exported ORM accessor
   > (`src/backend/db/index.ts`: `_db` is a module-private `let`, `createLibSQLDb`/`createPostgresDb`
   > are unexported, there is no `export const db`), so a route cannot obtain the handle without the
   > literal string `getDb` appearing. The door is complete; the map of rooms behind it was drawn
   > one route too small.
2. **ATDD cross-tenant isolation matrix (mandatory, OP-35 red bar).** For **every** user-data
   route, seed a row owned by USER_A, authenticate as USER_B, assert USER_B cannot read or mutate
   it (empty list / 404 — opaque per SE-05, never 403). This is the behavioural net that closes
   F4's gap and is the executable definition of done handed to the implementer *before* they build
   (QA writes it red).
3. **(Optional, fast-follow) a custom ESLint rule** flagging a `UserOwnedTable` appearing in a
   `.from()/.update()/.delete()` inside a repository without a `scopeToUser`/`assertOwned` in the
   same function body. **Recommended as a stretch, not a blocker** — see the open question in §8.

**Why not "structurally impossible"?** I considered three ways to make a forgotten filter a
*compile error* and rejected all three as the primary mechanism:

- **A typed pre-filtered query builder** (`userScoped(userId).select(...)` returns a builder
  already carrying the predicate). Rejected as primary: Drizzle's `.where()` **replaces** rather
  than appends, and joins/`$dynamic()` (which the existing repos lean on — `trips.ts:61`,
  `cities.ts:807`) make a single-table pre-applied predicate leak or fight the fluent API. It would
  force a repository rewrite — exactly the "no wholesale rewrite of working code" hazard — to buy a
  guarantee the grep-guard already gives at the layer that matters (routes).
- **Branding the row type** (`Owned<Item>` that only `scopeToUser` can mint). Rejected: it guards
  the *return* type, not the *query*; a `.from(items)` with no predicate still type-checks and
  returns `Item[]`. It catches nothing at the point the mistake is made.
- **Runtime assertion in `getDb()`** that inspects the compiled SQL for a `user_id` predicate.
  Rejected: brittle (global-table queries legitimately have none), and it fails *at request time*,
  not at build — the wrong place.

**The honest architectural truth:** in TypeScript + Drizzle, a forgotten `eq(userId)` *inside* a
repository cannot be made a cheap compile error without wrapping the ORM in a way that costs more
than it saves. The correct posture is **defence-in-depth** — exactly what OP-06 §5.5 already
prescribes ("three layers working in combination"): the guard removes the *route-level* class
entirely, the composable helper makes the *repository-level* filter a one-line review, and the
ATDD matrix is the regression net that catches the residual. That is a genuinely strong control;
"impossible" here would be security theatre with a rewrite attached.

---

## 4. D3 — `citiesRepository` + `cityIdentityService`

**Recommendation.** Extract two modules from `cities.ts`, moving logic **verbatim** (same SQL,
same load-bearing comments, same catch-unique-violation discipline):

- **`src/backend/repositories/cities.ts`** — the DB access surface: search (GE-16 containment),
  `findById`, `findByOsmRef`, the create/insert-or-reuse primitives, PATCH curation, and the
  city-scoped item/carry-forward reads (`GET /:id/items`, `GET /:id/carry-forward`). The
  user-owned reads *inside* these (carry-forward's `eq(trips.userId, userId)` at `cities.ts:727`,
  items' `eq(items.userId, userId)` at `cities.ts:771`) compose `scopeToUser` like any other
  user-owned query — so cities' *user-owned* joins join the chokepoint even though the cities
  table itself does not.
- **`src/backend/services/cityIdentityService.ts`** — the pure identity/find-or-create logic now
  inline: `findOrUpgradeCity` (the three-step D13 find-or-upgrade), `createOrReuseCarriedCity`
  (BUG-75 OSM-carried identity), and `insertCityOrReuse` (M1/F3 caught-violation → re-select).

**Reasoning (High confidence):**
- **Testability is the real prize.** This logic is the project's single most-churned surface
  (BUG-72/74/75/76/79/80/81/85). Inline in 840-LOC handlers it is only reachable through HTTP;
  extracted, the identity algebra gets direct unit tests — which is what the churn has been
  begging for.
- **It is the seam BUG-87 (city-picker backend) needs.** QUAL-43's note says this "sets the clean
  seam for the BUG-87 city-picker backend." A repository is that seam.
- **It absorbs BUG-84's routes→repo fold (U7/U8)** — one extraction, two tracker items discharged.
- **Reuse, not reinvention (D4):** it is the *same* repository shape as `tripRepository` — the PO's
  standing reuse preference and the brief's reuse audit both point here.

**Explicit scope guard (avoiding the QUAL-22 vacuous-test trap):** the `citiesRepository` is a
consolidation + testability move on **global** data. Its ATDD does **not** assert cross-tenant
*ownership* isolation on the `cities` table (there is none to assert); it asserts the **GE-16
containment** invariant (a non-creator does not see another user's *pending* city until it
resolves) — a different, real invariant. The cross-tenant *ownership* matrix (D2) covers the
user-owned tables. Conflating the two would produce tests that pass vacuously.

**No behaviour change is the success criterion.** The existing cities suites
(`adl46-access-model.test.ts` Groups A/B, the identity/containment tests) are the regression net;
a zero-behaviour-diff extraction keeps them green by construction. The `db.transaction()`
avoidance (catch-violation + `db.batch()`) is **preserved exactly** — see D8; this ADL does not
touch atomicity.

---

## 5. D4/D5 — Reuse the pattern; the route layer touches no `getDb()`

**D4 (High):** Everything above **extends** the `tripRepository`/`companionRepository` pattern
already blessed by ADL-18 and OP-06 §5.2. No new pattern is invented. The `scopeToUser` helper is
literally the extracted common expression of what those repos already do by hand.

**D5 (Medium):** The target end-state is **`getDb` appears in `src/backend/routes/**` zero times.**

> **SUPERSEDED (2026-08-10) by §5.1 — retained for history.** The bullet list that stood here named
> only *three* global-read sites (`cities.ts:413`/`:431`, `map.ts:115`/`:156`, `places.ts:81`/`:176`)
> and framed the whole residual as *"a handful of thin global-read repo methods."* B1 shows that
> was a large undercount and — worse — that it omitted the **user-owned** raw reads entirely. The
> corrected, fully-probed inventory is **§5.1**; it drives the revised staging in §6. The
> absolutist-vs-table-aware call itself (old OQ-1) still resolves **absolutist** — but its cost
> basis is restated in §5.1/§11, not "a handful of methods."

_Original text (retained):_ *That means global reference reads currently inline in routes also move
behind repo methods — cities country/region checks, map country-tier reads, places city-existence
reads → `referenceRepository`/`citiesRepository` lookups; the absolutist "no `getDb()` in routes"
grep guard is preferred over a table-aware AST rule because it is a one-line fail-closed check._

---

## 5.1 Fresh `getDb()`-in-routes inventory (REVISED 2026-08-10 — the B1 fix)

**Method (two probes that fail differently).** Probe 1: `grep -rn "getDb" src/backend/routes/*.ts`
across all 12 route files. Probe 2: **read every matched handler** and classify what table each
`const db = getDb()` query touches. (Probe 1 alone would miscount — three `getDb()` matches are
comment lines `"No direct getDb()"` in `items.ts`/`trips.ts`/`places.ts` headers, and three in
`cities.ts` are `ReturnType<typeof getDb>` *type* references, not call sites. Only reading the
handlers separates a real call site from a mention, and — the load-bearing half — a *global*-table
read from a *user-owned* one.)

**Result — six route files hold a real `const db = getDb()` call site** (not one). Classification:

| File · line | Query touches | Class | Ownership basis (why it's safe *today*) |
|---|---|---|---|
| ~~`cities.ts:50,410,603,654`~~ **RELOCATED 2026-08-10 (Stage 2)** → `repositories/cities.ts` + `services/cityIdentityService.ts` | cities / regions / countries — identity, search (GE-16), find-or-create | **Global-reference** | Cities are global reference data (nullable `createdByUserId`, `schema.ts:113-121`); visibility axis is GE-16 containment, not ownership |
| ~~`cities.ts:703`~~ **RELOCATED 2026-08-10 (Stage 2)** → `citiesRepository.findCarryForwardItems` | `items ⋈ tripPlaces ⋈ trips` (city carry-forward) | **User-owned — predicate-composed (`scopeToUser`)** | ~~Explicit predicate at `:727`~~ → **now composes `scopeToUser(trips, userId)`**; asserted by Part F of `security.access-matrix.test.ts` |
| ~~`cities.ts:766`~~ **RELOCATED 2026-08-10 (Stage 2)** → `citiesRepository.findCityItems` | `items ⋈ tripPlaces` (city items, SEC-01) | **User-owned — predicate-composed (`scopeToUser`)** | ~~Explicit predicate at `:771`~~ → **now composes `scopeToUser(items, userId)`**; asserted by Part F of `security.access-matrix.test.ts` |
| ~~`places.ts:74,163`~~ **RELOCATED 2026-08-10 (Stage 3)** → `referenceRepository` | `cities ⋈ regions` (city-exists on POST/PATCH place) | **Global-reference** | Ownership of the *place* enforced separately via `placeRepository`; the city read is global lookup |
| ~~`places.ts:231`~~ **RELOCATED 2026-08-10 (Stage 4)** → `placeRepository.findInWritableTrip` + `itemRepository.findOwnedIds` | `tripPlaces` + `items` (carry-forward, SEC-02) | **User-owned — assertion-guarded then predicate-composed** | `placeRepository.assertWritable(userId, tripId)` first (→ `assertOwned`/`assertWritable` helper) — **the assertion moved INTO `findInWritableTrip`**, so it can no longer be separated from the read it guards; the item check **now composes `ownedAnd(items, userId, …)`** inside `itemRepository.findOwnedIds`. Both asserted by Part F |
| ~~`places.ts:289,352`~~ **RELOCATED 2026-08-10 (Stage 4)** → `placeRepository.isActivityTagged` / `addActivityTag` / `removeActivityTag` | `tripPlaceActivitiesMap` (activity tag/untag) | **User-owned (join-table) — assertion-guarded (composes nothing)** | Join table has **no `userId` column** → cannot compose `scopeToUser`; guarded by prior `placeRepository.findById(userId, placeId)` + `activityRepository.validateOwnership`, **both of which stayed in the handler** — `findById` is itself the ownership assertion (it composes `scopeToUser(trips, …)` through its inner join) and the handler needs its result for the place's `tripId` regardless |
| ~~`trips.ts:198`~~ **RELOCATED 2026-08-10 (Stage 4)** → `placeRepository.findActivitiesForPlaces` + `itemRepository.findByTrip` | `tripPlaceActivitiesMap ⋈ activities` + `items` (trip-detail assembly) | **User-owned — assertion-guarded (join reads) then predicate-composed (items)** | `tripRepository.findByIdOrThrow(userId, tripId)` first (unmoved — it is what the join read inherits isolation from); the join read merged with the duplicate copy already inside `placeRepository.findByTrip` (one query, two consumers); the items read **is** `itemRepository.findByTrip(userId, tripId)`, whose conditions were already term-for-term identical to the hand-built pair |
| ~~`map.ts:113,154`~~ **RELOCATED 2026-08-10 (Stage 3)** → `referenceRepository` | `countries` (region-tier existence) | **Global-reference** | Global reference table; per-user shading is already behind `shading.service` |
| ~~`admin.ts:73,91,135,177,217`~~ **RELOCATED 2026-08-10 (Stage 3)** → `referenceRepository` | `countries` / `regions` (CRUD) | **Global-reference** | Global tables; writes are `requireOwner`-gated, but the data itself is not user-owned |
| ~~`items-helper.ts:87`~~ **RELOCATED 2026-08-10 (Stage 4)** → `repositories/items-helper.ts` (whole module moved out of `routes/`) | `items` (+ extension left-joins) | **User-owned — predicate-composed (`ownedAnd`, required `userId` param)** | ~~the scope is threaded in by the caller via `conditions`~~ → **`userId` is now a REQUIRED first parameter and the ownership term is composed inside the helper** (`ownedAnd(items, userId, conditions)`), so a caller cannot produce an unscoped item read; omitting it is a compile error. This also removed the layering inversion in which `itemRepository` imported a query out of the route layer |

> **STATUS (2026-08-10, Stage 4 — QUAL-43).** Every row above is now relocated; `npm run
> scope:check` Check 2 reports **zero** `getDb` mentions across `routes/**` and Check 1 Zone B
> reports **zero** residuals. The Stage 3 stamps in this table were added by the Stage 4 PR (the
> Stage 3 PR relocated those sites but did not stamp the inventory) — the relocations themselves are
> Stage 3's, verified here by two probes that fail differently: `scope:check`'s enumeration, and
> reading `routes/map.ts`/`routes/admin.ts`/`routes/places.ts` for the `referenceRepository` calls
> that replaced them. This table is a historical inventory from here on, not a worklist.

**Two consequences that drive the revised §6:**

1. **The split is the spine.** *Global-reference relocations* (cities-identity, `places.ts:74/163`,
   `map.ts`, `admin.ts`) are a **consolidation/testability** move with **no cross-tenant axis** —
   relocating them cannot introduce a bleed because the tables aren't user-owned. *User-owned
   relocations* (`cities.ts:703/766`, `places.ts:231/289/352`, `trips.ts:198`, `items-helper.ts:87`)
   move a query where **silently dropping an `eq(table.userId, userId)` predicate — or dropping the
   prior ownership assertion — is a plausible, invisible cross-tenant read.** These two classes get
   different treatment (ATDD-first, red-bar, expand/contract) and must not be folded into one
   "migrate routes" stage.

2. **`items-helper.ts:87` is the sharpest case.** It reads a user-owned table but *contains no
   scope of its own* — every caller (`items.ts`, `trips.ts:225`, and after S2 the cities item route)
   is trusted to pass a `conditions` that includes `eq(items.userId, userId)`. Relocating it into a
   repository must **make the `userId` a required parameter of the method signature**, so the scope
   can no longer be forgotten by a caller — this is the single highest-value user-owned relocation
   and the ATDD matrix must assert it directly (seed USER_A items, call as USER_B, expect empty).

**OQ-1 resolution stands (absolutist), cost restated.** The absolutist "no `getDb()` in routes"
grep guard is still preferred over a table-aware AST rule — a grep is fail-closed and bulletproof;
an AST rule is more machinery for a weaker guarantee. What B1 changes is the *cost*: the residual
is **not** "a handful of thin global-read methods." It is the global relocations **plus** the
user-owned relocations above. That cost is still worth paying (the global half is mechanical; the
user-owned half is work this ADL wants done *anyway* to reach the chokepoint), but the appetite for
the global-read relocations (§6 Stage 3) should be confirmed against the true, larger scope — see §11.

---

## 6. D6 — Staged migration path (REVISED 2026-08-10 — spined on the global/user-owned split)

> **SUPERSEDED (2026-08-10) — the original five-stage S0–S4 table is retained at the bottom of this
> section for history.** It folded *all* getDb relocation into one stage ("S3: global reads + guard
> flip, cities was the last holdout"), which B1 showed (a) understates the scope to one route when it
> is six, and (b) has **no ATDD bar on the user-owned half** — exactly the silent-cross-tenant hazard
> the split below exists to prevent. The revised plan makes §5.1's global-vs-user-owned split the
> *organising spine*, not an addendum.

Per ADL-47 (expand/contract) and the staging auto-deploy safety rule. **No stage changes behaviour;
each is a pure refactor with the existing test suites (+ the new S1 matrix) as the regression net.**
No schema change is required (the `cities` table already has every column), so there is no
expand/contract *migration* — the expand/contract shape applies to the **code**: for each user-owned
relocation, *expand* (add the repo method carrying the `userId` predicate/ownership assertion) →
*switch* (repoint the route, delete the inline `getDb` read; the S1 matrix stays green across the
switch) → *contract* (flip the guard to error, once every route is clean). Order is load-bearing
where noted.

| Stage | What ships | ATDD-first | Cross-tenant red-bar? | Green by | Deployable alone? |
|---|---|---|---|---|---|
| **Stage 0 — Chokepoint** | `scope.ts` (`scopeToUser`/`ownedAnd` predicate helper **+ `assertOwned` assertion helper**, F2) added; existing repos refactored to route **every** ownership expression through it — **both** `eq(table.userId, userId)` **predicates and JS-comparison gates** like `assertWritable` (F1: `repositories/places.ts:273`, `repositories/items.ts:95` become existence checks `.where(and(eq(trips.id, tripId), scopeToUser(trips, userId)))`, **preserving the lock check**). **Pure DRY refactor**, zero call-site behaviour change | **yes** (access-matrix invariant; silent-and-plausible if wrong) | via S1 (below) | existing repo + access-matrix suites | Yes |
| **Stage 1 — Red bar (QA)** | **ATDD cross-tenant isolation matrix**, authored red-first (QA, OP-35). **Must name the user-owned composite/threaded read paths from §5.1** — trip-detail assembly (`trips.ts:198`), carry-forward (`places.ts:231`, `cities.ts:703`), city items (`cities.ts:766`), `items-helper` reads, activity-tag join reads (`places.ts:289/352`) — not just tier gates. **Expected shape per endpoint class (F4):** cross-tenant *reads* assert **empty result** (city items, carry-forward list, trip-detail); cross-tenant *mutations* assert **404** (activity POST/DELETE on another user's place) — never 403 (opaque, SE-05). This is the executable DoD for Stages 2 & 4 | **is the ATDD** | **defines it** | passes on Stage-0 (already-correct) behaviour | Yes (coverage only) |
| **Stage 2 — Cities extraction** | `citiesRepository` + `cityIdentityService` extracted from `cities.ts`; logic moved verbatim, handlers thin. Its two user-owned joins (`:703`/`:766`) compose `scopeToUser` | **yes** (identity/data-integrity invariants; **mock-fidelity**: exercise the real `insertCityOrReuse` catch-path + partial unique indexes, not a vacuous stub — QUAL-22) | GE-16 **containment** (global data — *not* vacuous ownership); the two user-owned joins covered by S1 | existing cities/adl46 suites + S1 | Yes |
| **Stage 3 — Global-read consolidation (the SAFE half)** | Global reference reads relocated out of routes into `referenceRepository`: `map.ts:113/154`, `admin.ts:73/91/135/177/217`, `places.ts:74/163` (cities-identity global reads land in Stage 2). **No cross-tenant axis — global tables** | **no** (mechanical; failure visible; existing suites are the net) | **No** — global reference data, no ownership to assert | existing suites | Yes |
| **Stage 4 — User-owned-read relocation (the DANGEROUS half)** | User-owned raw reads relocated into repositories, **each by its §5.1 mechanism (F2):** *predicate-composed* reads compose `scopeToUser` — `items-helper.ts:87` (→ `userId` becomes a **required** method parameter), the items reads inside `trips.ts:198`/`places.ts:231`; *assertion-guarded* reads route through `assertOwned`/`assertWritable` and **inherit** isolation (compose nothing) — the `tripPlaceActivitiesMap` join reads at `places.ts:289/352` and `trips.ts:207-216`. Each relocation staged **expand → switch** with the S1 matrix green before *and* after every switch | **yes** (access-matrix; dropping an `eq(userId)` predicate *or* a prior ownership assertion is silent-and-plausible) | **Yes** — the S1 matrix asserts each relocated path per its class (seed USER_A, call as USER_B, expect **empty** for reads / **404** for mutations) | S1 matrix + existing suites | Yes (each switch independently green) |
| **Stage 5 — Guard contract** | Flip the `getDb`-in-routes guard to **error**. Introduced warn-only earlier (expand); flipped here (contract). **Strictly last** — only valid once Stages 2 + 3 + 4 leave `routes/**` `getDb`-free | **no** (the guard is its own test) | n/a | guard green + full suite | Yes — may ride the last relocation PR |
| **Stage 6 — Phase-3 seam** | *(Design only — not built now)* `scopeToUser` → `scopeToUserOrShared`. Deferred to Phase-3/SE-01 | — | — | — | — |

**Stage 0 detail — completeness exit-check + the `.where()` footgun (REVISED 2026-08-10, F1/F3):**
- **Completeness exit-check (F1) — mirrors the routes `getDb` guard.** Stage 0 is done only when a
  grep asserts **zero residual hand-authored userId ownership** in `repositories/**`, matching **both**
  forms — `eq(\w+\.userId` (predicate) **and** `\.userId\s*[!=]==` (JS comparison, e.g.
  `rows[0].userId !== userId`). The **sole permitted match** is the single chokepoint definition inside
  `scope.ts` (which necessarily contains `eq(table.userId, userId)`); every other match is a residual
  that must be routed through `scopeToUser`/`assertOwned` before Stage 0 closes. Without this second
  regex, a grep-driven Stage 0 collapses the SQL predicates and **silently leaves `assertWritable`'s JS
  compare** as a separate ownership check — the exact gap F1 caught.
- **The `.where()`-replaces footgun (F3).** Drizzle's `.where()` **overwrites**, it does not append. On
  any `$dynamic()`/multi-`.where()` builder — `tripRepository.findAll` (`repositories/trips.ts:61,64`)
  is the live example, which re-applies the userId predicate on its filtered branch — `scopeToUser` must
  appear in **every** terminal `.where(and(...))`, never only the first. A refactor that composes
  `scopeToUser` into the first `.where()` only would **drop the scope on the filtered path**.

**Ordering constraints (easy to violate):**
- **Stage 0 before Stage 1's green** — the matrix proves the `scope.ts` refactor preserved scoping.
- **Stage 0 before Stage 4** — the user-owned repo methods compose `scopeToUser`, so it must exist.
- **Stage 1 before Stage 4's switches** — the matrix is the red-bar; it must exist *and assert the
  specific §5.1 paths* before any of them is relocated (dropping a predicate mid-relocation is
  otherwise invisible).
- **Stages 2, 3, 4 in any order among themselves — but all three before Stage 5.** The guard flip is
  invalid while *any* route still holds `getDb`; flipping after "cities only" (the old S3) would go
  **CI-red on `main`** against `places.ts`/`trips.ts`/`map.ts`/`admin.ts`/`items-helper.ts` — the
  broken-trunk state ADL-47's discipline exists to prevent. This is the deployability half of B1.

**Old→new stage mapping (for anyone who read the superseded plan):** old S0 → Stage 0 (unchanged);
old S1 → Stage 1 (unchanged, now *must name* the user-owned paths); old S2 → Stage 2 (unchanged);
**old S3 splits into Stage 3 (global, safe, no-ATDD) + Stage 4 (user-owned, ATDD-first, NEW — was
missing) + Stage 5 (guard flip, now strictly-last-after-all-routes, not after-cities)**; old S4 →
Stage 6.

<details><summary><b>SUPERSEDED original §6 table (2026-08-08) — retained for history</b></summary>

| Stage | What ships | Green by | Deployable alone? |
|---|---|---|---|
| **S0** | `scope.ts` (`scopeToUser`/`ownedAnd`) added; existing repos refactored to compose it | existing repo + access-matrix suites | Yes |
| **S1** | ATDD cross-tenant matrix authored (QA, OP-35) — red first, then green against S0 | new isolation suite passes | Yes |
| **S2** | `citiesRepository` + `cityIdentityService` extracted from `cities.ts` | existing cities/adl46 suites | Yes |
| **S3** | Global reference reads moved out of routes; then flip the `getDb`-in-routes guard (*"cities was the last holdout"* — **false, see B1**) | guard green + full suite | Yes |
| **S4** | *(Design only)* Phase-3 seam `scopeToUser` → `scopeToUserOrShared` | — | — |

Original ATDD marks: S0 yes · S1 is-the-ATDD · S2 yes · **S3 no (unsound for the user-owned portion
the old S3 silently contained — the B1 fix)**.
</details>

---

## 7. D7 — The single Phase-3 change-point

**Recommendation.** Design the seam now, defer the semantics. The Phase-3 predicate lives at
exactly one function:

```ts
// Phase-3 (DESIGN — not built now). The ONE ownership DEFINITION sharing edits.
export function scopeToUser(table: UserOwnedTable, userId: string): SQL {
  // today:   return eq(table.userId, userId);
  // Phase-3: return or(eq(table.userId, userId), sharedWith(table, userId));
}
```

> **REVISED 2026-08-10 (F1/F2) — "the ONLY edit" is one definition applied two ways.** *Predicate-composed*
> reads (tables with a `userId` column) pick up sharing from this one function directly. *Assertion-guarded*
> reads (derived/join tables with no `userId` column — the `tripPlaceActivitiesMap` reads) pick it up
> **through the assertion helper `assertOwned`/`assertWritable`, which calls `scopeToUser`** — so sharing
> still has one *definition*, but a reviewer must verify the assertion helpers route through it (they must
> not re-hand-roll ownership as a JS compare — F1). This single-definition property is **contingent on
> Stage 0 folding the JS-comparison gates in**; before that fold, `assertWritable` was a second,
> independent ownership site a Phase-3 change would have had to find separately.

> **CORRECTION (2026-08-10, COO — post-Stage-0 finding, PR #487).** The single-definition property was
> **also** contingent on something this ADL never stated: that ownership is expressed only in
> `repositories/**` and `routes/**`. It is not. **`src/backend/services/shading.service.ts` holds four
> hand-written ownership predicates** (`:169`, `:209`, `:247`, `:291` — all `eq(trips.userId, userId)`),
> and **no stage in §6 owns `src/backend/services/**`**. Verified by two probes that fail differently:
> a repo-wide grep for `eq(\w+\.userId` outside `repositories/`+`routes/` returns exactly those four
> (and zero JS-comparison gates outside `repositories/`), and a read of §6's stage table end-to-end
> shows Stage 0 = repositories, Stages 2/3/4 = `routes/**`, Stage 5 = the guard flip — `services/**`
> appears nowhere. **Not a cross-tenant bleed:** all four are correct today and covered by
> `services/__tests__/shading.user-scope.test.ts`. But as staged, D7's single change-point is **not
> reached even after Stage 5**.
>
> This is structurally the **same class as F1** — ownership expressed somewhere the stage's grep never
> looks — one directory over rather than one syntactic form over. Two hand-inventories (§5.1, then F1's
> re-inventory) both missed it, which indicts the *method*, not the inventories. **Remedy (COO, PO-agreed
> 2026-08-10): stop inventorying by hand.** `scripts/scope-completeness-check.sh` (landed by Stage 0)
> is widened from `repositories/*.ts` to all of `src/backend/**` minus tests, and *its* output — not a
> human reading files — defines the residual set. The four shading sites are folded into **Stage 3** as
> Stage-0-shaped work (composing the existing helper into already-correct predicates; mechanical, no
> ATDD, existing suites as the net), **not** Stage 4 — they are not relocations, and putting them there
> would have required a temporary allowlist in the widened check, which rots.

**Reasoning:**
- The whole point of D1 is that after Stage 0 (`scope.ts` + the assertion helper), "who may see this row"
  is defined in **one** place for every user-owned table — applied as a predicate where a `userId` column
  exists and via an ownership assertion where it does not. Phase-3 becomes a localized change with the ATDD
  matrix (D2) as its regression net — the matrix's per-route assertions are exactly what a sharing change
  must not break for the *owner* case and must *newly satisfy* for the *shared* case.
- **Deferred deliberately:** the *shape* of `sharedWith` (a `shared_with` join table? a role column?
  read-only vs read-write grades?) is Phase-3/SE-01 product scope, not this ADL's. Designing it now
  would be speculative (project memory: *"don't architect for the current user base"* cuts both
  ways — build the seam, not the unbuilt feature). This ADL proves single-point-ness; it does not
  design sharing.

---

## 8. Open questions for the COO (flagged, not guessed — resolve before OP-27 fresh-eyes)

> **STATUS (2026-08-10):** all four OQ were resolved by the COO Adjudication (below) before the first
> fresh-eyes review. The revision restates **OQ-1's cost** (unchanged decision, larger scope — §5.1)
> and **supersedes OQ-4's stage numbering** (§11). OQ-2/OQ-3 stand as adjudicated. The list below is
> retained as the original author-flagged set.

Per the brief and the 2026-08-08 OP-27 refinement (settle author-flagged questions *before*
dispatching the reviewer), these are the calls I deliberately did not make:

- **OQ-1 (D5, Medium) — absolutist vs. table-aware guard.** Move *global* reference reads out of
  routes too (clean one-line grep guard, small bounded cost), or leave them inline and make the
  guard AST-based (more machinery, weaker)? **My rec: absolutist.** Needs a COO/PO appetite call.
- **OQ-2 (D2, stretch) — build the custom ESLint rule (enforcement layer 3) now or defer?** It is
  the only thing that catches a forgotten scope *inside* a repo at lint-time; it is also net-new
  custom-rule machinery. **My rec: defer to a fast-follow** — the grep-guard + ATDD matrix are the
  mandatory floor and cover the high-value class (routes); the ESLint rule is polish. Confirm.
- **OQ-3 (D3) — `cityIdentityService` boundary.** Does it own only the DB identity/find-or-create
  algebra (my rec), or also the geocode-resolve orchestration (`resolveCity`/`resolveCityName`
  calls currently in the route)? **My rec: DB/identity only** — entangling geocode orchestration
  drags in the dual-identity-model consolidation (reflection risk #2 / GE-19), a separate future
  decision. Keeping them apart preserves the clean seam.
- **OQ-4 (scope confirmation)** — confirm this ADL is DESIGN-ONLY and spawns **three** implementation
  briefs (S0, S2, S3) + one QA brief (S1), dispatched in that dependency order, rather than one
  monolith. **My rec: three + QA-first**, matching the OP-35 sequence in QUAL-43's note.

---

## 9. Out of scope — stated so it isn't silently absorbed (D8)

Each of these is a real item the reflection names; **none is this ADL's job**, and folding any in
would widen the class silently (OP-32 rule 4):
- **Transactions/atomicity (reflection risk #3).** The `db.transaction()` avoidance is *preserved
  verbatim*. The file-backed-test-client fix that would let production use real transactions is a
  separate decision; this refactor must not change atomicity behaviour.
- **Geocode dual-identity consolidation (risk #2 / GE-19 / BUG-85).** The name-based vs OSM-based
  find-or-create paths both move into `cityIdentityService` **unchanged**; consolidating them is a
  later ATDD-first decision that this extraction *enables* (by giving them one home) but does not
  perform.
- **Serializer unification (risk #5 / BUG-31/BUG-80).** `serializeCity` stays as-is; unifying
  per-handler serialization is its own item.

---

## 10. OP-06 security checklist alignment (REVISED 2026-08-10 — N1 seam fix)

> **N1 correction.** The original §10 cited OP-06 **§5.1–5.3** as current *and* instructed updating
> that wording when the stages land. But OP-06 §5 sits under a `> SUPERSEDED (2026-07-15)` banner —
> its live homes are **§2.1** (current access matrix, ADL-46) and **§6**'s HC items. Pointing
> maintenance at a historical section is exactly the document-lifecycle failure the review flagged.
> This section now points at the live homes. The §5.x prose below is kept only as the historical
> map of *where the doctrine originated*, not as the section to update.

This ADL is an OP-06 **isolation-enforcement** deliverable and strengthens it against the **live**
checklist:
- **HC-05 (companion/shading not readable by non-owners), HC-10 (cross-user access → 404), HC-11
  (list endpoints return empty for ungranted users)** — the Stage 1 ATDD cross-tenant matrix
  converts these per-item PASS *claims* into *executable per-route assertions* across the full
  user-owned surface (closing F4's gap: Part C today covers only a handful of routes).
- **§2.1 access matrix (ADL-46, current model)** — the `scopeToUser` helper makes its row-ownership
  rule **DRY and universal** (one predicate, composed everywhere); the `citiesRepository` +
  user-owned relocations (Stage 4) remove the last routes that bypass the repo layer.
- **HC-07 null-ownership** — untouched; `cities.createdByUserId` nullability is the *intended*
  global-data exception (`schema.ts:113-121`), not a scoping hole, and this ADL does not disturb it.
- *(Historical origin — the doctrine this ADL completes was first written in the now-superseded OP-06
  §5.1 route-guards / §5.2 repository-scoping / §5.3 query-predicate / §5.5 combination-rationale
  layers; that is where "three layers in combination" comes from. Do **not** update §5.x — update
  §2.1 / §6.)*

**Same-PR document-lifecycle rule (OP-09):** when Stage 2 (cities) and Stage 4 (user-owned
relocation) land, the implementing PRs update OP-06's **live** status — **§2.1** and the relevant
**HC-05/10/11** verification notes — to cite the chokepoint, and update this ADL's own §5.1
inventory rows to "relocated". (Flagged for the implementing PRs.)

---

## COO Adjudication — 2026-08-08 (open questions resolved before the OP-27 fresh-eyes review)

Per the ADL-52 clause-1 refinement, the COO resolves the author's flagged open questions **before**
dispatching the fresh-eyes reviewer, so the reviewer receives a settled spec and spends its pass on
blind spots. Resolutions (adopting the author's recommendations — these are COO/technical calls, not
PO product decisions):

- **OQ-1 — getDb guard scope: ABSOLUTIST.** Route handlers call `getDb()` **zero** times, with no
  table-aware exceptions. A blanket fail-closed grep guard is simpler to enforce and reason about than
  a table-aware allowlist, and it composes cleanly with the ATDD cross-tenant matrix.
- **OQ-2 — custom ESLint rule: DEFER.** The grep guard + ATDD matrix suffice for now; a bespoke ESLint
  rule is deferred (revisit only if the grep guard proves too coarse). Not a blocker.
- **OQ-3 — `cityIdentityService` boundary: DB / IDENTITY ONLY.** The service owns find-or-create /
  wildcard-upgrade / merge (identity); it does **not** own geocode orchestration (that stays in
  `geocoding.service.ts`). Keeps the seam narrow and avoids re-entangling the two subsystems.
- **OQ-4 — build shape: CONFIRMED.** ~~Three implementation briefs (S0 extract `citiesRepository` /
  `cityIdentityService`; S2 migrate routes + fold BUG-84 U7/U8; S3 the chokepoint + grep guard) + one
  QA brief (S1), **QA-first** per OP-35. ATDD-first marks as authored: S0 yes · S1 IS the ATDD · S2 yes
  (+ mock-fidelity on the identity catch-path) · S3 no.~~
  > **SUPERSEDED (2026-08-10) by §11 — retained for history (B2).** This wording assigned S0/S2/S3
  > *different work than §6's own table* (here S0 = cities, S3 = chokepoint; in §6 S0 = `scope.ts`,
  > S2 = cities, S3 = guard) — the two numberings inverted the ADL's declared load-bearing ordering,
  > so an implementer told "dispatch S0 → S2 → S3 in dependency order" received two incompatible
  > definitions. B1 independently forced a re-stage. **§11 is the reconciled build shape** (now
  > **four** implementation briefs + one QA brief, on the revised §6 stage numbering). QA-first and
  > the OQ-1/2/3 resolutions above are unchanged.

**Reframe recorded (negative-findings correction):** the "~65 unsafe sites" premise the COO briefed
this on was overstated. The author's two-probe finding stands — only **4** inline `eq(...userId...)`
predicates in route handlers; the rest pass into already-scoping repositories; `cities` is **global
reference data**, not user-owned; **no active data bleed** today. This is **gap-class** (OP-32), not a
regression. QUAL-43 re-rated **P1 → P2** accordingly (a foundation / BUG-87 seam / convention
enforcement, not an urgent security fire).

**For the fresh-eyes reviewer:** stress-test the design **and** these resolutions, and per the ADL-52
clause-2 refinement scope the **whole** ADL — specifically check the seam between the new sections and
OP-06 §5.1/§5.2/§5.3, and whether the "caught not impossible" D2 call (getDb-zero + grep guard + ATDD
matrix) genuinely closes the gap a rewrite would claim to.

---

## 11. Reconciled build shape (REVISED 2026-08-10 — resolves B2; supersedes OQ-4's numbering)

The COO OQ-4 adjudication above and the original §6 table used contradictory stage numbers (B2). One
coherent scheme now governs — the **revised §6 stages** — and the build the COO dispatches maps onto
them as follows. B1 grows this from three implementation briefs to **four** (the old single "migrate
routes / S3" splits into a global-safe brief and a user-owned-dangerous brief).

**Dispatch order (QA-first per OP-35), on the revised §6 numbering:**

| # | Brief | Revised §6 stage | Role | ATDD-first | Depends on |
|---|---|---|---|---|---|
| 1 | Cross-tenant isolation matrix (**names the §5.1 user-owned paths**) | Stage 1 | **QA** | is the ATDD | Stage 0 landed |
| 2 | `scope.ts` + refactor existing repos to compose it | Stage 0 | Backend | yes | — (but authored before #1 goes green) |
| 3 | `citiesRepository` + `cityIdentityService` extraction (+ fold BUG-84 U7/U8) | Stage 2 | Backend | yes (+ mock-fidelity) | Stage 0 |
| 4 | Global-reference-read consolidation → `referenceRepository` (map/admin/places-global) | Stage 3 | Backend | **no** | Stage 0 |
| 5 | User-owned-read relocation (trips-detail, places carry-forward + activity joins, items-helper) **+ guard flip to error as its final contract step** | Stages 4 → 5 | Backend | **yes** (guard flip step: no) | Stages 0, 1, 2, 3 |

> Sequencing note: #2 (`scope.ts`) is the substrate — it must land before #1 can go green and before
> #3/#5 compose the helper. #1 (QA matrix) is *authored red first* and must **assert the §5.1
> user-owned paths by name** before #5 relocates any of them. #5's guard flip (Stage 5) is valid only
> once #3, #4, and #5's relocations have left `routes/**` `getDb`-free — flipping earlier red-mains.

**Brief #1 (QA matrix) — mandatory environment/fidelity requirements (REVISED 2026-08-10, UNVERIFIED
note from the second fresh-eyes review).** The reviewer did **not** run `test:backend`, so "the existing
backend suites are green as the regression net" is **UNVERIFIED** (blind spot: an already-red suite would
invalidate the Stage-0 equivalence argument the whole plan rests on). The QA brief must therefore:
- **Run the matrix against a real libSQL instance**, not a mock — with **FK enforcement and the partial
  unique indexes** live — because the isolation invariants (404 on cross-tenant, empty on cross-tenant
  read) are exactly the class a vacuous double passes silently (QUAL-22 mock-fidelity).
- **Seed two distinct real users** (USER_A owner, USER_B caller) — a single-user fixture cannot express a
  cross-tenant assertion at all.
- **Confirm the existing backend suites are green *before* Stage 0 lands**, and record that baseline, so
  the Stage-0 "pure DRY refactor, behaviour unchanged" claim has an established equivalence reference
  rather than an assumed one.

**Authorisation note (probe-the-COO, OP-34).** The brief explicitly authorised revisiting the OQ-4
adjudication rather than force-fitting its contradiction with §6. I did: OQ-4's *intent* (design-only,
QA-first, ~three-to-four briefs) is sound and preserved; only its **stage labels** were wrong, and
they are superseded here. The COO should **ratify this reconciled numbering** (and the OQ-1 cost
restatement in §5.1/§11) before the second fresh-eyes dispatch — see the open item below.

### Open items for the COO (flagged, not guessed)

- **OQ-1 cost re-confirmation (not a re-decision).** OQ-1 stands **absolutist**; the *decision* is
  unchanged. But §5.1 shows its cost is larger than the adjudication assumed ("a handful of thin
  global-read methods" → six route files incl. user-owned relocations). Confirm appetite for **Stage
  3** (relocating *global* reads purely to make the guard a clean grep) now that its true, larger
  scope is visible. **My rec: keep it** — Stage 3 is mechanical/no-ATDD and Stage 4 is work needed to
  reach the chokepoint anyway; the alternative (leave global reads inline + an AST guard) is more
  machinery for a weaker guarantee. *This is a confirmation, not a blocking fork.*
- **ADL-log numbering (mechanical, for the merging COO).** `main` advanced ADL-52 → ADL-54 while
  ADL-53 sat on this branch (§R). No duplicate; on merge, order the log 52 → 53 → 54 and resolve the
  after-ADL-52 insertion seam. No decision required — just don't let the merge drop or mis-order the
  ADL-53 log block.

No other open questions — OQ-2 (defer ESLint) and OQ-3 (`cityIdentityService` = DB/identity only)
remain resolved as the COO adjudicated; the fresh-eyes review credited both.

### COO/PO resolution — 2026-08-10 (both open items closed before the fresh-eyes re-dispatch)

Per the OP-27 refinement (settle the author's flagged open items *first*, so the reviewer spends its
one pass on blind spots, not gaps already surfaced), both items above are now closed:

- **OQ-1 — guard scope: ABSOLUTIST, CONFIRMED (PO decision 2026-08-10).** The PO confirmed appetite for
  the larger Stage-3 scope now visible in §5.1: keep the guard absolutist (`getDb()` zero in
  `routes/**`), relocating global-reference reads too, rather than a table-aware/AST guard. Deciding
  dimension was guard enforceability vs. migration scope — the whole point of QUAL-43 is replacing a
  per-site convention judgment with a single grep-verifiable invariant, which a relaxed guard would
  reintroduce. The Architect's and COO's recommendations both stood. **Stage 3 is in scope.**
- **ADL-log numbering — ratified.** On merge, order the log 52 → 53 → 54; no duplicate (verified both
  logs). Mechanical, the merging COO owns the insertion seam. No design impact.

This section is the settled record; the two items are no longer open. The document is ready for the
second OP-27 fresh-eyes review (fresh **Opus** agent — high-stakes userId-scoping/access-matrix class,
never Fable — scoping the whole amended document and its seams per ADL-52 clause 2).
