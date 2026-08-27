# Plan — environment parity and a pre-UAT regression gate

**Written:** 2026-08-27 · **Author:** COO · **Status:** PROPOSED — awaiting PO approval
**Supersedes nothing.** Amends the framing of QUAL-39; proposes OP-42 and QUAL-54.

---

## What you asked for

> *"we also want to build out the regression suite as well to run automatically before handing
> to me for UAT"*

Restated plainly: **when work reaches you for testing, it should already have been checked
against everything we know can break — so your testing time goes on new things, not on
re-finding old ones.**

That is the goal this plan is built around. The environment-parity work turns out to be part
of the same problem rather than a separate errand, which is why they are planned together.

---

## Where we actually are

Four gaps, all verified today rather than inherited from the docs.

**1. Nothing checks that a deployed build works.** The automated post-deploy check has run
six times, failed six times, and has not run at all since **4 August** — 137 merges ago. It is
marked `done` in the tracker on a closing note claiming it was *"verified by ... green runs."*
There have never been any green runs. That was a COO sign-off and it was wrong.

**2. Your own past findings are not encoded as tests.** There are roughly **80 resolved findings** in
[uat-archive.md](../PO/uat-archive.md). The browser test suite has **52 tests total**, written
around general flows rather than around what you actually found broken. Your UAT sessions are
the project's de facto regression suite, and you are the bottleneck in the pipeline.

**3. CI cannot see one whole class of defect.** Confirmed two ways today: the tests serve the
app from `vite preview` on one port with the backend on another, while production serves
everything from Express as a single origin with security headers applied. Those headers are
Express middleware, so in the test run they structurally cannot exist. Every
Content-Security-Policy fault — the class that caused BUG-55 — is invisible to CI by
construction.

**4. "Ready for UAT" is a judgment call, not a checked state.** Nothing mechanical stands
between "an engineer says it's done" and "it appears in your UAT log". Today that gap is
filled by the COO remembering to check things.

---

## The four workstreams

### A — Tell the truth about what we have *(minutes, do first)*

Reopen the post-deploy check, and record in its notes exactly why the closing verification was
false. This is not bookkeeping: a `done` item is one that future planning treats as solid
ground, and this one is not. Left alone it will mislead the next session the same way it
misled this one.

Also file the currently-untracked test-selector debt (see workstream B) so it can be
scheduled rather than living in a memory note.

**Deliverable:** corrected tracker. **Owner:** COO. **Blocked by:** nothing.

---

### B — The pre-UAT regression gate *(the main event)*

This is the piece you asked for. It has three parts, and the third is the one that makes it
last.

#### B1. Coverage — turn past findings into tests

The archived findings are the raw material. They are not all worth encoding: some are
duplicates, some cosmetic one-offs, some already covered. The work is to triage them into
*must-be-a-test* / *already covered* / *not worth it*, then write the missing ones as browser
tests.

**Triage authority:** QA proposes the split with a one-line reason per item, COO reviews, you
can veto anything. That way the judgment is visible rather than silent.

#### B2. The gate — a checkable definition of "ready for you"

Proposed rule: **an item does not enter your UAT log until three things are green** —

1. the normal CI suite,
2. the PO-journey pack from B1,
3. the post-deploy check, run against the actual deployed build (workstream D).

Today only the first exists, and the third is broken. This rule is what converts a pile of
tests into a gate.

**Advisory or blocking?** I recommend **blocking** — an advisory gate is one people learn to
step around, and we have a live example of exactly that in this repo (see the risks below).
This needs your decision.

#### B3. The feedback loop — the part that stops it ageing

Every new finding you report becomes a test **before** its fix is merged. The project already
does this at the unit level under its test-first rule, so this is a tightening rather than a
new discipline: the test must live in the PO-journey pack, at the browser level, not only as a
unit test near the code.

Without B3, we do one big catch-up push and drift straight back. With it, the pack grows on its
own and your findings compound instead of evaporating.

**Deliverable:** a named PO-journey pack running in CI, plus the gate rule.
**Owner:** QA. **Blocked by:** nothing — see the reframe immediately below.

#### The reframe: this is *not* blocked on the P1, and treating it as blocked is why it doesn't exist

QUAL-39's notes name two prerequisites: the single-origin test topology (the blocked P1) and
the test-selector debt. **I think the first is wrong and it has cost us a month.**

- The P1 changes *how the app is served* during tests — one origin instead of two.
- PO-journey tests care about *product behaviour*, which today's rig exercises perfectly well.
  52 tests already do exactly that, and the suite has been green on ten consecutive runs.
- What today's rig cannot catch is CSP faults. That is **one defect class**, not the pack's
  value — and it is the class the post-deploy check was separately built to cover.
- So the prerequisite trades a month of no regression coverage for one class of defect that
  something else was already meant to catch.

**And the decoupling is free rather than a compromise:** when the P1 lands, the same pack
starts catching CSP faults too, with no rewriting. The tests don't change — only the topology
underneath them does. Build it now on today's rig; it gets strictly better later.

