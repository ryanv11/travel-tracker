# ADL-53 — The userId-scoping chokepoint: a single `scopeToUser` + a universal repository layer

**Tracker:** QUAL-43 (design-reflection R1) · absorbs BUG-84's routes→repo fold (U7/U8)
**BRD:** n/a — internal structure/security; no user-facing requirement (confirmed with COO gate)
**Status:** DESIGNED — spec only, no production code changed this thread. Implementation is
staged (§6) and gated on OP-27 fresh-eyes + OP-35 ATDD-first QA.
**Date:** 2026-08-08 · **Author:** Architect (design-reflection R1)

---

## 0. Summary table (decisions)

| # | Decision | Recommendation | Confidence |
|---|---|---|---|
| D1 | The chokepoint | One composable `scopeToUser(qb, table, userId)` / `assertOwned` helper that every user-owned query composes; it is the single Phase-3 change-point | High |
| D2 | Enforcement — can a forgotten filter be made *impossible*? | **No** (not cheaply in Drizzle). Make it **caught**: routes never call `getDb()` (grep-guard, fail-closed) + an ATDD cross-tenant matrix at every user-data route | High |
| D3 | `citiesRepository` + `cityIdentityService` | Extract both from the 840-LOC god-route. Justified on **consolidation/testability/BUG-87-seam**, *not* as a cross-tenant fix — cities are global reference data | High |
| D4 | Reuse, don't reinvent | Extend the existing `tripRepository`/`companionRepository` pattern (OP-06 §5.2/§5.3 already marks it PASS); the helper is the DRY collapse of `eq(table.userId, userId)` already written N times | High |
| D5 | Global reads leave the route layer too | Route handlers touch **no** `getDb()` at all; global reference reads (countries/regions/city-by-id) route through unscoped-but-explicit repo methods so the guard is a trivial grep | Medium |
| D6 | Staged migration (expand/contract where needed) | 5 stages, each independently green + deployable; every stage is a pure refactor with the existing suites as the regression net | High |
| D7 | Phase-3 seam shape | Design the single change-point signature (`scopeToUserOrShared`) now; defer sharing *semantics* (roles, `shared_with`) to Phase-3/SE-01 | High |
| D8 | Explicitly out of scope | Transaction/atomicity (reflection risk #3), geocode dual-identity consolidation (risk #2 / GE-19), serializer unification (risk #5). Each rides its own decision | High |

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
service** that scopes internally — not 65 independent hand-written WHERE clauses. `grep -rc
"eq(.*userId" src/backend/routes/*.ts` finds only **4** inline `eq(...userId...)` predicates in
route handlers. The scoping is far more structural than "65 loose sites" implies.

**F2 — The repository layer already exists and is the primary control.** Repositories present:
`trips, items, places, companions, activities, tripCategories, shadingConfig, users` (+ the
`shading.service`). OP-06 §5.2/§5.3 marks trip/place/item repository scoping and query predicates
**PASS** — *"every mutating operation and every read … takes `userId` as a parameter and includes
`eq(trips.userId, userId)`."* This ADL **completes and enforces** that doctrine; it does not
introduce it. (Verified: OP-06-hardening-checklist.md §5.2, lines 357–376.)

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
that user B cannot *read* user A's items, places, shading, categories, or activities. So the
claim *"checks the tier gate, not that every row filter is present"* holds: Part C is a handful
of routes, not the full user-data surface. **This is the exact gap the ATDD matrix (D2) closes.**

**F5 — No *active* cross-tenant hole was found; the invariant is simply not structural.** The
non-owner UAT (2026-08-08) observed no data bleed, and I found no user-owned-table query in a
route handler lacking either a `userId` predicate or a prior ownership assertion (checked the 4
inline-`eq` sites + the `places.ts` carry-forward path, which carries `eq(items.userId, userId)`
at `places.ts:253` and asserts `placeRepository.assertWritable(userId, tripId)` first). **This is
a gap-class defect (OP-32), not a live regression:** the risk is that a *future* edit introduces
a hole and only the incomplete Part C would maybe catch it. The fix is to make the invariant
structural and enforced *before* Phase-3, not to chase a bleed that isn't there today.

> **Reframe (per "question the frame"):** the honest problem statement is not *"65 unsafe sites"*
> — it is *"the right pattern exists but is (a) not DRY, (b) not enforced, (c) not universal
> (cities)."* Everything below attacks those three, and nothing pretends cities are user data.

---

## 2. D1 — The chokepoint: one `scopeToUser` / `assertOwned` helper

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
```

**Reasoning (High confidence):**
- It is the **DRY collapse** of a predicate already written ~a dozen times across repos —
  low-risk, mechanical, and each repo's existing tests prove equivalence.
- It is the **single Phase-3 change-point** (D7): `owner` → `owner OR shared-with(user, resource)`
  becomes an edit to `scopeToUser`, not an edit to N repositories. This is the headline reason the
  reflection raised the priority — sharing changes the *access predicate*, and after this there is
  exactly one.
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
   `getDb` does not appear in `src/backend/routes/**`. Once every route is repo-routed (cities is
   the last holdout — Stage 3), flip the guard to **error**. This makes "a route handler ran an
   unscoped query against a user table" *impossible to merge* — the route layer physically has no
   `db` handle. Trivially checkable (one grep), no ORM coupling, no false-negative surface.
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
  user-owned reads *inside* these (carry-forward's `eq(trips.userId, userId)` at `cities.ts:728`,
  items' `eq(items.userId, userId)` at `cities.ts:772`) compose `scopeToUser` like any other
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
That means *global* reference reads currently inline in routes also move behind repo methods:
- `cities.ts` country/region existence checks (`cities.ts:413`, `:431`) → `referenceRepository`
  (or `citiesRepository`) lookups.
- `map.ts` country-tier reads (`map.ts:115`, `:156`) → a `referenceRepository.getCountry(code)`.
- `places.ts` city-existence reads (`places.ts:81`, `:176`) → `citiesRepository.findById`.

**Why the absolutist version (Medium, flagged as an open question in §8):** a table-aware guard
("no `getDb()` *touching a user table*") is hard for a grep and needs an AST rule; a blanket "no
`getDb()` in routes" is a one-line fail-closed grep. The cost is a handful of thin global-read repo
methods — bounded, mechanical, and it also improves the global-read call sites (one place to add
caching later). I **recommend the absolutist version** but flag it as the one place appetite should
be confirmed (the alternative is to leave global reads inline and make the guard AST-based — more
machinery for a weaker guarantee).

---

## 6. D6 — Staged migration path (each stage independently green + deployable)

Per ADL-47 (expand/contract) and the staging auto-deploy safety rule. **No stage changes
behaviour; each is a pure refactor with the existing test suites as the regression net.** No schema
change is required by this work at all (the `cities` table already has every column it needs), so
there is no expand/contract *migration* here — the "staging" is purely code-refactor sequencing,
which is simpler and lower-risk than ADL-46's. Order is load-bearing where noted.

| Stage | What ships | Green by | Deployable alone? |
|---|---|---|---|
| **S0** | `scope.ts` (`scopeToUser`/`ownedAnd`) added; existing repos refactored to compose it — **pure DRY refactor**, zero call-site behaviour change | existing repo + access-matrix suites | Yes |
| **S1** | **ATDD cross-tenant matrix** authored (QA, OP-35) — red first, then green against S0's already-correct scoping. This is the executable DoD for everything after | new isolation suite passes on current behaviour | Yes (adds coverage only) |
| **S2** | `citiesRepository` + `cityIdentityService` extracted from `cities.ts` — logic moved verbatim; handlers become thin | existing cities/adl46 suites | Yes |
| **S3** | Global reference reads moved out of routes (`referenceRepository`); **then flip the `getDb`-in-routes guard to fail-closed** (cities was the last holdout) | guard green + full suite | Yes — guard flip is the last step, after the layer is clean |
| **S4** | *(Design only — not built now)* Phase-3 seam: `scopeToUser` → `scopeToUserOrShared`. Deferred to Phase-3/SE-01 | — | — |

**Ordering constraints that are easy to violate:**
- S0 **before** S1's green (the matrix proves S0 preserved scoping).
- S3's guard flip **after** S2 (cities is the last route holding `getDb()`; flipping earlier fails
  CI on cities legitimately). This is the one "expand/contract"-shaped step: add the repo methods
  (expand) → repoint routes (switch) → flip the guard to error (contract).

**ATDD-first marking (OP-35), per brief — each implementation brief this ADL spawns:**
- S0 `scope.ts` + repo refactor — **ATDD-first: yes** (access-matrix invariant; silent-and-plausible if wrong).
- S1 cross-tenant matrix — **is the ATDD** (authored by QA first).
- S2 cities extraction — **ATDD-first: yes** (data-integrity/identity invariants; the GE-16 containment + identity algebra must be pinned red before the move). **Mock-fidelity check required:** the cities identity tests must exercise the real `insertCityOrReuse` catch-path and the partial unique indexes, not a stub that can pass vacuously (QUAL-22).
- S3 global-read move + guard flip — **ATDD-first: no** (mechanical; failure is visible — the guard itself is the test).

---

## 7. D7 — The single Phase-3 change-point

**Recommendation.** Design the seam now, defer the semantics. The Phase-3 predicate lives at
exactly one function:

```ts
// Phase-3 (DESIGN — not built now). The ONLY edit sharing requires.
export function scopeToUser(table: UserOwnedTable, userId: string): SQL {
  // today:   return eq(table.userId, userId);
  // Phase-3: return or(eq(table.userId, userId), sharedWith(table, userId));
}
```

**Reasoning:**
- The whole point of D1 is that after S0, "who may see this row" is answered in **one** function
  for every user-owned table. Phase-3 becomes a localized change with the ATDD matrix (D2) as its
  regression net — the matrix's per-route assertions are exactly what a sharing change must not
  break for the *owner* case and must *newly satisfy* for the *shared* case.
- **Deferred deliberately:** the *shape* of `sharedWith` (a `shared_with` join table? a role column?
  read-only vs read-write grades?) is Phase-3/SE-01 product scope, not this ADL's. Designing it now
  would be speculative (project memory: *"don't architect for the current user base"* cuts both
  ways — build the seam, not the unbuilt feature). This ADL proves single-point-ness; it does not
  design sharing.

---

## 8. Open questions for the COO (flagged, not guessed — resolve before OP-27 fresh-eyes)

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

## 10. OP-06 security checklist alignment

This ADL is squarely an OP-06 §5 (isolation enforcement layers) deliverable and strengthens it:
- **§5.1 route guards** — unchanged (`requireAuth` global); this adds the *ownership* layer the §5.1
  "Gap" note calls out ("route handlers do NOT enforce ownership beyond passing userId to the repo").
- **§5.2 repository scoping** — the `scopeToUser` helper makes the PASS **DRY and universal**; the
  `citiesRepository` removes the last route that bypasses the repo layer.
- **§5.3 query predicates** — the ATDD matrix converts §5.3's per-table PASS *claims* into
  *executable per-route assertions* (closing F4).
- **§5.5 combination rationale** — this ADL is a direct application: three layers (guard removes the
  route class, helper makes the repo filter reviewable, ATDD matrix catches the residual).
- **HC-07 null-ownership** — untouched; `cities.createdByUserId` nullability is the *intended*
  global-data exception (schema.ts:113-121), not a scoping hole, and this ADL does not disturb it.

The same-PR document-lifecycle rule (OP-09): when S2/S3 land, OP-06 §5.2/§5.3's PASS/FAIL wording
and §5.1's "Gap" note must be updated to point at the chokepoint (flagged for the implementing PRs).
