# BUG-76 (P1) / BUG-74 (P2) — ATDD RED acceptance suite (OP-35)

**Branch:** `feat/bug76-accept-rule-fix` (pushed, no PR — Backend branches from this lineage)
**Design doc:** `jobs/architect/tech/20260807-BUG76-accept-rule-design.md` §7 (as amended §9.9)
**Spec:** AC-0 … AC-13

## Files

| File | Covers | Mock boundary |
|---|---|---|
| `src/backend/services/__tests__/bug76-accept-rule.test.ts` | AC-0, AC-1, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8 (+statistical variant), AC-8b, AC-9, AC-10 | `global.fetch` — real captured `format=json` fixtures loaded off disk, never pre-parsed candidates |
| `src/backend/routes/__tests__/bug76-geocode-e2e.test.ts` | AC-2 | `global.fetch` only — real `nominatimSearch` + real accept-rule run through the real route |
| `src/backend/routes/__tests__/bug76-geocode-contract.test.ts` | AC-11, AC-12, AC-13 | `nominatimSearch` service boundary (matches the existing, accepted `geocode.test.ts`/BUG-79 pattern — see rationale below) |

## AC → test mapping

| AC | Test | Red on main? |
|---|---|---|
| AC-0 | `bug76-accept-rule.test.ts` › `AC-0 — outgoing request…` (2 cases: search, lookup) | **No — see "Not red" below** |
| AC-1 | `bug76-accept-rule.test.ts` › `AC-1 — denver_us.json…` | **Yes** |
| AC-2 | `bug76-geocode-e2e.test.ts` › `AC-2 — auto-populates…` | **Yes** |
| AC-3 | `bug76-accept-rule.test.ts` › `AC-3 — springfield_us.json…` | **Yes** |
| AC-4 | `bug76-accept-rule.test.ts` › `AC-4 — neg_cook_county.json…` | No — see below |
| AC-5 | `bug76-accept-rule.test.ts` › `AC-5 — neg_colorado_state.json…` | No — see below |
| AC-6 | `bug76-accept-rule.test.ts` › `AC-6 — Denver CO … WHILE Cook County…` | **Yes** |
| AC-7 | `bug76-accept-rule.test.ts` › `AC-7 — springfield_global.json…suburb…` | No — see below |
| AC-8 | `bug76-accept-rule.test.ts` › `AC-8 — springfield_us.json…` + `AC-8 (statistical variant)…` | No — see below |
| AC-8b | `bug76-accept-rule.test.ts` › `AC-8b — cdp_paradise_nv.json…` | No — see below |
| AC-9 | `bug76-accept-rule.test.ts` › `AC-9 — springfield_global.json…municipality…` | **Yes** |
| AC-10 | `bug76-accept-rule.test.ts` › `AC-10 — nominatimLookup…` | **Yes** |
| AC-11 | `bug76-geocode-contract.test.ts` › `AC-11a`, `AC-11b` | **Yes** |
| AC-12 | `bug76-geocode-contract.test.ts` › `AC-12…` | **Yes** |
| AC-13 | `bug76-geocode-contract.test.ts` › `AC-13 (smoke)…` | **Yes** (on the one assertion the AC is actually about — `res.body.status`; flagged as not fully independently expressible, see below) |

**Verified run (2026-08-07, against main via this branch before any production code touched):**
`npx vitest run --config vitest.config.backend.ts <the 3 new files>` → **10 failed, 8 passed**
(18 total). Every failure is a clean `AssertionError` (e.g. `expected 0 to be greater than 0`,
`expected undefined to be 'error'`) — zero import errors, zero thrown exceptions, zero broken
mocks. `npm run test:backend` (full suite) confirms **no collateral damage**: 748/758 passing,
all 10 failures are the new ATDD file; the other 42 pre-existing test files are unaffected.
`npm run type:check:backend` and `npm run check` (Biome) are clean on the new files.

## Why 8/18 assertions already pass on main — flagged, not hidden

