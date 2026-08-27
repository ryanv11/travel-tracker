# Test-environment fidelity register

> **CANONICAL HOME** for the question *"what is each test tier a model of, what does it claim to
> reproduce faithfully, and what does it explicitly not?"* Established by **ADL-57** (2026-08-27,
> tracker QUAL-56, issue #550). This document **supersedes the one-time enumeration** performed
> 2026-07-28 that produced QUAL-18/19/20 — see ADL-57 §1 for why an enumeration of *differences*
> was the wrong artifact.
>
> **Owner:** Architect owns this document and its tier contracts. **Each fidelity claim is owned by
> the author of the tier's tests** — the claim is theirs to keep true.
>
> **Status:** LIVE. Amend it; never rewrite it (OP-28). Claims are append-only with dated
> supersession stamps.

---

## 0. How to read this

The rule this replaces asked us to *"enumerate every way the test environment differs from
production, and treat each difference as an untested surface."* That set is **unbounded** — a
`vitest` + `jsdom` process differs from Chrome-on-Railway in effectively infinite ways, and most of
those differences are the entire reason the tier is cheap. An unbounded enumeration can be
performed once and cannot be maintained, which is exactly what happened.

This document inverts it. Each tier declares a **short, closed list of production properties it
claims to reproduce** (its *fidelity claims*) and a **short list of properties it explicitly does
not** (its *non-goals*). Everything not on either list is **out of contract** — not a silent gap,
but an admitted unknown.

**The load-bearing rule that makes this different from a comment:**

> **A fidelity claim is an executable assertion, or it is not a claim.**
> Every row in a "Claims" table below names the test that proves it. A claim with no assertion is a
> defect in this document and the drift canary reports it (Check F1).

**And the rule that keeps an assertion honest:**

> **Every parity assertion is demonstrated RED once**, against a deliberately-broken input, and the
> PR where that was observed is recorded in the `Proved red` column. An assertion nobody has seen
> fail specifies nothing — that is QUAL-22's failure mode one level up.

---

## 1. The tiers

There is no single "test environment". There are five, each a model of something different. Parity
is a **per-tier contract**, not a global property of the project.

| Tier | What runs | What it is a model OF |
|---|---|---|
| **T1 — backend integration** | `vitest` + `supertest` against `src/backend/server-test-app.ts` | The Express **request pipeline**: middleware order, routing, validation, access control, repository/DB behaviour, status codes and response bodies |
| **T2 — frontend unit** | `vitest` + `jsdom` | **Component logic and rendering decisions** — what renders given what state |
| **T3 — contract** | `vitest` over HTTP against a real `npm run start` process | The **real server process**: startup path, real sockets, headers as actually emitted on the wire |
| **T4 — E2E browser** | `playwright` + built frontend + real backend | The **browser and the built frontend against a live backend**: user journeys, DOM, client routing, cross-screen state |
| **T5 — post-deploy shakedown** | `playwright` against the deployed staging URL | The **deployed artifact itself.** Fidelity is 1:1 by construction — T5 *is* the environment. Its limits are limits of **observability**, never of fidelity |

---

## 2. Tier contracts

### T1 — backend integration (`server-test-app.ts`)

**Claims**

| ID | Claim | Proven by | Proved red |
|---|---|---|---|
| T1-C1 | The helmet `contentSecurityPolicy` directives are byte-identical to `server.ts`'s, for the same environment inputs | *pending* — BUG-101 / QUAL-19 brief | — |
| T1-C2 | The middleware **order** is identical to `server.ts`'s (trust-proxy → helmet → CORS → body limits → rate limits → `requireAuth` → routers → error handler) | *pending* — BUG-101 brief | — |
| T1-C3 | The mounted route set is identical to `server.ts`'s | *pending* — BUG-101 brief | — |
| T1-C4 | Body-size limits are identical to `server.ts`'s | *pending* — BUG-101 brief | — |

> **Standing note (2026-08-27).** T1-C1..C4 are currently asserted only by a prose comment at
> `src/backend/server-test-app.ts:1-11` — *"exercises exactly the same request pipeline as
> production"*. That claim is **false today** for the CSP block and for the rate-limit
> configuration; both were read directly and compared (BUG-101). The comment is the exemplar of what
> §0's rule forbids. **Until the assertions exist, treat T1-C1..C4 as UNVERIFIED, not as claims.**
> The right fix is one shared config imported by both, not two files kept in step by hand.

**Non-goals**

