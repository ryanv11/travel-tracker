# QA — BUG-75 / GE-16 city-identity: final independent verification

**Branch:** `feat/bug75-qa-verify` (off `release/bug75-city-identity`) — pushed, no PR (COO merges into release).
**Commit:** `0a4f597` — the ONE test-setup seeding fix.
**Date:** 2026-08-06

---

## §1 — Test-setup fix (COO-verified defect)

`src/backend/migrations/__tests__/bug75-identity-migration.test.ts`, case *"multiple
NULL-osm_id rows do NOT collide on the resolved-by-OSM index"* raw-inserted cities with
`created_by_user_id = 'user-x'/'user-y'` but never seeded those users. `created_by_user_id`
is an FK to `users.id` (schema.ts:119) and `createTestDb()` runs `PRAGMA foreign_keys = ON`,
so both inserts died on `SQLITE_CONSTRAINT_FOREIGNKEY` **before** the partial-index assertion
was reached. Reproduced the failure first (8 passed / 1 failed), then seeded `user-x` and
`user-y` via raw `INSERT INTO users` ahead of the city inserts. **Assertion unchanged** — the
two distinct-creator NULL-osm_id pending rows still must coexist, and now genuinely do.
Migration suite: **9/9 green**.

## §2 — Whole suite (exact counts, run after the fix)

| Gate | Result |
|---|---|
| `npm run test:backend` | **740 / 740** (42 files) |
| `npm run test:frontend` | **273 / 273** (38 files) |
| `npm run type:check:all` | clean (exit 0) |
| `npm run check` (biome ci) | exit 0 — 5 pre-existing `useLiteralKeys` *infos* (non-blocking, not mine) |
| `npm run status:check` | STATUS.md in sync |

All five pre-push gates green.

---

## §3 — Criterion-by-criterion verification (genuinely-met / vacuous / gap)

Read every acceptance test against the code it exercises. The backend suite
(`cities.identity-carry.test.ts`) is **strong**: it does NOT mock `geocoding.service` away
(only the Nominatim egress), it drives the REAL `POST /api/cities` + REAL `CreateCitySchema`,
and it carries a **mechanical mock-fidelity gate** (asserts the nominatim-client double's
function-export set is a superset of the real module's, and a second test proves
`nominatimLookup` is actually *reached* by the carried-id path — the exact QUAL-22 hole).

