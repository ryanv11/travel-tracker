# QUAL-54 / QUAL-19 — CSP observability: probe evidence and test design

Date: 2026-08-27 · Branch: `fix/qual54-qual19-csp-observability` · Issue #551
Author: QA · Related: QUAL-20 (reopened), QUAL-18, BUG-101, BUG-55, BUG-68

---

## 1. Why the shakedown console check could not be read

The check failed on all six runs since 2026-08-04. Its entire output, every time:

```
 Note that 'script-src' was not explicitly set, so 'default-src' is used as a fallback.
```

A subordinate clause with no subject. Reproduced locally byte-for-byte. It is **not**
truncation, and `msg.args()` cannot recover the missing sentence — Playwright hardcodes an
empty args array for this message class (`crPage.js:687`), which makes the tracker's
original "capture all args" prescription inert.

## 2. Probe results — what each channel actually sees

Five probes, `scratchpad/cspprobe/probe6..10.mjs`. Chromium via Playwright, local Express
origins so the CSP is under our control.

| Scenario | `page.on('console')` | DOM `securitypolicyviolation` | raw CDP `Log.entryAdded` |
|---|---|---|---|
| Document `fetch` to un-allowlisted origin | sees it, `location().url` = **offending script's URL** | sees it, structured fields | sees it |
| Document `eval()`, `script-src` **explicitly set** | **0 messages** | sees it (`blockedURI: eval`) | 0 |
| Document `eval()`, `script-src` **absent** | 1 message — the dangling note, `location().url` = offending script | sees it | sees it |
| `blob:` worker `eval()`, `script-src` set | 0 | 0 | **0** |
| `blob:` worker `fetch`/`importScripts` blocked | **0** | **0** | **3 entries**, `source: "worker"` |

Three findings that drove the design:

1. **`msg.location().url` attributes to the script that caused the violation, not to the
   document.** A third-party SDK's violation reports the SDK's URL; our bundle's reports
   ours. This is what makes origin-scoping precise rather than a blunt text filter — and it
   matters because the dangling-note message contains no URL at all, so text matching could
   never have worked.
2. **A blocked `eval()` emits nothing on the console channel when `script-src` is explicitly
   set.** The DOM event is the only channel that sees it. Since `server.ts` always sets
   `scriptSrc`, the *old* check was structurally blind to every own-origin eval violation.
3. **Worker-sourced violations reach only the raw CDP stream.** Playwright drops them
   (`crPage.js:681`) and a worker has no document, so the DOM listener cannot see them.
   The CDP reader is not a nice-to-have; it is the sole channel for that class.

## 3. A correction to the brief's diagnosis (probe-established)

The brief states the staging failure is "a CSP-blocked `eval()` under a policy with no
`script-src`". The *message* reproduces exactly under those conditions. The *policy* cannot
be ours:

- `git show 0dac8e8:src/backend/server.ts` — the commit staging was confirmed to be serving
  when the failure was captured — has `scriptSrc` explicitly set on line 122, in both
  branches of the `CLERK_ORIGIN` ternary.
- Under an explicit `script-src`, a document-context `eval()` violation emits **zero**
  console messages (probe 7, cases A1/A2). The captured staging error arrived via
  `page.on('console')`, so it cannot have come from a context governed by our CSP.

