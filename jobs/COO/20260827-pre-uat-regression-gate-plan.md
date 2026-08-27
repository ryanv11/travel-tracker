# Plan — environment parity and a pre-UAT regression gate

**Written:** 2026-08-27 · **Author:** COO · **Status:** PROPOSED — awaiting PO approval
**Revision 2**, after a QA review that overturned two of revision 1's conclusions.

> **DECLARED BULK REVISION (OP-28).** Revision 1 was restructured rather than amended in place,
> because QA's review changed the *order of the work* and the *definition of two workstreams* —
> an errata list appended to the old order would have been harder to act on than a corrected
> plan. Nothing is dropped: every revision-1 position that changed is stated below alongside
> what replaced it and why. Revision 1 is in git history (commits `474d48f`, `42fa67f`, `47cd228`).

---

## What changed in revision 2, in one place

QA was dispatched to stress-test this plan rather than bless it. It conceded the plan's central
argument, overturned two of its conclusions, and found two live problems the plan had not looked
for. Every claim below was then **re-probed by the COO**, because a reviewer's findings are not
pre-verified either — one of QA's own findings did not survive that and was retracted.

| Revision 1 said | Revision 2 says | Who caught it |
|---|---|---|
| The security-allowlist test is now *preventive* — no live fault | **Curative.** There is a live violation in CI on every run | QA |
| The deployed-build check is wholly broken | **4 of 5 checks pass.** One check has never passed | QA |
| Its failure is undiagnosable because it records only a message string | True, but the prescribed fix (capture "all args") **cannot work** — args are always empty for this class | QA, then COO |
| …and the capture is therefore lossy | QA first said the capture was complete; **COO challenged; QA retracted and reproduced the real failure exactly** | COO |
| The single-origin work is one blocked thing | **Two things. The signed-out half works today**, no design decision needed | QA |
| 52 tests, ~85s, "a few hundred is ten-plus minutes" | **53 tests, 45.7s of test time**, ~0.4s marginal; ~700 tests to reach 5 min, and not on the critical path | QA |
| Time budget bounds the suite | It cannot — it will never fire. **The maintenance tax is the real bound** | QA |
| "Cheapest tier that can catch it" | Flawed — that is decided *after* you know the fault. Replaced | QA |
| Build a named journey pack | **Don't.** Tag the existing suite | QA |
| Gate blocks on all three checks | **Split it** by whether a check is hermetic | QA |
| — | **Two copies of the security config exist and have drifted** | QA |
| — | **Worker-sourced browser errors are invisible to every test in the project** | QA |

---

## What you asked for

> *"we also want to build out the regression suite as well to run automatically before handing
> to me for UAT"*

Restated plainly: **when work reaches you for testing, it should already have been checked
against everything we know can break — so your testing time goes on new things, not on
re-finding old ones.**

---

## Where we actually are

Six gaps. All verified by the COO directly, not inherited from the docs.

**1. There is a live security-policy violation in CI right now, and we have been looking past it
for 23 days.** The deployed-build check runs five checks; four pass every time — including the
one confirming the deployed app *does* carry its security headers. One has never passed: *"the
browser console is clean."* It fails because something on the deployed sign-in page calls
`eval()` and the browser refuses it.

**This was reproduced exactly.** Serving a page under a policy with no `script-src` and calling
`eval()` produces character-for-character the message sitting in our CI logs. The browser's
structured event names it: `violatedDirective: script-src`, `blockedURI: **eval**`.

Our own policy *does* set `script-src`, so the policy being violated is not our main document's
— most plausibly a worker or a third-party-served context. **UNVERIFIED which**; staging is down
and the August run's artifacts expired. One dispatched run settles it once staging returns.

**2. Nothing has run the deployed-build check since 4 August** — 137 merges ago — and it is
marked `done` in the tracker on a closing note claiming *"verified by ... green runs."* There
have never been any green runs. That was a COO sign-off and it was wrong.

**3. Two copies of the security configuration exist, and they have drifted.** The real app has
one; the backend tests have a hand-copied duplicate that is four rules out of date. Its own
header comment claims it *"exercises exactly the same request pipeline as production"* — false.
**37 files depend on it.** So a whole tier of tests runs against different security rules than
the app ships, while a comment says otherwise.