| Crit | What it claims | Verdict |
|---|---|---|
| #1 Coexistence | Two same-region Newports (distinct osm_id) both persist as distinct rows | **Genuinely met** — real route + real schema; asserts 2 rows, distinct ids, each carrying its own osm_id |
| #2 Same-place merge | Same osm_id twice → one row, 200 reuse | **Genuinely met** |
| #3 M-A stamp | Non-carried resolve stamps osm_id; two users → ONE osm_id row, zero NULL-osm dupes | **Genuinely met** |
| #5 M-B terminal | Carried id, `/lookup` 200-empty → pending (retains ref), never 500 | **Genuinely met** |
| #6 Concurrency | Two concurrent same-osm POSTs merge to one row, never 500 | **Genuinely met** for the create-race path (see §4 for the caveat) |
| #7 Carry-overs | No client coords (400), server-canonical coords, D12 region ground-truth, pending containment, access matrix | **Genuinely met** |
| Migration end-state | EXPAND cols nullable; SWITCH index set; both-or-neither CHECK; coexist vs same-osm-collide | **Genuinely met** (9/9, incl. the fixed case) |
| Frontend picker (#4/#1) | Picker fires on same-region ≥2-osm ambiguity; carries the pick's identity + derived region_id; inherits truncated caveat | **Met, but see the coherence gap below** — the fixture is not production-faithful |

No criterion is vacuous **at its own layer**. The gap is a **cross-layer / production-fidelity**
one, described next.

---

## §3 — Denver-vs-Newport coherence verdict (the flagged cross-agent question)

I traced the trigger across `proxy (geocode.ts) → nominatim-client → lookupCityCountry →
AddPlaceFlow.handleOpenNewCityForm`. The frontend branch order (AddPlaceFlow.tsx:395-409) is:

```
1. sameCountryRegionIsos.length > 1   → region <select> (multi-region)
2. else distinctOsmIds.size > 1       → place-level CityPicker
3. else regionIso                     → single auto-suggest
```

### (b) Denver does NOT over-fire — but NOT for the reason the brief states

**The brief's stated mechanism is wrong.** The `address.county` "M2 granularity-collapse" does
**not** exist in the path that feeds the picker. Two independent probes:
1. `grep county src/backend` (non-test) → `county` appears **only** as a parsed field in
   `nominatim-client.ts`. It is never consumed by `classifyCandidates` or anything else.
2. The proxy route's candidate `.map()` (`geocode.ts:104-113`) emits
   `{name, display_name, country_code, region_iso, lat, lon, osm_type, osm_id}` — **`county`
   is not emitted to the frontend at all.** The frontend `GeocodeCandidate` type has no
   `county` field.

`county` is **parsed-but-dead** in this path. What *actually* keeps Denver from over-firing:
- **`SETTLEMENT_TYPES` filter** (nominatim-client.ts:116, applied before the proxy maps) drops
  the `administrative`/boundary "Denver County" row — so the granularity twin never reaches the
  frontend as a second candidate. (The Denver *parity* fixture in `AddPlaceFlow.test.tsx` models
  this collapse by hand, with **no osm_id on either row** → `distinctOsmIds.size = 0`.)
- **Branch order**: a real "Denver" discovery returns Denvers across multiple regions
  (CO/IA/PA/NC…), so `sameCountryRegionIsos.length > 1` fires branch 1 (region selector) before
  the osm-count branch is even reached.

**Conclusion: Denver does not over-fire.** But flag the brief/tracker's causal note as
inaccurate — do not carry "county collapse protects Denver" forward as fact.

### Residual over-fire risk (real, not Denver-specific) — UNVERIFIED against live Nominatim

The picker's gate is `distinctOsmIds.size > 1` among same-region candidates. `classifyCandidates`'
own comment (geocoding.service.ts:136-138) states Nominatim **routinely** returns one real place
at several settlement granularities (`city` + `municipality`, both surviving the settlement
filter) sharing one region_iso. Those twins have **distinct osm refs** → `distinctOsmIds.size = 2`,
same region → **branch 2 fires the picker spuriously**, showing two display_names for one place.
The backend classifier calls that same set *non-ambiguous* (1 region) — a real
**frontend/backend divergence** the county discriminator was designed to close but isn't wired to.
Impact is UX-quality (an extra prompt; and if two users pick different granularities, two
coexisting rows for one real place), **not** data corruption. UNVERIFIED whether Denver
specifically produces such a same-region distinct-osm twin (firewall blocks live Nominatim);
likely not for Denver (its twin is administrative, filtered), but plausible for other cities.

### (a) Four-Newport — the picker mechanism is sound, but production-reachability is UNVERIFIED and probably compromised for the flagship name

- **When it fires, it works.** Frontend carry test proves the pick's `{osm_type, osm_id,
  display_name}` + region_id-derived-from-region_iso reach `POST /api/cities`; backend #1 proves
  the two carried refs persist as distinct coexisting rows. That half is **genuinely met**.
- **But the test fixture omits Newport, Wales.** `sameRegionNewports()` hands the flow exactly
  two GB-ENG candidates, so branch 1 is skipped and the picker fires. In **production**, a real
  unconstrained "Newport" discovery almost certainly also returns **Newport, Wales (GB-WLS)** (a
  larger city) → `sameCountryRegionIsos = {GB-ENG, GB-WLS}` → **branch 1 fires the region
  selector**, and the two GB-ENG Newports collapse back into the single "England" option — the
  exact structural insufficiency the feature exists to fix. Selecting "England" then goes through
  `handleCreateCity` (no osm carry) → backend resolves region GB-ENG to `matches[0]` and stamps
  that one osm_id; a later attempt at the *other* England Newport resolves to the same
  `matches[0]` and **merges into it** — the second England Newport becomes unreachable via this
  flow.
- This is **UNVERIFIED** (I cannot reach live Nominatim from this container — same limitation the
  code comments themselves record). It is a reasoned risk from the branch ordering + the
  fixture's omission, not an established fact. **It must be probed at live/UAT** before BUG-75 is
  closed as *done*: run the real "Newport" discovery and confirm whether the picker actually
  fires, or whether Newport-Wales routes it to the region selector and re-collapses the two
  England Newports.

**Coherence verdict:** The picker is internally coherent and safe *when it fires*. The
open question is **reachability**, not correctness: the region-distinct branch (correctly)
shields Denver, but the *same branch* likely shields the flagship Newport case out of the picker
in production. The suite is green on a curated same-region-only fixture that the real "Newport"
lookup won't reproduce in isolation — a mock-fidelity gap in the spirit of QUAL-22, at the
frontend layer.

---

## §4 — M1 deviation assessment (assess, not fix)

**Concurrency criterion #6 genuinely holds** for the path it tests: two concurrent carried-osm
`POST /api/cities` converge on one row, both 200/201, never 500. That path is
`insertCityOrReuse` (cities.ts:277) — a **single atomic INSERT** guarded by the
`uniq_cities_osm_ref` unique index + catch-and-reselect. A single INSERT needs no transaction;
verdict on that path: **correct as-is.**

**The transaction-constraint claim is verified (two independent probes):** the code comment
(cities.ts:270-275) *and* an independent comment at `repositories/trips.ts:282-284` both record
that `db.transaction()` nulls the libSQL `:memory:` client's internal `#db` reference. Real
constraint, not a single-probe assertion.

