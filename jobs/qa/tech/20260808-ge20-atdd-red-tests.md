# BUG-87 / GE-20 — ATDD RED bar (OP-35), full detail

**Date:** 2026-08-08 · **Author:** QA · **Branch:** `feat/bug87-ge20`
**Tracker:** BUG-87 · **BRD:** GE-20 (approved v3.21)
**Design:** `jobs/architect/tech/ADL-54-trip-country-picker-filter.md`
**Fresh-eyes review:** `jobs/architect/tech/20260808-ADL54-fresh-eyes-review.md` (F1–F6, P1–P3)

Purpose: turn ADL-54/GE-20's success criteria + the fresh-eyes F1/F2 edge cases into RED
acceptance/integration tests — the executable definition of done for Backend's Brief A —
BEFORE Backend writes any implementation code (OP-35 ATDD-first, Brief A marked `yes`).

---

## Files

### `src/backend/routes/__tests__/ge20-cities-country-filter.test.ts`
GET `/api/cities?q=...&country_codes=...` — real migration-backed `:memory:` DB (pattern
mirrored from `cities.search-region-enrichment.test.ts`), real query execution. The whole
point of GE-20's DB half is a WHERE-clause change, so a stubbed repository would prove
nothing — the RED bar has to run the real query against real seeded rows.

| # | Test | Status on main | Asserts |
|---|---|---|---|
| 1 | `country_codes=GB` single-country narrow | **RED** (3 rows returned, expected 1) | Only the GB Newport comes back; US and FR Newports excluded |
| 2 | `country_codes=GB,FR` multi-country union | **RED** (3 rows, expected 2) | Union of GB+FR Newports; US excluded |
| 3 | `country_codes=` (empty string) — F1 guard | **GUARD, passes today vacuously** | SHOW ALL, not zero rows — pins the `inArray(col, [])` → `sql\`false\`` footgun (fresh-eyes F1) for the empty-set case a zero-country trip's frontend actually sends (`[].join(',') === ''`) |
| 4 | absent `country_codes` — regression guard | **PASS** (already true on main) | Unfiltered, backward-compatible |
| 5 | off-country name (Berlin/DE, filter=GB) | **RED** (1 row, expected 0) | Empty array when the only match is outside the declared set |
| 6a | seam (F4) — POST `/api/cities` with `country_code` (D12) | **PASS** (regression guard) | Create path unaffected by the new GET-path feature |
| 6b | seam (F4) — POST `/api/cities` with an errant `country_codes` body field | **PASS** (regression guard, `.strict()` schema) | 400 — the two params cannot cross-talk even if a caller tries |

### `src/backend/routes/__tests__/ge20-geocode-country-filter.test.ts`
GET `/api/geocode?q=...&country_codes=...` — mocks `nominatimSearch` at the service
boundary (matching the existing accepted pattern in `geocode.test.ts` /
`bug76-geocode-contract.test.ts`), but with a **fidelity-extended double** (see Mock-Fidelity
below).

