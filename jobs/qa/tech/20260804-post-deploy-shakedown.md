# QUAL-20 — Automated post-deploy shakedown

**Date:** 2026-08-04
**Tracker:** QUAL-20 (implements). Siblings: QUAL-18 (E2E topology), QUAL-19 (CSP allowlist static
test), ENV-02 (staging edge 502s), ADL-49 (geocoder allowlist/fixtures), BUG-76 (denver/settlement
filter).
**Branch:** `chore/qual20-post-deploy-shakedown`

---

## 0. What this is, in one paragraph

A Playwright suite (`src/e2e-shakedown/shakedown.spec.ts`, run via `playwright.shakedown.config.ts`)
that hits the **already-deployed staging URL** directly and checks five things: the app loads, the
console is clean, nothing in the page's network lifecycle 5xxs (with an ENV-02-aware retry), the
document actually carries a CSP header, and `/health` answers. It runs from GitHub Actions
(`.github/workflows/post-deploy-shakedown.yml`), not from this devcontainer, because the
devcontainer's own firewall cannot reach the staging domain (§2). **It does not replace UAT and does
not test product behaviour** — it tests whether the deployment itself is intact, which is the
mechanical half of OP-32's shakedown rule and the half a PO should never have to do by hand.

---

## 1. Why the scope stops where it does — the auth wall

This is the single most consequential design decision in this document, so it goes first rather than
being discovered halfway through the checks table.

The brief's evidence list asks for checks that need a logged-in session: `denver` auto-populating its
country, `springfield`/`newport` narrowing to multiple regions, `plockton` resolving, the map
rendering, a region-tier country's admin regions list being non-empty. Every one of those requires
reaching `/api/geocode`, `/api/admin/*`, or the authenticated app shell, and **all three sit behind
`requireAuth`** (`src/backend/server.ts:198`, applied globally to `/api/*`).

Staging has no way to satisfy `requireAuth` short of a real Clerk session:

- **`BYPASS_AUTH` is fail-closed on a hosted environment.** `src/backend/middleware/auth.ts`'s guard
  throws at startup if `BYPASS_AUTH=true` and `NODE_ENV=production` — this is deliberate
  (`jobs/COO/park-docs/20260721_1918-COO-park.txt` names it "the BYPASS_AUTH fatal-guard"), and staging
  runs `NODE_ENV=production` per ADL-32. There is no bypass to reach for.
- **This project has explicitly declined the credential that would make automated Clerk auth
  possible.** ADL-33 §4 records that Clerk API access was declined and "no read-only credential exists
  for it." A Clerk Testing Token (the standard mechanism for minting an automated session in CI)
  requires the Clerk *secret* key — the same credential class ADL-33 already said no to, for reasons
  that pre-date this brief and are not this brief's to relitigate.
- **A hand-rolled workaround would repeat the QUAL-22 mistake at one remove.** A mocked session, a
  forged cookie, or a second BYPASS_AUTH-shaped carve-out for CI would make the authenticated checks
  pass without them ever touching the real Clerk-gated path staging actually runs — a check green for
  the wrong reason, on an environment it never touched. That is exactly the shape QUAL-22 already cost
  this project once (a mock exporting the wrong function name, passing without exercising anything).

**Two independent probes, since this is a load-bearing absence claim:**

1. **Code read.** `auth.ts`'s guard and its own comment naming the NODE_ENV=production fatal case;
   `server.ts:198`'s global `app.use('/api/', requireAuth)`; ADL-33 §4's text declining Clerk access.
2. **Live check of the credential store this session actually has access to.** `.env.agent-diagnostics`
   (the file `railway-query.sh`/`turso-query.mjs` source from) holds Railway and Turso tokens only — no
   Clerk secret key, no Clerk Testing Token, checked directly rather than inferred from the ADL text.

Both agree: no accepted mechanism exists today. **This is a decision for the PO/Architect, not
something to route around inside a QA brief** — provisioning a dedicated automated test account (or a
Clerk Testing Token) is a new credential and a new call to reachable staging/prod identity, which is
exactly the class of change CLAUDE.md's infra guardrail (Architect ADL before COO acts) and the shared
Clerk-user-pool open topology question (`jobs/COO/open-dialogues.md`) already govern.

