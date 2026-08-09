# ADL-53 fresh-eyes review (OP-27) — the userId-scoping chokepoint

**Tracker:** QUAL-43 · reviewing ADL-53 (PR #456, branch `feat/adl53-userid-scoping-chokepoint`)
**Reviewer:** Architect (second, fresh dispatch — did NOT author ADL-53) · **Date:** 2026-08-08
**Mandate:** OP-27 fresh-eyes + ADL-52 clause 2 (scope the whole document, check the seam),
stress-test the "caught not impossible" D2 call and the COO's OQ-1..4 resolutions. Critique, not confirm.

---

## 0. Verdict

**BLOCKING FINDINGS — the design's *principles* are sound; its *migration plan* is not, and one
seam in the COO adjudication contradicts the body.** Do not dispatch S2/S3 as currently written.

The core rulings — **D1** (one composable `scopeToUser` chokepoint), **D2** ("caught not
impossible" via getDb-zero + grep guard + ATDD matrix), **D3** (cities = global data, extract a
repository for consolidation/testability, *not* as a cross-tenant fix) — are architecturally
correct and I independently re-verified their load-bearing premises. I would approve them as-is.

But two things must be fixed before an implementation brief goes out:

- **B1 (blocking).** The premise that **"cities is the last route holding `getDb()`"** — stated
  twice (§3 D2.1, §6 S3) and load-bearing for the entire staged plan — is **false**. `getDb()` is
  called directly in **five other route files**, several on **user-owned** queries. This
  understates the S3 scope by a large margin and mis-marks its ATDD-first flag.
- **B2 (blocking).** The **COO Adjudication OQ-4** renumbers the stages (`S0 = cities extraction`,
  `S3 = chokepoint + guard`) in **direct contradiction** to §6's table (`S0 = scope.ts`,
  `S2 = cities`, `S3 = guard`). The ADL declares its stage *ordering* load-bearing; the two
  numberings invert it. An implementer told to "dispatch S0/S2/S3 in dependency order" receives
  two incompatible definitions.

Both are targeted fixes (re-inventory + re-scope + reconcile numbering), not a redesign.

| # | Finding | Severity | Fix |
|---|---|---|---|
| B1 | "cities is the last route holding `getDb()`" is false — 5 other route files call it, several on user-owned tables | **Blocking** | Re-inventory getDb-in-routes; re-scope S3; re-mark the user-owned relocations ATDD-first: **yes** |
| B2 | COO OQ-4 stage relabeling contradicts §6's stage table and inverts the declared ordering | **Blocking** | Reconcile to one numbering before dispatch |
| N1 | ADL cites/instructs-updating OP-06 §5.1–5.3, which sits under a SUPERSEDED (2026-07-15) banner; current truth is §6/§7 | Non-blocking | Point §10 at OP-06 §6/§7; scope the §5.2 PASS claim to the 3 repos, not "every route read" |
| N2 | "4 inline `eq(...userId...)`" is a fragile grep artifact; case-insensitive probe finds 5 | Non-blocking | Don't let the exact number be load-bearing (D3's axis-split already handles it) |
| N3 | Line-ref drift (cities.ts:728/772 vs actual 727/771); F4 lists "shading" as uncovered but `shading.user-scope.test.ts` covers it | Non-blocking | Cosmetic; correct on the S2/S3 PRs |
| C1 | D2 grep-guard door-completeness | **Credit** | `getDb()` is the *only* exported ORM door — verified; the guard is sound within its scope |
| C2 | D3 cities-as-global-data reframe | **Credit** | Verified `schema.ts:113-121`; the QUAL-22 vacuous-test guard is right |

---

## B1 (BLOCKING) — "cities is the last route holding `getDb()`" is false

This is the load-bearing premise of the whole staged plan and it does not survive two probes.

**The claim, verbatim from the ADL:**
- §3 D2.1: *"Once every route is repo-routed (**cities is the last holdout** — Stage 3), flip the
  guard to error."*