- Process startup, TLS, the listening socket, static file serving (T3/T5's job).
- Real browser behaviour of any kind (T4's job).
- Remote-database network behaviour — see D-8 in ADL-57 §4.

---

### T2 — frontend unit (`vitest` + `jsdom`)

**Claims**

| ID | Claim | Proven by | Proved red |
|---|---|---|---|
| T2-C1 | Component render decisions match the shipped components (same source files, no test-only forks) | the suite itself | n/a — structural |

**Non-goals** — declared, permanently:

- Layout, paint, CSS cascade, viewport behaviour. `jsdom` has no layout engine.
- Content-Security-Policy, network stack, service/web workers.
- Anything the browser itself blocks or rewrites.

---

### T3 — contract (real process over HTTP)

**Claims**

| ID | Claim | Proven by | Proved red |
|---|---|---|---|
| T3-C1 | The process starts through `server.ts`'s real startup path, including its startup guards | `.github/workflows/ci.yml` `test-contract` job boots `npm run start` | n/a — structural |
| T3-C2 | Response headers observed are the headers Express actually emits | the suite's own assertions | — |

**Non-goals**

- Authentication: T3 runs with `BYPASS_AUTH=true`. See D-3/D-4 in ADL-57 §4.
- Static/document serving and CSP on the document (`NODE_ENV` is not `production` here).

---

### T4 — E2E browser (`playwright`)

**Claims**

| ID | Claim | Proven by | Proved red |
|---|---|---|---|
| T4-C1 | The frontend under test is built from the shipped source | `playwright.config.ts` webServer builds with `npm run build` in CI | n/a — structural |
| T4-C2 | *(pending ADL-57 D3)* The document is served by Express with helmet applied, from the same origin as the API — matching production topology | *pending* — QUAL-18b brief | — |
| T4-C3 | *(pending ADL-57 D3)* A first-party origin removed from the CSP allowlist fails the suite | *pending* — QUAL-18b brief | — |
| T4-C4 | *(pending QUAL-54)* Worker-sourced browser errors are observable | *pending* — QUAL-54 brief | — |

**Non-goals** — declared:

- **The Clerk authentication path, end to end.** Probed twice, failing differently:
  `src/frontend/main.tsx:51-75` places `ClerkProvider`, `RedirectToSignIn`, `TokenRegistrar` and the
  `setTokenGetter` call **only in the non-bypass branch** of the React tree; and
  `src/frontend/utils/apiClient.ts:61-66` returns an empty header object when no token getter was
  registered. Under `VITE_BYPASS_AUTH=true` — which CI sets at *build* time — none of that code is
  in the bundle and **no E2E request ever carries an `Authorization` header.** Closing this needs a
  Clerk credential, declined by ADL-33 §4 and re-affirmed by ADL-57 D3. **Its only observation point
  is T5 and the PO's own session.**
- **Map rendering.** `VITE_MAPTILER_KEY` is absent from the CI build (probed twice, failing
  differently: read of the `playwright.config.ts` CI build command, which sets only
  `VITE_BYPASS_AUTH` and `VITE_API_BASE_URL`; and a repo-wide grep that finds the variable only at
  `src/frontend/components/Map/MapView.tsx:25`). Any journey touching the map exercises a blank
  canvas. **Layer ordering and zoom thresholds are our own data before the library draws** and do
  have a cheap tier — that is not this non-goal.
- **Visual comparison / look-and-feel** — no tooling exists for it (UX-17).
- **A second Clerk-authenticated user.** A second *identity* is in scope (ADL-57 D-4b); a second
  real Clerk account is not.

---

### T5 — post-deploy shakedown

**Claims**

| ID | Claim | Proven by | Proved red |
|---|---|---|---|
| T5-C1 | The build under test is the build just deployed | QUAL-26 — `/health` carries the build SHA and the retry window waits for a match | PR #399 |

**Non-goals**

- Any authenticated surface. `@clerk/testing` is not a dependency (probed twice, failing
  differently: `package.json` lists only `@clerk/react`; and `src/backend/middleware/auth.ts`
  requires a genuine Clerk-issued JWT — verified against JWKS with an issuer and `azp` check — so
  no non-bypass path exists that does not involve a Clerk-minted token). Deliberate, per ADL-33 §4.
- Acting as a blocking gate. T5 depends on hosts, a third party and a live deployment; the COO's
  pre-UAT regression gate plan (revision 2, 2026-08-27) keeps it classification-gated, not blocking
  via its hermetic split.

---

## 3. When to reopen this document (the trigger rule)

No scanner can detect a divergence in a property **nobody has ever named** — that limit is
structural, and both of 2026-08-27's discoveries fell inside it. What can be made reliable is the
*recognition* step. **Each of these four events opens a mandatory parity question, answered in
writing here** (append a dated note; a "no new divergence" answer is a valid and useful answer):

1. **A defect reached a deployed environment while the tier that should have caught it was green.**
   (This is how QUAL-18 was found, via BUG-55.) Folds into OP-32's defect classification.
2. **A test was weakened, filtered, skipped, or had a tolerance widened in order to go green.**
   (`src/e2e/map.spec.ts:13-14` is the in-tree example.) Partly mechanical — drift-canary Check F3.
3. **A PO or UAT finding was declared unautomatable.** (This is how the one-identity limit was
   known for months without ever being written down.) Folds into UAT close-out.
4. **A check has been red, skipped, or unexplained for more than 14 days.** (QUAL-20's shakedown
   check ran red for 23 days; the root cause turned out to be QUAL-54, a divergence.)

---

## 4. Change log

| Date | Change |
|---|---|
| 2026-08-27 | Created by ADL-57 (QUAL-56, issue #550). Supersedes the 2026-07-28 one-time enumeration. |