**Therefore the violating context has its own, different policy — a cross-origin iframe or
worker served by a third party (Clerk's sign-in flow uses both).** This is good news for the
fix: origin-scoping should clear the permanent red, because `location().url` will carry the
third party's origin (probe 7, case B2 confirms attribution works in exactly that shape).

**Status: UNVERIFIED against staging.** Staging is down (billing lapse). The probe that
would settle it is a `workflow_dispatch` run of the shakedown once staging returns — the new
instrumentation will print the violated directive, blocked URI and source file, which names
the context directly. Blind spot of the reasoning as it stands: it assumes the deployed
process was running the code at `0dac8e8`; `/health` confirmed that SHA at the time
(run 30941449115), but the CSP header itself was never captured.

## 4. Local reproduction — QUAL-54 acceptance evidence

Staging is unreachable, so the **real** `shakedown.spec.ts` console check was run against a
local fixture serving `server.ts`'s exact directive set
(`scratchpad/cspprobe/fixture-server.mjs`, `run-scenarios.sh`).

| Scenario | Expected | Result |
|---|---|---|
| `clean` — no violations | pass | **PASS** |
| `noise` — third-party SDK evals + beacons a blocked origin (BUG-68 shape) | pass, noise reported | **PASS**, 4 noise lines printed + annotated |
| `ours-connect` — our bundle fetches un-allowlisted origin (BUG-55 shape) | fail, named | **FAIL** — `CSP connect-src blocked https://nominatim.openstreetmap.org/... — from http://localhost:4901/app.js:1` |
| `ours-eval` — our bundle calls `eval()` (staging signature) | fail, named | **FAIL** — `CSP script-src blocked eval — from .../app.js:1`, with **zero** console errors; caught solely by the DOM event channel |
| `ours-worker` — our worker fetches blocked origin | fail, named | **FAIL** — caught solely by the CDP channel |

`ours-eval` is the decisive case: the old check produced no output and **passed** there.

## 5. The scoping decision, and what it costs

The check now fails only on errors attributable to the origin under test. Explicitly:

- **What it lets through:** a violation caused by third-party SDK code no longer fails the
  check. Concretely the BUG-68 class. Those are still captured, printed to the run log and
  attached as `third-party-noise` annotations — demoted from fatal to visible, not silenced.
- **Fail closed on doubt:** anything with no attributable source URL is treated as ours.
- **Known ambiguity:** a `blob:` worker inherits the *creating page's* origin, so a worker
  spun up by a third-party SDK reports as `blob:<our-origin>/…` and is attributed to us.
  Conservative direction — can cause a failure a human must reclassify, never a silent pass.
- **Reduced coverage is announced:** if the CDP session cannot be opened, the run annotates
  `reduced-coverage` rather than quietly losing the worker channel.

**Residual risk to flag:** Clerk does spin a `blob:` worker (see `server.ts`'s `worker-src`
comment). If that worker violates our policy on staging, this check will go red and the
output will name exactly what it is. That is the intended behaviour, but it means criterion
(1) — "no longer fails on third-party noise" — is demonstrated locally and **not yet
observed on the deployed target**.

## 6. QUAL-19 design notes

`src/backend/__tests__/csp-allowlist.test.ts`. No network, no browser, ~30ms.

- Both CSP configs are read from the **TypeScript AST**, because `server.ts` cannot be
  imported (it calls `startup()` at module scope — opens the DB, seeds, binds a port).
- The parser is **not trusted on faith**: one test re-reads the same directives from a live
  `supertest` response against `server-test-app.ts` and compares. If the parse drifts from
  reality, that test fails rather than the file silently asserting nonsense.
- Scope decisions stated in the file's own header comment, per QUAL-19's tracker note:
  third-party SDK egress is **out of scope** (BUG-68's origin lives in `clerk.browser.js`,
  invisible to any scan of our source); runtime-derived origins (Clerk's, decoded from the
  publishable key) are neither asserted nor assumed; dynamically assembled URLs are invisible.
- Mutation-verified, not assumed. Adding a first-party `fetch` to
  `nominatim.openstreetmap.org` produced:
  `nominatim.openstreetmap.org / referenced at: src/frontend/hooks/__mutationProbe.ts:4 /
  missing from: connect-src (currently ["'self'","*.maptiler.com","<CLERK_ORIGIN>"])`.
  An `<img src>` to an un-allowlisted host was correctly routed to `img-src`.

### BUG-101 red bar — why `it.fails`, not `describe.skip`

The repo convention is `.skip` with a marker, but the 2026-08-26 QA session already
established that vitest's default reporter prints only a skip **count**, not names — so a
skipped marker does not answer "the known defect hides on a green board". Same conclusion
here, so:

- `it.fails('server.ts and server-test-app.ts emit the same CSP [BUG-101 …]')` — **live and
  named** in the test output, asserts the real desired condition, and **inverts
  automatically**: when the consolidation lands, this goes RED and whoever fixed it must
  remove `.fails`. Verified by mutation (making the two configs agree turns it red).
- Plus a live green **drift fence** pinning the divergence to exactly
  `['connect-src','img-src','script-src','worker-src']` — because `it.fails` only
  distinguishes "differs" from "identical" and would absorb any *new* divergence silently.
  Also mutation-verified.

### Hazard handed to the BUG-101 fixer

Found by mutation, recorded in the test file: the parser self-check holds only while
`server-test-app.ts`'s directives are unconditional. Give it `server.ts`'s
`CLERK_ORIGIN ? … : …` ternaries and the parser models the truthy branch while the test
process (no `CLERK_ISSUER`) emits the falsy one — failing for a reason unrelated to the CSP.
Set `CLERK_ISSUER` for the test or compare against the branch the environment selects.

## 7. Coverage gap found while working, not fixed here

`src/e2e-shakedown/**` and `src/e2e/**` are in **neither** `tsconfig.backend.json` nor
`tsconfig.frontend.json` (verified by reading both `include` arrays). So `npm run
type:check:all` never type-checks either Playwright suite. This file's edits were
type-checked with an ad-hoc `tsc` invocation instead. Pre-existing, out of scope for this
brief, worth a tracker entry.
