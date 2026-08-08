# QA completion report — BUG-76 (P1) / BUG-74 (P2) ATDD RED acceptance suite

**Tracker:** BUG-76 (P1), BUG-74 (P2, ride-along) · **GitHub:** #382 (BUG-76 reopen) ·
**BRD:** n/a (bug fix, no new requirement) · **Branch:** `feat/bug76-accept-rule-fix`
(pushed, **no PR** — per brief, a red PR would show red CI by design)

## What was tested (scope, build ref)

Turned the Architect's design (`jobs/architect/tech/20260807-BUG76-accept-rule-design.md`
§7/§9.9, AC-0..AC-13) into a RED, pre-implementation acceptance suite against `main`
(OP-35 ATDD-first — this brief is Architect-spawned). 3 new files, 18 assertions, **zero
production code touched**.

## Pass/Fail verdict per AC

| AC | Red on main? |
|---|---|
| AC-1, AC-2, AC-3, AC-6, AC-9, AC-10 | **RED** — clean AssertionErrors, the load-bearing admission-side spec |
| AC-11, AC-12, AC-13 | **RED** — the `status` field doesn't exist on the response at all today |
| AC-0, AC-4, AC-5, AC-7, AC-8 (x2), AC-8b | **Already green on main** — flagged, not a defect in the suite (see below) |

**10/18 assertions RED for the right reason** (verified: `npx vitest run --config
vitest.config.backend.ts` on the 3 new files → 10 failed/8 passed, every failure a clean
`AssertionError`, zero import errors/exceptions/broken mocks). Full backend suite
(`npm run test:backend`): 748/758 passing — no collateral damage, the 10 failures are
exactly the new file's intentional reds. `type:check:backend` and `npm run check` (Biome)
clean.

**Why 8/18 already pass — QA finding, not a suite defect:** the current bug over-rejects
rather than under-rejects. It keys on Nominatim's `type` field and drops every
`type=administrative` row wholesale — this catches the false positives (county/state/
suburb/census/statistical) AND the true positives (Denver, Springfield IL/MO/MA) alike.
So AC-4/5/7/8/8b (the "don't admit a county/suburb/census" cases) already hold today, for
the wrong reason — they're regression guards for the *corrected* rule, not red specs of
this fix. AC-0 (URL format) was never broken — production already sends
`format=json&addressdetails=1` unconditionally; it's a QUAL-22 mock-fidelity gate, not
fix behaviour. Full reasoning + per-row evidence: `jobs/qa/tech/20260807-bug76-atdd-red-tests.md`.

## Mock-fidelity measure (OP-35/QUAL-22)

Accept-rule + e2e files mock `global.fetch` (the real `fetchNominatim` boundary) with the
exact committed `format=json` fixtures loaded off disk — never pre-parsed candidates.
Every test asserts `fetch` was called exactly once (sanity check the double is actually
exercised, not silently bypassed). AC-0 proves the mock is wired to the real constructed
URL. The BUG-74 contract file mocks `nominatimSearch` at the service boundary instead —
deliberate: it tests route serialization of an already-typed union, not raw-JSON parsing
(that's the other two files' job); matches the existing accepted `geocode.test.ts`/BUG-79
pattern. Full detail in the tech doc.

## Bugs found

None new — this is a pre-implementation ATDD suite for an already-tracked defect
(BUG-76/BUG-74), not a live-testing pass.

## CI

No PR opened (per brief). Branch pushed and confirmed: `git status` clean, 3 new files
committed, `feat/bug76-accept-rule-fix` on `origin`.

## Open issues / blockers

None. Handoff: Backend implements against this branch (design §3 `addressType`-keyed
predicate, §6 `status` contract) until all 18 assertions are green, `type:check:all`
clean, and no other backend suite regresses.

Full detail: `jobs/qa/tech/20260807-bug76-atdd-red-tests.md` · Park doc:
`jobs/qa/park-docs/20260807-QA-park.txt`