**What this means concretely:** every check in §3 runs against the **anonymous surface** — the sign-in
screen and its own asset/CSP/health chain. None of them can be the `denver`/`plockton`/map/region-list
checks the brief's evidence section leads with. That is stated as a scope limit, not hidden as a
silent omission — see §5 for the recommendation on what would unblock it.

---

## 2. Why this runs in CI, not the devcontainer

Confirmed by **two independent probes**, mirroring the same block ADL-49 §2.1 already documented
against the production Railway domain and `jobs/COO/open-dialogues.md` D-06:

| Probe | Result |
|---|---|
| Direct network: `curl -m 5 https://travel-tracker-staging.up.railway.app/health` | `curl: (7) Failed to connect … after 54 ms` |
| Allowlist config: `grep railway.app .devcontainer/init-firewall.sh` | No match — the domain is not in the allowlist |

A GitHub-hosted runner has no such restriction (confirmed by CI's own `test-e2e` job already
downloading Playwright's browser binaries and reaching the npm registry from the same runner class —
ADL-49 §6.2 makes the identical argument for Nominatim reachability). This is why QUAL-20's own tracker
note says the check "belongs in CI, not in a COO-run script," and why the deliverable is a GitHub
Actions workflow rather than a script this devcontainer could run directly.

---

## 3. The checks — what each proves and does not prove

All five live in one file, `src/e2e-shakedown/shakedown.spec.ts`; the table below is reproduced in
that file's own comments so it travels with the code rather than living only here.

| # | Check | Proves | Does not prove |
|---|---|---|---|
| 1 | **App loads and returns a document** | DNS/TLS/Railway-edge/Express chain is intact end to end for an anonymous GET — the exact request class BUG-59 (CORS misconfig) and the BRD-NF09 shakedown's five sequential blockers broke, each differently | The app is *usable* — this is the sign-in screen, not the product |
| 2 | **Browser console is free of errors on load** | No CSP violation, uncaught exception, or failed-resource error is reported by a real browser against the real origin with helmet's CSP actually applied — the specific observation QUAL-18 says the pre-merge E2E suite structurally cannot make (vite preview carries no CSP header at all) | The console stays clean *past sign-in* — BUG-55 and BUG-68's violations both fired from authenticated actions this suite cannot reach (§1) |
| 3 | **No 5xx in the page's network lifecycle (ENV-02-aware)** | The static asset pipeline and Express aren't 500ing an anonymous request, on a first attempt or a same-minute retry | Absence of 5xx on authenticated-only routes (`/api/geocode`, `/api/cities`, `/api/admin/*`) — unreachable without a session |
| 4 | **The document carries a Content-Security-Policy header** | This deployed process is genuinely running the production code path (`NODE_ENV=production`, helmet mounted) — i.e. the exact topology difference QUAL-18 names is real, not a header-value duplicate of that suite's own test | The allowlist is *correct or complete* — that's QUAL-19's static source-level job, deliberately not re-implemented here so the two checks don't drift pretending to test the same thing two ways |
| 5 | **`/health` answers and reports the build SHA within a deploy-propagation window** | The Express process is up and answering its own liveness endpoint; **and (QUAL-26, 2026-08-04) which build is answering** — the run records the deployed commit SHA and, when given an expected SHA, spends its retry window waiting for the two to match rather than merely waiting for a 200 | That the deployed *frontend assets* match — `/health` is the backend's answer, and one-commit-per-deploy is a property of this single-service topology rather than something this check observes. When `SHAKEDOWN_EXPECTED_SHA` is unset (a `base_url` override, or a local run) the SHA is reported but **not verified** |

### 3.1 Checks considered and argued against, per the brief's instruction not to implement the list blindly

- **`denver` / `springfield` / `newport` / `plockton` (geocoder)** — argued against building *today*:
  blocked by the auth wall (§1), not by anything cheap to route around. Building it would either fake
  the auth (QUAL-22-shaped risk) or require a PO/Architect credential decision this brief cannot make
  unilaterally.