| # | Test | Status on main | Asserts |
|---|---|---|---|
| 1 | `country_codes=GB,FR` → client args + union | **RED** (`capturedParams.countrycodes` undefined; 3 candidates, expected 2) | `nominatimSearch` receives `countrycodes: 'gb,fr'` (CLIENT ARGS, per the brief's explicit instruction); response is the GB+FR union, no US |
| 2 | `country_codes=` (empty string) — F1 guard | **GUARD, passes today vacuously** | No `countrycodes` forwarded at all; all 3 Newports returned |
| 3 | absent `country_codes` — regression guard | **PASS** (already true on main) | Unconstrained DISCOVERY path unchanged |
| 4 | off-country name (Berlin/DE, filter=GB) | **RED** (1 candidate, expected 0) | Empty `candidates` array |

---

## Confirmed RED (2026-08-08, against `main` @ `4c38d90`)

```
npx vitest run --config vitest.config.backend.ts \
  src/backend/routes/__tests__/ge20-cities-country-filter.test.ts \
  src/backend/routes/__tests__/ge20-geocode-country-filter.test.ts

Test Files  2 failed (2)
     Tests  5 failed | 6 passed (11)
```

All 5 failures are clean `AssertionError`s (wrong row/candidate counts) — no import errors,
no thrown exceptions, no schema-validation 400s masking the real gap. This confirms the
tests fail for the *right* reason: `country_codes` is currently a complete no-op (Zod
silently strips the unrecognized query key; nothing downstream ever reads it).

The 6 passing tests are **not** part of the red bar and are labelled explicitly (per the
BUG-76 ATDD precedent — 8/18 tests passed on main there too, documented rather than
miscounted): 4 are genuine regression guards for existing, unrelated-to-this-feature
behaviour (absent-param backward-compat ×2, the POST `/api/cities` seam ×2); 2 (the F1
empty-string cases) pass **vacuously** today because no filtering logic exists yet to trip
the footgun — they exist to catch a specific naive-implementation failure mode once Brief A
lands, not to prove anything about main.

Full backend suite: `npm run test:backend` → **768 passed, 5 failed** (exactly these),
**0 regressions** against the pre-existing 765(+ge20 additions) baseline.
`type:check:backend` clean. `biome check` clean (auto-formatted both new files once).

---

## Mock-fidelity (QUAL-22)

The pre-existing `nominatim-client.js` service-boundary double in `geocode.test.ts`
(BUG-79) is a dumb capture-and-return stub — it records the params `nominatimSearch` was
called with but returns a **fixed** candidate list regardless of `countrycodes`. That is
faithful enough for BUG-79 (which only asserts on `limit`), but reusing it unmodified here
would make every outcome-based GE-20 assertion (union, off-country-empty) pass **vacuously**:
the response would look "correct" only because the double never modelled filtering, not
because the route actually wired `country_codes` through to Nominatim.

Per the dispatch brief's explicit instruction, the double in `ge20-geocode-country-filter.
test.ts` is **extended, not reused as-is**: it holds a small fixture candidate pool (three
countries' "Newport" + one lone "Berlin") and applies `countrycodes` as a real allow-list
filter against that pool — comma-split, case-insensitive — mirroring Nominatim's documented
`countrycodes` narrowing behaviour. It still captures the raw call params too, so the
client-args assertion (test 1) is direct, not inferred from the outcome.

**Honest limit, carried forward (fresh-eyes P2, non-blocking):** this double models what
Nominatim's *documentation* says `countrycodes` does. It is **not** a live probe — this
container's firewall blocks reaching the real service (the same constraint `geocode.test.ts`
already documents). It proves the *route* wires `country_codes` → `countrycodes` correctly
and reacts correctly to a filtered/unfiltered client response; it cannot prove Nominatim
itself honours a multi-code comma list server-side. **Carrying the fresh-eyes recommendation
forward to COO/Backend, unresolved by this thread:** run one real multi-country geocode
against staging early, before this feature is trusted in a UAT verdict.

---

## Design choices and why

- **Two files, not one** — mirrors the existing split between `cities.*.test.ts` and
  `geocode.test.ts` / `bug76-geocode-*.test.ts`; the two endpoints have genuinely different
  test infrastructure (real DB vs. mocked service boundary) and reuse audit pointed at
  extending both existing patterns rather than inventing a third.
- **Real DB for `/api/cities`, mocked service for `/api/geocode`** — not a stylistic choice:
  the cities route's country filter is a Drizzle `WHERE` clause (worth proving against a real
  query), while the geocode route's filter is a pass-through parameter to an external service
  (worth proving via the client-args assertion the brief explicitly asked for, plus an
  outcome check via the fidelity-extended double).
- **F1 guard tests kept despite not being RED** — the brief flagged F1 as the single most
  important non-blocking finding in the fresh-eyes review ("an implementation footgun that
  inverts Q1"). A red bar that omitted the empty-string case entirely would let a naive
  `inArray`-always-pushed implementation pass every other test while silently producing the
  exact zero-rows-on-a-new-trip behaviour the PO rejected. Keeping it, labelled honestly as a
  vacuous-pass guard rather than pretending it's RED, is the correct ATDD discipline — the
  BUG-76 precedent (`jobs/qa/tech/20260807-bug76-atdd-red-tests.md`) does the same thing.
- **Seam test (F4) scoped to POST `/api/cities`, not GET `/api/cities` both-params
  precedence** — the fresh-eyes review explicitly left the GET-path precedence question
  (both `country_code` singular and `country_codes` plural present simultaneously)
  unspecified and assigned it to Brief A ("Brief A should state the cities-path contract
  explicitly so the implementer doesn't guess" — F4). Pinning an undecided precedence in the
  ATDD bar would have put words in Backend's mouth. What GE-20 does need proven — and what I
  did prove — is that the D12 create-path constraint (a completely separate schema, body-only,
  `.strict()`) has zero mechanical overlap with the new GET-path filter, which the `.strict()`
  rejection test demonstrates structurally rather than by assumption.
- **Not added:** an "invalid `country_codes` value → 400" test. ADL-54 §4 recommends schema-
  level rejection of invalid codes and a ≤10 cap as Brief A implementation details, but neither
  was in the dispatch's enumerated 7-item test list. Flagging this as a **noted gap**, not
  silently adding scope to a bar Backend is meant to implement exactly against — see completion
  report.

---

## Two-probe note (mock-fidelity claim)

Claim: "the existing `nominatim-client.js` double in `geocode.test.ts` doesn't model
`countrycodes`." Verified two ways that could fail differently: (1) read the file in full —
`nominatimSearch: vi.fn(async (params) => { capturedParams = params; return nextResult; })`,
where `nextResult` is a module-level fixed value never conditioned on `params`; (2) ran that
exact file's existing test suite (`geocode.test.ts`, part of the full backend run above) and
confirmed all 5 of its own tests still pass unmodified — meaning nothing in that file's
double logic branches on `countrycodes` today. Both probes agree: the double is a dumb
capture-and-return stub, hence the fidelity extension in this thread's new double.