- §6 S3 ordering: *"cities is the last route holding `getDb()`; flipping earlier fails CI on
  cities legitimately."*
- §5 D5 inventory of what still holds `getDb()`: only *cities country/region checks, map.ts
  country reads, places.ts city-existence reads* — all framed as **global reference reads**.

**Probe 1 (cross-file grep).** `grep -rn "getDb" src/backend/routes/*.ts` returns direct
`const db = getDb()` call sites in **six** route files, not one:

| File | `getDb()` call sites | What they query |
|---|---|---|
| `cities.ts` | 50, 410, 603, 654, 703, 766 (+ 3 type refs) | S2's target — accounted for |
| `places.ts` | 74, 163, 231, 289, 352 | city-existence (global) **AND user-owned** (see below) |
| `trips.ts` | 198 | **user-owned** items + activities assembly |
| `map.ts` | 113, 154 | country-tier (global) — ADL accounts |
| `admin.ts` | 73, 91, 135, 177, 217 | countries/regions (global) — **ADL does not mention** |
| `items-helper.ts` | 87 | **user-owned** items helper — **ADL does not mention** |

**Probe 2 (reading the handlers — different failure mode).** The ADL frames all residual getDb
as *global* reads. It is not:

- `places.ts:231` POST carry-forward runs, in the route handler, a raw `getDb()` query against
  **`tripPlaces`** (`:236-240`) and against **`items`** with the SEC-02 ownership predicate
  `eq(items.userId, userId)` (`:250-253`) — user-owned data, security-load-bearing.
- `trips.ts:198` GET trip detail assembles the response with a raw `getDb()` query over
  `tripPlaceActivitiesMap`/`activities` (`:207-215`) **and** `items` scoped
  `eq(items.userId, userId)` (`:221-225`).
- `items-helper.ts:87` `fetchItemsWithExtensions` is a `routes/` file that runs the item read for
  both of the above via `getDb()`.

**Why the author slid into the error (the precise conflation).** F3 correctly establishes *"cities
is the **one route with no repository**."* That is true — trips/places/items *have* repositories.
D2/S3 then silently upgrade it to *"cities is the last route **holding `getDb()`**."* Those are
different claims: a route can have a repository **and still** call `getDb()` directly for
assembly/carry-forward paths — which is exactly what `trips.ts` and `places.ts` do. "Has no repo"
≠ "holds no getDb." The valid F3 finding was stretched one step too far into an invalid S3 premise.

**Consequences (each independently blocking the S3 brief as written):**

1. **S3 scope is drastically understated.** The guard `grep "getDb" in routes/** → error` cannot be
   flipped "after S2 (cities)" — it will go red on `places.ts`, `trips.ts`, `map.ts`, `admin.ts`,
   **and** `items-helper.ts`. Getting to getDb-zero requires refactoring all of them, not "a
   handful of thin global-read repo methods" (§5 D5). The `admin.ts` reads and the `items-helper.ts`
   item read aren't in the ADL's inventory at all.

2. **S3's `ATDD-first: no` marking is unsound for the user-owned portion.** §6 marks S3
   *"mechanical; failure is visible — the guard itself is the test."* That is true for moving a
   global `countries` read. It is **false** for relocating `places.ts`'s SEC-02
   `eq(items.userId, userId)` carry-forward check and `trips.ts`'s user-scoped item read into a
   repository: dropping or loosening a `userId` predicate during that move is **silent and
   plausible** — precisely the access-matrix class the ADL's own D2/OP-35 says must be
   `ATDD-first: yes`. Handing this as a no-ATDD "mechanical" brief is the QUAL-22/silent-bleed
   hazard the fresh-eyes gate exists to catch.