- **Map render** — same auth wall; the map only renders inside the authenticated shell.
- **Reference data (region-tier country → non-empty region list)** — same auth wall
  (`/api/admin/countries/:code/regions`).
- **Bounding Nominatim request volume** — turned out to be moot rather than solved: none of this
  suite's checks call Nominatim (directly or via the app), because none of them can reach an
  authenticated surface that would trigger a geocode call. If the auth wall is ever lifted (§5), this
  constraint becomes live again and must be re-applied — ADL-49 §4.3's rules (serialize, refuse under
  `CI` without an explicit opt-in, never from a test suite) would bind whatever's built then.

---

## 4. Distinguishing product failure from environment failure (requirement #3)

Two mechanisms, both already evidenced by tracker history rather than invented for this brief:

1. **The 5xx check retries once before failing (§3, check 3).** ENV-02 recorded Railway edge
   "connection dial timeout" 502s against this exact single-replica staging service — self-resolving on
   refresh, with app-side causes (crash, OOM, CPU saturation) ruled out by direct log and metric
   evidence at the time. A shakedown that hard-fails on the first sighting of that signature would
   manufacture a false product bug, which is precisely what OP-32 exists to prevent. So: a 5xx clears on
   retry → the check **passes**, annotated `ENVIRONMENT-TRANSIENT (ENV-02 class)` rather than a silent,
   unqualified green. A 5xx that persists across the retry is **not** consistent with ENV-02's own
   evidence (a per-connection edge timeout, not a sustained condition) and is reported as a probable
   product/deployment defect.
2. **`/health`'s retry/backoff (§3, check 5) exists for the same reason on the automatic trigger** — a
   push-triggered run racing Railway's rollout should not report "staging is down" for a deploy that is
   still in flight.

What this does **not** do: retry the console-error or CSP-header checks. Those are not the ENV-02
failure shape (a one-off edge timeout) — a CSP header is either present or it isn't, and a console
error is either logged or it isn't, on any given load. Retrying those would just be reducing the
chance of catching a real, intermittent problem, not correcting for a known transient one.

---

## 5. What this suite is honest about not covering