The **second** prerequisite is more real but much smaller than it looks. Only tests that need
to tell the same control apart in two different panels need stable selectors, and only 13 of
87 component files currently have any. That is genuine debt (tracked as QUAL-54 by this plan),
but it is scoped by *which journeys we pick* — so it belongs inside the pack work, added where
the chosen journeys need it, rather than standing in front of it as a gate.

---

### C — Make the invisible class visible *(the P1)*

The stated fix — run the test browser against Express in production mode — **would crash the
server on startup**, and this was never checked in the month the item has been open.

`SERVE_STATIC` is gated on `NODE_ENV=production`
([server.ts:88](../../src/backend/server.ts#L88)), but a deliberate security guard
([server.ts:290](../../src/backend/server.ts#L290)) makes `BYPASS_AUTH=true` a **fatal error**
whenever production mode is set — and the browser tests depend on that bypass to run without a
real login. The two requirements are mutually exclusive as the code stands.

Resolving it means either decoupling "serve the built frontend" from the production flag, or
giving the tests a real authentication path — which was declined once already, at ADL-33 §4,
on credential-scope grounds. That is a design decision touching a security gate, so it needs an
**Architect pass**, not an implementation brief.

**Deliverable:** an ADL settling the topology, then implementation.
**Owner:** Architect, then QA/Backend. **Blocked by:** nothing.

#### C-adjacent — the cheap static check

A separate, much smaller item asserts that every external address the app fetches is present
in the security allowlist. No browser, no deployment, runs in milliseconds.

**Its value case has decayed and I want that on record rather than inherited.** It was rated
highest-yield because it would have caught two live faults. One is gone — the browser no longer
calls the geocoder directly, that moved server-side. The other is Clerk's telemetry beacon,
which is low-priority console noise from a third-party bundle that a scan of our own code
wouldn't catch anyway. I checked today's actual state: the only external address our own
frontend reaches is the map tile service, and it *is* correctly allowlisted.

So this is now **preventive, not curative**. Still cheap, still worth having, no longer the
obvious first pick. Recommend doing it, but after B.

---

### D — Check the deployed build *(partly blocked)*

Fix the post-deploy check so its one failing test is diagnosable — it currently records only a
message string, which is why a failure from 4 August was never resolved. Widen it to capture the
full context, then re-run.

**The code change can be made now. It cannot be proven fixed until staging is back**, because
diagnosing it needs a real browser hitting the real deployed origin. I'd rather say that
plainly than ship a fix and call it verified.

**One design question this workstream must answer:** what triggers it. It originally ran on
every merge to main — and because Railway gates deployment on the commit's checks, its red
status **silently skipped five staging deploys**, leaving staging five commits stale while every
PR showed green. The trigger was correctly removed; nothing replaced it, so nobody has run it
since. A post-deploy check must report somewhere the deployment platform does not read as a
pre-deploy gate.

**Deliverable:** diagnosable check + a trigger that can't deadlock deploys.
**Owner:** QA. **Blocked by:** staging (for verification only).

---

## Sequencing

Staging is down, so there is nothing to deploy to — which makes this an unusually good window,
because A, B and C are entirely local and CI-side, and C is the only item that could destabilise
the test suite. Doing that while nobody is testing is as safe as it gets.

| Order | Work | Why here |
|---|---|---|
| 1 | **A** — correct the tracker | Minutes; stops a false `done` misleading the next session |
| 2 | **B** — the regression gate | Your ask; unblocked by the reframe above; the highest-value item |
| 3 | **C** — Architect pass on the P1 | Runs in parallel with B; needs a design call before any coding |
| 4 | **C-adjacent** — the static allowlist check | Cheap, independent, no longer urgent |
| 5 | **D** — the deployed-build check | Code now, verification when staging returns |

---

## Risks, stated rather than buried

**A gate that goes flaky gets ignored — and we have a live example.** The post-deploy check
went permanently red and was then quietly ignored for 23 days across 137 merges. That is the
exact failure mode a blocking gate invites. Mitigation: the project already forbids retrying
flakiness away (`retries: 0`); to that add a standing rule that a flaky test is **fixed or
deleted the same day, never muted**.

**This reduces your testing load; it does not remove it.** The pack catches *known* regressions.
Genuinely new behaviour still needs your eyes, and always will. If the expectation is "UAT
becomes a formality", that expectation will be wrong.

**Test time is a budget.** The browser suite runs in 85 seconds today, so there is real headroom
— but a pack built from ~80 findings could erode it. Proposal: keep total CI under about five
minutes, and split the suite across parallel runners rather than trimming coverage if it gets
close.

**Triage is a judgment call.** Deciding which of the ~80 findings deserve a permanent test is
genuinely debatable, which is why B1 makes the reasoning visible per item instead of letting it
happen silently.

---

## What I need from you

1. **Approve the decoupling** — build the regression pack now on today's rig, rather than waiting
   for the P1. This is the decision that unlocks everything else.
2. **Blocking or advisory gate?** I recommend blocking.
3. **Anything you want explicitly in or out of the pack** — you know which of your past findings
   actually mattered better than the archive does.

Nothing here is started. This is a proposal.