3. **It undercuts the §1 F2 framing.** F2 says the repository layer is *"the primary control … every
   read … goes through the repo."* Verified partially false at the route layer: `trips.ts` and
   `places.ts` run **user-owned raw reads in the handler** despite owning repositories. Not a bleed
   (the predicates are present and correct today — I checked), but the "scoping is already
   structural" story is weaker than stated, and it is the reason the getDb inventory was
   undercounted.

**Required fix (bounded — not a redesign):**
- Re-inventory every `getDb()` in `routes/**` and split it into **global-read relocations**
  (map/admin/cities country-region) vs **user-owned relocations** (places carry-forward, trips
  detail assembly, items-helper).
- Re-scope S3 to cover all of them (or split into S3a global-reads / S3b user-owned-reads +
  guard-flip). The guard flip stays last regardless.
- Mark the **user-owned** relocation brief `ATDD-first: yes` — the ATDD cross-tenant matrix (S1)
  must assert the carry-forward and trip-detail read paths specifically, since those are where a
  predicate can be silently dropped.

---

## B2 (BLOCKING) — the OQ-4 stage relabeling contradicts §6

Per ADL-52 clause 2, I scoped the seam between the COO Adjudication (appended after the body) and
the sections it did not edit. It contradicts §6.

- **§6 stage table:** `S0` = `scope.ts` (`scopeToUser`/`ownedAnd`) + repo DRY refactor · `S1` = ATDD
  matrix (QA) · `S2` = `citiesRepository` + `cityIdentityService` extraction · `S3` = global reads
  moved + **guard flip**.
- **COO Adjudication OQ-4:** *"Three implementation briefs (**S0 extract `citiesRepository` /
  `cityIdentityService`**; **S2 migrate routes + fold BUG-84 U7/U8**; **S3 the chokepoint + grep
  guard**) + one QA brief (S1)."*

These assign **different work to S0, S2, and S3.** In the body, the chokepoint (`scope.ts`) is
**S0** and cities is **S2**; in the adjudication, cities is **S0** and the chokepoint is **S3**.

**Why this is blocking, not cosmetic.** §6 declares two ordering constraints *load-bearing*:
- *"S0 **before** S1's green (the matrix proves S0 preserved scoping)"* — this only makes sense if
  S0 is the `scope.ts` refactor. Under the adjudication's numbering, S0 is the cities extraction,
  which has nothing to do with proving the scope helper preserved behaviour, so the stated
  constraint becomes incoherent.
- *"S3's guard flip **after** S2"* — body-consistent, but the adjudication puts the guard in S3
  alongside the chokepoint and drops the `scope.ts`-first stage entirely, so `scope.ts` (the D1
  headline deliverable) has **no stage** in the adjudication's list at all.

An implementer handed "dispatch S0 → S2 → S3 in dependency order" cannot execute both readings.
**Reconcile to one numbering before any dispatch** — my recommendation is to keep §6's numbering
(it is the one with the coherent ordering rationale) and correct the adjudication's OQ-4 wording,
noting the adjudication also implicitly folds "migrate user-owned routes" into a stage, which B1
shows is larger than a single "S2 migrate routes" line implies.

---

## Stress-testing D2 — does "caught not impossible" actually close the gap? (mostly yes)

The mandate presses hardest here. My finding: **the D2 mechanism is sound within its stated scope,
and I credit it — but B1 means it is not yet *deployed* to the scope the ADL claims.**

**Where a cross-tenant read could still slip through — and whether D2 catches it:**

- **A new route importing a db handle by a different name/path.** *Checked — closed.* `getDb()` is
  the **only exported accessor** (`src/backend/db/index.ts:69`); the instance `_db` is a
  module-private `let` (`:59`) and `createLibSQLDb`/`createPostgresDb` are **unexported**
  (`:108`, and the postgres constructor). There is no `export const db`, so a route **cannot**
  obtain the drizzle handle without the literal string `getDb` appearing — the grep guard's door is
  genuinely complete. (Two probes: `grep -nE "export" db/index.ts` + reading the singleton block.)
  This is a real strength and the ADL under-sells it — it should cite the module-private singleton
  as *why* the grep guard is sufficient rather than leaving it as an assertion.