Stated plainly, in the same spirit as QUAL-18/ADL-49's own scope-limit sections, and because a
shakedown whose own status is overstated is worse than not having one (the brief's own words):

1. **Every authenticated product surface** — §1. This is the largest gap and the one the brief's
   evidence section most wants closed. **Recommendation:** the PO/Architect decide whether a dedicated,
   narrowly-scoped automated test account (or a Clerk Testing Token) is worth the new credential and
   the shared-Clerk-user-pool question it touches. Until that decision is made, this class of defect
   (BUG-76-shaped: something that only breaks for an authenticated user hitting a real external
   dependency) stays something only a human UAT pass or a PO report can catch on staging — which this
   document does not pretend otherwise about.
2. **Which build answered.** `/health` has no version/commit marker, so an automatic (push-triggered)
   run cannot prove it tested the *new* deploy rather than the previous one still serving traffic during
   Railway's rollout (§6.2 names this explicitly rather than glossing over it). **Cheap follow-on,
   flagged for Backend, not built here:** embed the deployed commit SHA in `/health`'s response body.
   This is a one-line, low-risk change to a route this brief has no mandate to touch.

   > SUPERSEDED (2026-08-04) by QUAL-26 (issue #396) — retained for history. The follow-on above was
   > built. `/health` now returns `commit` / `commitFull` / `builtAt`
   > (`src/backend/services/build-info.ts`), the workflow passes the dispatched ref's SHA as
   > `SHAKEDOWN_EXPECTED_SHA`, and check 5 fails on a mismatch instead of reporting a bare 200. The gap
   > this item describes is **closed for `workflow_dispatch`**, which is the only trigger this workflow
   > has (the `push` trigger was removed the same day — see §6.2's own stamp). The residual limit is
   > narrower and stated in the §3 table: an unset `SHAKEDOWN_EXPECTED_SHA` reports the SHA without
   > verifying it, and the check speaks for the backend rather than the served frontend assets.
3. **Third-party correctness.** These checks prove *our* deployment is intact, never that Nominatim,
   Clerk, or MapTiler are behaving correctly today — same boundary ADL-49 §5.8 draws for the
   replay-fixture design.
4. **Anything that only manifests under real traffic patterns or over time** — a slow memory leak, a
   connection-pool exhaustion under load. This is a shakedown, not a soak test.

---

## 6. Trigger recommendation

**Both, sequenced — `workflow_dispatch` as the trusted primary today, `push`-to-`main` as a weaker
automatic signal layered on top, not a replacement for it.**

### 6.1 `workflow_dispatch` (COO-invoked) — primary

Run this right after confirming (`scripts/agent-diagnostics/railway-query.sh staging status`) that a
new deployment reached `SUCCESS`. Zero ambiguity about which build is under test, zero new
infrastructure, usable immediately. This is the trigger to treat as authoritative before a UAT round
that matters — exactly the workflow QUAL-20's own tracker note anticipates ("a staging deploy that
serves a CSP-broken or otherwise non-functional build fails the check").

### 6.2 `push` to `main` — automatic, secondary, with a stated gap

> SUPERSEDED (2026-08-04) — retained for history. Two things overtook this section on the day it was
> written. **(a)** The `push`-to-`main` trigger was **removed** (PR #391): Railway's staging service
> sets `checkSuites: true`, so a red post-deploy check is read as "this commit's checks failed" and the
> deploy is SKIPPED — five consecutive commits never deployed. A post-deploy check must never sit
> inside the pre-deploy gate. **(b)** QUAL-26 (issue #396) closed the build-marker half of the gap
> below: `/health` now carries the commit SHA and check 5 asserts it against the dispatched ref. The
> rollout-lag reasoning here remains accurate and is why the check still retries rather than failing on
> the first poll.

ADL-32 already makes staging watch `main` continuously, which the brief calls out as "a natural hook."
Wiring it costs nothing extra (the same workflow, a second trigger) and it means a badly broken deploy
gets flagged without anyone having to remember to invoke it. But it is **weaker evidence than the
manual trigger**, for a reason worth stating rather than hiding: Railway's rollout is not instantaneous,
and (per §5.2) `/health` carries no build marker, so a push-triggered run cannot prove it tested the new
build rather than the previous one still answering during the rollout window. The workflow adds a
60-second grace sleep before starting (crude, not a completion signal) and `/health`'s own
retry/backoff absorbs the common case, but the gap is not fully closed. **Treat a red run here as
real; treat a green run here as a good sign, not a substitute for a `workflow_dispatch` run before a
UAT round.**

### 6.3 What was considered and rejected

- **Gating the automatic trigger on a Railway deployment-status poll** (via
  `railway-query.sh`'s GraphQL pattern) would close the §5.2 gap properly, but it requires a Railway
  token as a *GitHub Actions* secret — a new secret in a new location, not something to add
  unilaterally inside a QA brief. Flagged as the correct fix for anyone revisiting this, not built here.
- **A scheduled (`cron`) run** was not added. Nothing in this suite reaches a rate-limited third party
  (§3.1), so ADL-49 §5.7's "why not a scheduled Action" reasoning doesn't directly transfer — but there
  is also no standing need for a time-based run distinct from "after every deploy," so it would add a
  third trigger for no evidenced benefit.

---

## 7. Cost

- **Runtime:** ~15–20s of actual check time (5 short Playwright tests, mostly waiting on one page
  load's `networkidle` + a 1.5s settle window) plus fixed CI overhead — `npm ci`, Playwright browser
  install (~30–60s, same cost the existing `test-e2e` job already pays), and the push-trigger's 60s
  grace sleep. Call it **~2 minutes wall-clock for a `workflow_dispatch` run, ~3 minutes for the
  automatic one.**
- **Request count:** a handful of HTTP requests per run (one page navigation with its asset
  sub-requests, one direct CSP-header fetch, up to 10 `/health` polls at 6s spacing in the worst case).
  Nowhere near any rate-limited surface — see §3.1 on why Nominatim exposure is moot here, not merely
  bounded.
- **Flakiness risk:** the two places most likely to flake are exactly the two given explicit
  retry/backoff handling — 5xx (ENV-02) and `/health` (rollout lag). The console-error and CSP-header
  checks are not retried and are expected to be either reliably green or a real finding; if either
  starts flaking in practice, that is itself signal (an intermittent CSP misconfiguration is worth
  knowing about, not worth suppressing).

---

## 8. What this leaves to the PO — stated plainly, not implied

This is **not** a UAT replacement, and it does not claim to be:

- **Every judgment call** — "the caption should be bolder," "the state list should narrow like the UK
  one" — stays entirely the PO's, exactly as the brief frames it. Nothing here attempts to automate
  taste or product feel.
- **Every authenticated product behaviour** — §1's whole scope limit. Until an auth mechanism is
  decided, a human is still the only thing that can catch a BUG-76-shaped defect on staging before it
  ships to a UAT round.
- **Whether the *right* thing was built**, only whether the *deployed* thing matches what CI already
  approved. A shakedown that passes says "this is safe to UAT," not "this is correct."

What it *does* free the PO from: being the first person to discover a white screen, a CSP
misconfiguration, a CORS regression, or a dead process — the class of defect that has cost this
project real UAT time at least twice (BRD-NF09, BUG-55) before this existed.

---

## 9. What I have actually seen pass, versus what is written but unproven

Stated exactly as the brief asked, because this document exists in a thread about checks being green
for the wrong reason:

**Run locally against a production-shaped build** (`NODE_ENV=production`, real `CLERK_ISSUER`/
`CLERK_JWKS_URI`, no `BYPASS_AUTH`, helmet applied — the closest topology reachable from this
devcontainer, itself firewalled from the real staging URL per §2):

- ✅ **Seen pass:** "the app loads and returns a document," "no 5xx in the page network lifecycle,"
  "the deployed document carries a Content-Security-Policy header," "`/health` answers within the
  deploy-propagation window."
- ⚠️ **Seen fail, and why it does not indict the check:** "browser console is free of errors on load"
  failed twice locally, for two different **rig** reasons, neither of which is evidence about staging
  itself:
  1. With `VITE_BYPASS_AUTH=true` (a local-only rig shortcut, not present on staging), the frontend
     skipped the sign-in gate and fired authenticated API calls that 401'd — a mismatch between my test
     rig and staging's real topology, not a defect the check found.
  2. With a real-shaped Clerk publishable key (`pk_test_` + base64 of the known `CLERK_ISSUER` host —
     Clerk's own documented encoding, not a secret) and no bypass, the sign-in page correctly rendered,
     but Clerk's CDN subdomains (`scdn.clerk.com` and similar) are **not** in this devcontainer's
     firewall allowlist (only the JWKS endpoint is, for backend diagnostics) — `net::ERR_ADDRESS_UNREACHABLE`,
     a network-level block, not a CSP violation. This is the same class of environment limitation §2
     documents for the staging URL itself, just hitting a different allowlisted-subset boundary.

  **This check's logic is confirmed working** — it correctly detected and reported real console errors
  in both cases. **What I have not been able to do is observe it pass against a genuinely clean,
  unauthenticated Clerk sign-in load**, because this sandbox cannot reach the full set of hosts that
  load requires. Circumstantial evidence this would be clean on real staging: the tracker's own record
  confirms Clerk sign-in already renders correctly on live production
  (`_project/tracker.json`, ADL-32's entry: "CONFIRMED WORKING 2026-07-21 (Ryan, live on prod): sign-in
  … render correctly"). That is evidence, not proof — **marked UNVERIFIED against the real staging URL
  specifically**, with the two probes and their blind spot stated above, per the standing rule.

**Never run against the real staging URL at all** — blocked by §2's firewall, confirmed by the same two
probes. **This entire suite is therefore unproven against its actual target as of this report.** The
first genuine evidence of a pass/fail against real staging will be whoever (COO, most likely) runs
`workflow_dispatch` from a GitHub Actions runner after this PR merges. That run, not this document,
is the first real test of this shakedown.