**However, the multi-statement merge path has a genuine, untested crash-safety gap:**
- `mergeIntoWinner` (geocoding.service.ts:330-356) does **two separate awaited statements** —
  `UPDATE trip_places SET city_id = winner WHERE city_id = loser`, then `DELETE loser city` —
  with **no atomic wrapper**. A process crash *between* them leaves an **orphaned, dereferenced
  loser city row** (still pending, no osm ref, no trip_places pointing at it). That is **not data
  loss** (trip_places are safely on the winner) and **not a 500** — a cleanup/orphan concern only.
- **`db.transaction()` is not the only option.** `trips.ts:282` proves **`db.batch()` is safe on
  `:memory:`** and is used there precisely for atomic multi-statement writes. So the deviation's
  justification is *true but incomplete*: `db.batch([repoint, delete])` would close the gap
  without touching `db.transaction()`.
- **This path is covered by ZERO tests.** Two probes: `grep mergeIntoWinner|commitResolvedOrMerge
  src/backend` → source-only (never a test); `grep trip_places/repoint` in the identity-carry and
  geocoding.service tests → no hits. The `resolveCity` queue path that merges a *pending* row into
  an already-resolved twin **and repoints its trip_places** is never exercised. #6 exercises the
  create-race (`insertCityOrReuse`), a different path.

**M1 verdict: acceptable-as-is for this merge, NEEDS-FOLLOW-UP (not a blocker).** No data-loss or
500 path; concurrency criterion holds. Follow-ups to log:
1. Wrap `mergeIntoWinner`'s repoint+delete in `db.batch()` for crash-atomicity (mechanism already
   proven safe on `:memory:` at trips.ts:282).
2. Add a test that puts a real `trip_place` on the loser, forces a pending→resolved twin merge via
   `resolveCity`, and asserts the repoint + loser-delete (currently zero coverage of that branch).

---

## Safe to merge release → main? **YES — with conditions.**

**Correctness / data-integrity: safe.** 740 + 273 green; migration end-state locked (incl. the
fixed FK case); coexistence, same-place merge, M-A stamp, M-B terminal, concurrency (create-race),
and the access matrix all genuinely met at their own layers; no data-loss or unhandled-500 path
found; no test weakened.

**Two items must NOT be closed silently — they are follow-ups, not merge blockers:**
1. **(P1-ish, feature value) Newport reachability** — UNVERIFIED. Probe the real "Newport"
   discovery at live/UAT; if Newport-Wales routes it to the region selector, the flagship BUG-75
   scenario is not actually delivered end-to-end and needs a design follow-up (e.g. re-run the
   picker after a region narrows to one, or gate the region-selector branch behind an osm-count
   check). **Do not mark BUG-75 done on the green bar alone.**
2. **(P2, correctness-of-narrative + latent dup) Two things:** (a) correct the "county/M2 collapse
   protects Denver" claim in the brief/tracker — it is parsed-but-dead code; the real guards are
   the settlement-type filter + branch order; (b) the picker's `distinctOsmIds` gate can over-fire
   on same-region granularity twins → log the `mergeIntoWinner` `db.batch()` + missing-test
   follow-up from §4 alongside it.

The release is safe to land on `main` (green, non-regressive, no data risk). BUG-75's *closure as
UAT-done* should wait on the live Newport/Denver discovery probe in items 1–2.