- **A repository method that forgets `scopeToUser`.** *Not caught by the guard — correctly
  acknowledged.* The guard is route-layer only; D2 states plainly the helper "does not force a repo
  author to call it," and the ATDD matrix is the net. Honest and correct. (OQ-2's deferred ESLint
  rule is the only thing that would catch this at lint-time; deferring it is reasonable **provided**
  the ATDD matrix genuinely exercises every user-data read — which B1 shows the current S-plan does
  *not*, because the carry-forward/trip-detail read paths aren't called out.)
- **A join pulling another user's rows.** The `scopeToUser` `UserOwnedTable` union scopes the
  *driving* table; a join to a second user-owned table without its own predicate would not be caught
  by the helper. The ATDD matrix must therefore assert the *composite* read (e.g. trip-detail's
  items join), which reinforces B1's requirement that those specific paths be in the matrix.
- **A raw `` sql`` `` fragment.** Lives inside a repo; same residual as a forgotten predicate —
  ATDD-matrix territory, correctly out of the guard's scope.

**Verdict on D2:** the reasoning (reject "impossible" as an over-costly Drizzle rewrite; adopt
defence-in-depth per OP-06 §5.5) is **correct and well-argued**, and the three rejected
typed-wrapper alternatives are each rejected for the right reason (Drizzle `.where()` replaces
rather than appends; branded return types guard the wrong point; runtime SQL inspection fails at the
wrong time). The gap is not in D2's logic — it is that B1's mis-inventory means the guard's "flip to
error" step and the ATDD matrix's coverage are scoped to the wrong surface.

---

## Stress-testing the COO's OQ resolutions

- **OQ-1 (absolutist getDb guard) — sound in principle, but B1 changes its cost basis.** A blanket
  "no `getDb()` in routes" grep is indeed simpler than a table-aware AST rule, and I agree with the
  choice. But the adjudication adopts it believing the residual is "a handful of thin global-read
  repo methods." B1 shows the residual includes **user-owned** query relocations in `places.ts`,
  `trips.ts`, and `items-helper.ts`. The decision still stands; its *scope and risk* must be
  re-stated so the appetite is judged against the true cost.
- **OQ-2 (defer ESLint rule) — reasonable, with one caveat.** Deferring is fine **only if** the
  mandatory floor (grep guard + ATDD matrix) actually covers the high-value class. B1 shows the ATDD
  matrix as currently specified does not name the carry-forward / trip-detail composite reads, which
  are exactly the in-repo residual the ESLint rule would otherwise backstop. Either name those paths
  in S1 explicitly (my rec) or reconsider OQ-2. Not independently blocking, but coupled to B1.
- **OQ-3 (`cityIdentityService` = DB/identity only, not geocode orchestration) — sound, no
  concern.** Keeping geocode orchestration in `geocoding.service.ts` avoids dragging GE-19's
  dual-identity consolidation into this refactor; consistent with D8's out-of-scope list. Agree.
- **OQ-4 (three impl briefs + QA-first) — the shape is right; the numbering is B2.** QA-first per
  OP-35 is correct. The defect is only that OQ-4's stage labels contradict §6 (B2).

---

## The staged/expand-contract migration — is every step green and independently deployable?

Partly. **S0, S1, S2 are genuinely green-and-independent** as described (pure refactors + additive
test coverage; no schema change, correctly noted — the cities table already has every column, so
there is no expand/contract *migration* here, only code sequencing).

**S3 is where the plan breaks (this is the deployability half of B1):**
- As written, S3 = "move global reads + flip the guard." But flipping `grep getDb → error` while
  `places.ts`/`trips.ts`/`admin.ts`/`items-helper.ts` still call `getDb()` makes **CI red on
  `main`** — a broken intermediate state reaching the trunk, exactly what ADL-47's staging
  discipline exists to prevent.