The current bug (`nominatim-client.ts` `SETTLEMENT_TYPES.has(candidate.type)`, keyed on
Nominatim's **class-type** `type` field) is an **over-broad reject**, not an under-broad one:
every fixture row shaped `type=administrative` (or `type=census`/`type=waterway`) is dropped
today regardless of what its `addresstype` says — including the county/state/river/suburb/
census/statistical rows the negative ACs (AC-4, AC-5, AC-7, AC-8, AC-8b) exist to guard
against. Those rows were never going to be admitted by today's code, for the wrong reason (the
bug also drops the true positives — Denver, Springfield IL/MO/MA — that's the actual defect).
So the negative-ACs pass on main already, and will continue to pass after the fix — they are
**regression guards for the corrected `addresstype`-keyed rule** (pinning against a future
over-widening, per D4/D5's explicit "reversible/tunable" framing), not red specifications of
this fix. This is stated in the file header and inline above each such test, verified by
running the suite (not asserted from reading the code alone — the two-probe standard: reading
the filter logic AND running it against the real fixtures, which is exactly what this suite
is).

**AC-0** is a genuine precondition, also already true: `nominatim-client.ts:214`/`:256`
unconditionally force `format=json&addressdetails=1` regardless of the accept-rule bug — this
was never broken, and the fix doesn't touch it (design doc §9.1: production stays on
`format=json`). AC-0 exists as the QUAL-22 mock-fidelity gate (proving the test double is wired
to the real outgoing URL, not bypassed) and as a regression guard against a future accidental
switch to `jsonv2` (which would silently break `parseCandidate`'s `raw.class` read) — not as a
red spec of the accept-rule fix.

**AC-13** is architecturally impossible to express as fully red pre-fix: there is no `status`
field on the response yet, so nothing can be backward-INcompatible with it. Operationalized two
ways instead: (a) the ONE assertion the AC is actually about (`res.body.status`) is red today;
(b) the pre-existing `geocode.test.ts` (BUG-79) suite is left completely unmodified by this
brief and continues passing unchanged — proving existing consumers/fixtures that never read
`status` are unaffected by its future addition.

**The genuinely red, load-bearing spec of this fix:** AC-1, AC-2, AC-3, AC-6, AC-9, AC-10 (the
admission side — real cities currently dropped) plus AC-11/AC-12/AC-13 (the BUG-74 status field,
which doesn't exist at all today).

## Mock-fidelity measure (OP-35 / QUAL-22)

1. **Fixture provenance.** Every fixture consumed by `bug76-accept-rule.test.ts` and
   `bug76-geocode-e2e.test.ts` is `readFileSync`'d verbatim from
   `src/backend/services/__tests__/fixtures/nominatim/bug76/*.json` — never hand-authored
   inline. These are the Architect-committed, live-captured `format=json&addressdetails=1`
   bodies (design doc §9.1, README.md in the fixtures dir).
2. **Mock boundary.** The double replaces `global.fetch` — the exact function
   `fetchNominatim` calls (`nominatim-client.ts:188`) — returning `{ok:true, status:200,
   json: async () => <raw fixture array>}`. `parseCandidate` therefore runs against the real
   raw shape (`class`, `type`, `addresstype`, `address{}`), not a pre-parsed
   `NominatimCandidate`. This is the same technique the pre-existing, QUAL-22-citing
   `nominatim-client.test.ts` already uses for the BUG-79 truncation suite.
3. **Sanity check the double is actually exercised.** Every test asserts
   `expect(fetch).toHaveBeenCalledTimes(1)` before inspecting the result — this is the direct
   antidote to the QUAL-22 failure mode (a mock silently never hit, or an exception swallowed
   by a try/catch, still produces "0 candidates" that could be misread as a correct empty
   result rather than a broken double). AC-0 additionally asserts on the *literal constructed
   URL* (`format=json`, `addressdetails=1`), which is only possible if the real
   `nominatimSearch`/`nominatimLookup` code actually ran and built it — a stubbed-out
   short-circuit could not produce this string.
4. **Sanity check the double affects the outcome differently per fixture.** AC-1 (0 admitted
   pre-fix) vs. AC-4 (0 admitted, but for the correct reason both before and after) vs. AC-9
   (municipality row present in the 40-row fixture but currently absent from `candidates`)
   all draw from *different* fixture files through the *identical* mock helper — proving the
   fixture content, not the mock plumbing, drives the result.
5. **`bug76-geocode-contract.test.ts` mocks at the `nominatimSearch` service boundary
   instead**, matching the existing accepted `geocode.test.ts` (BUG-79) pattern. This is
   deliberate, not a shortcut: AC-11/12/13 test the ROUTE's handling of an already-typed
   `NominatimSearchResult` discriminated union, not whether raw Nominatim JSON parses
   correctly (that's AC-0–AC-10's job, covered with real fixtures at the `fetch` boundary in
   the other two files). Stubbing the service return value here cannot pass vacuously: the
   values asserted on (`status`, `candidates`) are exactly what the mock returns, and the
   route's `res.json()` serialization is what's under test.

## No production code touched

Confirmed via `git status`/`git diff` — only the 3 new test files were added. `SETTLEMENT_TYPES`,
`parseCandidate`, and `geocode.ts`'s response serialization are untouched on this branch.

## Handoff to Backend

Backend branches from `feat/bug76-accept-rule-fix` (already pushed) and implements per the
design doc (§3 accept-rule keyed on `addressType: raw.addresstype`, §6 the `status` contract)
until all 18 assertions are green, `type:check:all` is clean, and no other backend suite
regresses.