**4. Worker-sourced browser errors are invisible to every browser test we have.** The test
framework silently discards any console entry originating inside a Web Worker
([crPage.js:681](../../node_modules/playwright-core/lib/server/chromium/crPage.js#L681)). Our
policy carries a worker rule *specifically* because the sign-in SDK spins one up — so violations
in exactly that context cannot be seen. Confirmed live: a page producing two violations
delivered one. **This is the same shape as gap 5 — the environment cannot express the failure.**

**5. CI cannot see security-policy faults at all**, because tests serve the app from a
development preview server while production serves it from Express with the headers applied.

**6. "Ready for UAT" is a judgement call, not a checked state.** Nothing mechanical stands
between an engineer saying "done" and an item appearing in your UAT log.

---

## The workstreams

### A — Tell the truth about what we have *(hours)*

Three tracker corrections, not one: the item closed on a false verification; an honest note that
the deployed-build check is 4/5 passing rather than wholly broken; and QA reports a further item
the tracker calls unfixed while the code shows it fixed — **to be COO-verified before acting, not
taken on report.** Plus filing the newly-found problems (gaps 3 and 4) and the untracked
test-selector debt.

**Owner:** COO. **Blocked by:** nothing.

---

### B — The pre-UAT regression gate *(the main event)*

#### B1. What gets tested where

> **Revision 1's rule was "push each finding to the cheapest tier that can catch it." QA
> identified the flaw and it is a real one:** that judgement is made *after* you already know
> what the bug was. Once you know it was one function failing, of course a small test catches
> it — but that test catches *that* bug, not its class. Regression suites exist for faults
> nobody has seen yet, so the rule systematically underinvests in the only tier that catches
> the unpredicted.

**The replacement rule:** *write the cheap test only if it would fail for the right reason
**without** knowing the fault in advance. If a cheap test could pass while the app is visibly
broken, it stays at the browser tier.*

**Only a real browser can catch these** — pushing them down loses them silently:
- one screen not updating after another changed something (the companion-rename fault)
- anything the browser itself blocks — by definition invisible outside a browser
- selection, focus and navigation surviving an action
- a form pre-filling from data a *different* component loaded
- layout and overflow at a given screen size *(already well covered — keep it)*

**These have no tier at all, and are declared out of scope rather than quietly tiered away:**
- **The map.** It cannot render in CI at all — no map key in the test build — and the one
  existing map test discards every map error to stay green. Any journey touching the map today
  tests a blank canvas. *But QA makes a good catch here:* the layer ordering and zoom thresholds
  are **our own data** before the map library draws anything, so the
  marker-hidden-behind-shading and zoom-threshold findings **do** have a cheap tier after all.
- **Look-and-feel judgements.** No visual-comparison tooling exists. These stay yours,
  permanently, and this plan says so rather than implying otherwise.
- **Anything needing a second login.** The tests run as one hardcoded user. Every finding from
  your second account is currently unautomatable — see J7, which needs a rig change revision 1
  budgeted nothing for.

#### B2. Don't build a pack — tag the suite you have

Revision 1 asked for a new named pack. There are already **53 tests** covering trips, filters,
status, navigation, admin, places, plus 15 mobile-viewport tests. A separate pack duplicates
that and creates a second thing to maintain and a second place to drift — **the same shape as
gap 3.** Tag the existing tests instead, so the gate can name a subset without forking a suite.
This is also what the project's standing preference for reuse over duplication points at.

**QA's proposed journeys — eight, about 20 new browser tests on top of the 53:**

| | Journey | Ground it covers | New |
|---|---|---|---|
| J1 | Add a place, ambiguous new city — offered a choice, pick, fields fill, save, no duplicate on repeat | The biggest cluster in your archive | 5 |
| J2 | Trip lifecycle — create → advance → move back (stays selected) → lock → edit refused → unlock → delete, with confirm *and* cancel | The P1 delete finding, lock behaviour, the deselect bug | 4 |
| J3 | Items on a dated trip — date defaults, directions link, rating sort and filter | The date-defaulting cluster | 4 |
| J4 | Admin change propagates — rename a companion used on two trips, both reflect it with no refresh | The P1 data-integrity finding | 2 |
| J5 | **Signed-out page loads clean from the real server**, production-shaped, headers applied | The whole policy-violation class — **available today**, see C | 2 |
| J6 | Edit-then-see-it — change a place's dates, list reflects it; delete a place holding items, prompted | The "saved but didn't show" class | 2 |
| J7 | Second account — non-owner sees the right tabs, no owner-only controls | **Needs a rig change (unbudgeted in rev 1)** | 2 |
| J8 | Mobile list ↔ detail | **Already exists — keep, don't rebuild** | 0 |

#### B3. The gate — split by whether a check is hermetic

> Revision 1 recommended blocking on all three checks. QA's correction is better and the
> reasoning is structural rather than cautious.

**Block on the hermetic checks** — the normal CI suite and the tagged journeys. They only fail
when our own code is wrong, so whoever is blocked can always act on it.

**Do not block on the deployed-build check.** It depends on the host, the sign-in provider, a
third party's console output and a live deployment. A check that can go red for reasons the
blocked person cannot fix gets overridden the first time, then permanently — **which is exactly
what already happened.** The repo learned this one level down (a post-deploy check must not sit
inside the pre-deploy gate); this extends it to the human handoff.

**Gate on classification instead:** *no UAT round begins without a deployed-build run from the
current build, with every failure classified — environment, third-party, or product.*
Classification survives a red day. "Green" does not, and gap 1 is the proof.

#### B4. The feedback loop

Every new finding you report gets a test before its fix merges, at the tier B1's rule selects,
with the tier stated as a deliberate choice rather than a default. A finding earns a browser
test only when the fault genuinely needs one.

#### What bounds the suite

> Your question — *"what's stopping us from just having an infinite number of test cases?"* —
> and revision 1's answer leaned on a time budget. **QA showed the numbers were wrong by 3–4×,
> which makes that bound one that can never fire.** The real bound was already in revision 1,
> buried as a footnote. It is promoted here.

1. **The maintenance tax is the bound.** Every test is glued to part of the interface, so a
   legitimate change means updating every test touching it. That bites at ~80 tests, not 700 —
   it is how a suite stops protecting the app and starts resisting it.
2. **Bound by the product, not the bug history.** Bug history only grows. The product's surface
   does not. **And your findings cluster by surface**: eleven consecutive items on one of your
   own checklists were all inside "add a place" — one journey, eleven findings' worth of ground.
3. **Deleting a test is normal.** No justification memo. Never deleting is why suites rot.
4. ~~Over budget triggers a clear-out~~ — **retracted.** Tests take 45.7s of a 53-test run,
   marginal cost ~0.4s, and the browser job finishes four minutes before the slowest CI job.
   Reaching five minutes needs ~700 tests. The budget is not a real constraint.

*Also confirmed in the plan's favour: the tests genuinely cannot be parallelised, and for a
bigger reason than the shared database file — each test wipes all trips against one shared
backend as one user. Declining to fix that is right.*

---

### C — Single-origin testing: two things, only one blocked

Revision 1 treated this as one item needing an Architect decision. **It splits:**

**The signed-out half works today.** Serving the app from Express *without* the test-login
bypass needs no design decision, no new credential and no Architect. That delivers J5 now: a
test loading the real signed-out page from a production-shaped server with real security headers
applied, in CI. **It would have caught gap 1 without staging existing at all.**

**Only the logged-in half needs the design call.** Serving statically requires production mode;
production mode makes the test-login bypass a fatal startup error
([server.ts:88](../../src/backend/server.ts#L88),
[server.ts:290](../../src/backend/server.ts#L290)) — verified in code and by running it.
Resolving that means decoupling static-serving from the production flag, or giving the tests a
real login path, which was declined once already on credential-scope grounds. **Scope the
Architect pass to that half only** — handing over the whole thing wastes the pass on a question
already answered.

---

### C-adjacent — the allowlist test, moved from 4th to 2nd

**It is curative, not preventive.** Revision 1 downgraded it on a COO check of the app's source
that found nothing broken — while a live violation sat in our own CI history. The lesson is
worth keeping: *checking the code is not the same as checking the evidence.*

**And its scope grows:** as well as asserting every address the app fetches is allowlisted, it
should assert **the two copies of the config agree** (gap 3). Minutes of work, closes a drift
class permanently.

---

### D — Make the deployed-build check diagnosable *(now precisely specified)*

Revision 1 said "widen the capture". **That prescription cannot work** and would have looked
like diligence while doing nothing. Verified by reading the framework's source and reproducing:

| capture method | yields |
|---|---|
| what the check does today | `" Note that 'script-src' was not explicitly set…"` — a dangling clause |
| `msg.args()` — what rev 1 prescribed | **always empty.** Hardcoded at [crPage.js:687](../../node_modules/playwright-core/lib/server/chromium/crPage.js#L687) |
| the browser's `securitypolicyviolation` event | `violatedDirective: script-src`, `blockedURI: **eval**` |

**The fix, in order of what each adds:**
1. **Scope console errors to our own origin** — as the existing map test already does. Stops the
   permanent red.
2. **Listen for the browser's structured violation event**, registered before any page script
   runs. **This is what names the fault.**
3. **Read the raw browser log stream directly** — the only channel that sees worker-sourced
   violations (gap 4).
4. Keep the message location. **Drop `msg.args()` from the prescription.**

This is no longer speculative: it has a reproduction behind it and a known target.

---

## Sequencing

Staging is down, so nothing can be deployed to — which makes this a good window, since
everything below except D's verification is local and CI-side.

| | Work | Why here |
|---|---|---|
| 1 | **A** — tracker corrections | Hours. Stops false `done` states misleading the next session |
| 2 | **C-adjacent** — allowlist test + config-parity assertion | **Moved up from 4th.** Curative, not preventive; closes two live problems |
| 3 | **D** — make the check diagnosable | **Moved up.** Few hours, known target, converts a 23-day unresolvable red into a diagnosable one |
| 4 | **B** — the tagged journeys, including J5 and the selector debt | The main event. J5 available now per C |
| 5 | **C** — Architect pass, **logged-in half only** | Scoped down; the signed-out half needs no decision |

The three ahead of your ask are hours each, and two close live faults.

---

## Risks

**A gate that goes red for reasons you can't fix gets ignored.** Live example in this repo: 23
days, 137 merges, red the whole time, unowned. B3's hermetic split is the structural answer.

**Nobody owns a red check.** The existing failure was not muted — it was *unowned*. A rule about
muting does not address that. Needs a named owner and an escalation clock.

**No alarm for a gate that stops running.** The real root cause of the 23-day silence was not the
trigger or the diagnosability — it was that nothing noticed the check had **stopped running at
all.** A staleness alarm is a different mechanism from a pass/fail alarm, and it is the one
missing.

**`done` in the tracker has no defined meaning.** One entry was marked done on a verification
never performed. Worth asking whether `done` should require a named artifact — a run id, a PR
number — rather than a prose claim.

**This reduces your testing load; it does not remove it.** Genuinely new behaviour always needs
your eyes. Map and visual work stay yours permanently.

**"~80 findings" is an inflated denominator.** A large share of the archive is feature requests —
multi-leg flights, Wallet import, category colours. Those cannot regress and will never earn a
test. Honest version: *of ~80 archived items, roughly half are defects that could recur, and most
of those belong below the browser.*

**Unanswered: what happens when a journey fails during your UAT round?** If the gate blocks, work
stops. Who diagnoses, on what clock, what is the override? An undefined override is how gates get
bypassed informally rather than deliberately.

---

## What I need from you

1. **Approve the decoupling** — build the journeys now rather than waiting on the single-origin
   work. QA set the prerequisite this overturns and has conceded it.
2. **Approve the split gate** — blocking on our own tests, classification-gated on the deployed
   check.
3. **Approve the reordering** — three short items ahead of the journeys, two of which close live
   faults.
4. **Anything you want explicitly in or out of the journey set.**

Nothing is started.