- The guard flip is only safe **after every route file is getDb-free**, which is a bigger step than
  cities. So S3 must either (a) expand to cover all getDb holders before the flip, or (b) split so
  the flip is genuinely last. The "expand → repoint → contract(flip)" shape the ADL invokes for S3
  is right; it is just applied to an incomplete set of routes.

No *behaviour*-breaking intermediate state exists (the refactors preserve predicates), but a
**CI-breaking** one does the moment the guard flips against an incompletely-cleaned route layer.

---

## What I verified and credit (so the review isn't all red)

- **D3 cities = global data — verified, correct.** `schema.ts:113-121`: `createdByUserId` is
  nullable, `ON DELETE SET NULL`, comment *"cities are global reference data, not user data."* The
  decision to extract `citiesRepository` for consolidation/testability/BUG-87-seam and **not** as a
  cross-tenant fix is right, and the explicit QUAL-22 guard (its ATDD asserts GE-16 *containment*,
  not vacuous ownership isolation on a global table) is exactly the correct call.
- **F4 access-matrix Part C is tier-only — verified.** Part C has 5 cases (trips empty/404,
  companions empty, nested POST items/places → 404); there is no per-route assertion that USER_B
  cannot *read* USER_A's items/places/categories/activities. The gap D2's matrix targets is real.
  (Minor N3: shading cross-user *is* covered, in `services/__tests__/shading.user-scope.test.ts`, so
  listing "shading" among the uncovered reads in F4 is a small over-claim.)
- **D1/D2 reasoning — sound.** The chokepoint-as-single-Phase-3-change-point argument (D7) and the
  "caught not impossible" defence-in-depth posture are correct and well-evidenced.

---

## Non-blocking findings (fix on the implementing PRs)

- **N1 — OP-06 seam.** OP-06 §5 carries `> SUPERSEDED (2026-07-15)` at the top; the admin/shading
  FAIL and nullable-userId PARTIAL markers in §5.1–5.3 were resolved by PRs #82/#84/#86, and the
  banner directs readers to §6/§7 for current status. ADL §10 both **cites** §5.2/§5.3 PASS as
  current *and* **instructs updating** §5.1–5.3 wording when S2/S3 land — pointing maintenance at a
  historical section. Point §10 at OP-06 **§6/§7** (the live status) instead, and scope the "§5.2
  PASS = every read goes through the repo" claim to the three named repositories — B1 shows route
  handlers still run user-owned raw reads, so "universal repo routing" is the *goal* of this ADL,
  not the current state it cites.
- **N2 — the "4 inline predicates" count.** `grep -rnE "eq\([^)]*[uU]ser[Ii]d"` finds **5**, adding
  `cities.ts:205` (`or(eq(cities.createdByUserId, callerUserId), isNull(...))`), which the ADL's
  case-sensitive greedy `eq(.*userId` misses. This does not change D3 (that predicate is
  creator-visibility on a global table, the axis D3 deliberately separates), but the exact number
  shouldn't be treated as load-bearing.
- **N3 — cosmetic drift.** ADL cites `cities.ts:728`/`:772`; actual are `727`/`771` (branch-vs-main
  drift). Plus the F4 shading over-claim above.

---

## Bottom line for the COO

Approve the **principles** (D1/D2/D3/D4/D7/D8 and the OQ-1/OQ-2/OQ-3 resolutions). **Hold the
S2/S3 implementation dispatch** until:
1. **B1** — the getDb-in-routes inventory is corrected, S3 is re-scoped to all six route files, and
   the user-owned relocations (places carry-forward, trips detail, items-helper) are marked
   `ATDD-first: yes` with the ATDD matrix (S1) naming those composite read paths.
2. **B2** — the OQ-4 stage numbering is reconciled with §6 to a single, ordering-coherent scheme.

Neither requires re-opening the design. The chokepoint stands; the map of where it must be applied
was drawn one route too small.
