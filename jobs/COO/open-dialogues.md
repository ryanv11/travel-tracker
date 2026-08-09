# COO ↔ PO Open Dialogues

Lightweight register for topics under active discussion but **not yet decided or tracked**.
**Not authoritative** — nothing here is policy, a commitment, or tracked work. This file exists
so a live discussion thread survives `/clear` without prematurely cluttering the canonical
documents (CLAUDE.md, tracker.json, an ADL, the BRD) with half-formed proposals.

Adopted 2026-07-19; scope tightened 2026-08-08 (PO direction) to a **temporary staging area
only** — see below.

## How to use

This file has exactly two sections, and nothing else lives here:

- **Open** — a genuinely undecided, not-yet-tracked topic. New entry when a discussion produces
  a real proposal that isn't yet confirmed — not for every passing remark. Keep entries terse;
  the full analysis belongs in the artifact it eventually promotes to.
- **Parked** — a topic decided *not now / watch for recurrence* that has **no other home** (not
  tracked, not a rule, didn't resolve into a doc). Kept only so it can be re-raised if it recurs.

**On resolution, delete the entry.** Once a topic is promoted to its real home
(tracker/ADL/CLAUDE.md/BRD/skill file) or otherwise resolved, remove it from this file entirely —
the canonical home is the record and git history preserves the discussion. Do **not** leave a
pointer behind; a second, non-authoritative copy only goes stale. The one exception is Parked,
which by definition has no other home.

Checked at every `/coo-startup` pickup and by the Restart Preview step in `/coo-merge-and-close`.

## Open

### D-23: Enumerate the container's CREDENTIALS, the way we just enumerated its hosts
**Raised:** 2026-08-04 · **Status:** proposed by the COO, flagged to the PO, not commissioned.

The ENV-01 work enumerated every external **host** this container can and cannot reach. The PO's
stated threat model ([[project_container_threat_model]]) is that the container exists to stop
**changes**, with access restricted through API permissions and *"a case made for any access
required."* If that is the model, then **the network is a coarse accident control and the real
boundary is credential scope** — and nobody has enumerated the credentials as a set.

The same move, one layer down: for each token or credential present in this container, what can it
**change**, and what is the case for it holding that power? Known starting points, none verified as
a set: the Turso diagnostic token (recorded as read-only by ADL-33 §5 design), GitHub write access
(agents push branches, open PRs, create issues — the largest write surface, deliberate), the
Anthropic API key, and whatever `.env.local` holds.

Sharpened by two findings from the same session. **QUAL-28** established that the allowlist is
IP-matched and bypassable to any Cloudflare-fronted origin, so for those hosts the credential is
already the *sole* control with no network backstop. And ADL-33 §4's Clerk exclusion turns out to be
credential-based rather than network-based — which under this threat model is *correct*, but means
the standing condition attached to it has to be somewhere a person provisioning a credential will
actually read. It was moved into ADL-33 §4 for exactly that reason.

**Not a tracker entry yet** — it is a proposal for a piece of work, not scoped work. Needs a PO
decision on whether it is worth an Architect round.

### D-14: Trip country search matches full names only — should ISO codes ("US"/"USA") be added?
**Raised:** 2026-07-28

BUG-52 shipped (#320) matching **full country names only**. TR-13 was amended at BRD v3.12 to
require exactly that and to explicitly exclude ISO codes and informal abbreviations, so the
shipped behaviour is correct-as-specified.

**But the PO's original report gave two examples — "United States" *and* "USA" — and only the
first works.** The COO made that scoping call inside the brief rather than surfacing it, which
is the same shape as the BUG-55 misclassification: a product decision settled unilaterally.
Ryan asked for the reasoning (explicitly not as disagreement), which prompted the re-analysis
below.

The original reasoning was that an alias list is a **data-sourcing decision** of the same class
as BUG-45 (airline dropdown) and OQ-06 (ISO 3166-2 subdivisions), both parked pending ADL-43 —
so bundling it would either block a 7-line fix on an ADL, or have an agent invent an unsourced
alias list. That still holds for *part* of it. But the re-analysis found the COO had collapsed
**three** tiers into two:

| Tier | Example | Real cost |
|---|---|---|
| Full name | "United States" | **Done.** Already in the payload (`TripSummary.countries[].name`) |
| ISO codes | "US", "USA" | **Much cheaper than presented.** `country_code` (alpha-2) is *already in the payload*, so "US" was excluded for no good reason. "USA" is alpha-3 — a stable, closed, public ~250-entry list. No source decision, no ambiguity, no ADL |
| Colloquial | "America", "Britain", "Holland" | Genuinely BUG-45's class — needs a curated source and a judgment call on what counts |

Only tier 3 is really the parked problem. **COO recommendation: add tier 2** (a small static
ISO alpha-2/alpha-3 map, roughly an hour, no ADL needed) so both of the PO's original examples
work; leave tier 3 parked with BUG-45. Suggested as a follow-up item rather than reopening
BUG-52, since the shipped behaviour is correct as far as it goes. **Not yet decided** — awaiting
Ryan. If adopted it needs a small TR-13 amendment, since TR-13 currently forbids exactly this.

### D-05: Separate prod/staging Clerk applications
**Raised:** 2026-07-21

Ryan proposed cloning the current Clerk app into a dedicated staging/dev instance,
mirroring the existing Turso prod/staging split, so staging sign-ins don't mix with real
production users. Directionally reasonable hygiene, but flagged as NOT a full fix for
ADL-32 §6's still-open question (whether Clerk's allowed-origins config supports the
dynamic per-PR preview URLs Railway generates) — that's about the app's origin config, not
which app backs it. This is an auth-topology change, so per the standing infra/runtime
guardrail (Architect review before COO acts) it should get a brief Architect pass before
implementation. Ryan said to leave it as an open note for now, not act on it.

### D-27: Prod error telemetry (Sentry or similar)
**Raised:** 2026-07-31 (review-execution-queue item 18) · **Status:** proposal, needs a PO call.

Nobody watches production at runtime — current coverage is CI pre-deploy + the PO's own eyes.
Prod error telemetry (Sentry or similar) on backend + frontend would close that gap. Needs a PO
decision on the external service (and the dependency), and — being infra — an Architect ADL before
COO acts. Migrated here 2026-08-08 when the review-execution-queue was retired; it's a PO-decision
proposal, not scoped work, so it lives here until the service is chosen.

### D-28: UAT WIP limit — cap on `done_pending_uat` before new dispatches
**Raised:** 2026-07-31 (review-execution-queue item 18) · **Status:** proposal, needs a PO call.

Propose a process rule: "no new wave dispatches while more than N items sit `done_pending_uat`" — the
PO is the UAT bottleneck, and an unbounded pending-UAT queue is where staleness and lost feedback
accumulate. The PO sets N. If adopted it's one CLAUDE.md line. Migrated here 2026-08-08 (queue retired);
held as a proposal until the PO sets N (or declines).

### D-29: Regular reviews/cleanups for stale-reference & doc-rot (the delete-over-document class)
**Raised:** 2026-08-08 · **Status:** proposal, needs a PO call on cadence + mechanism.

This session surfaced a whole CLASS of stale-inheritable claims — reference docs/comments that agents
read as fact but that had rotted: the firewall allowlist enumeration; "firewall blocks Nominatim" after
ADL-49 allowlisted it; "E2E not in CI"; `jobs/_shared/frameworks.txt`'s entire stack (Electron/Postgres/
Clerk-Phase-2); "the 30 numbered standards" (was 31); broken `file:line` cross-refs. A two-scanner audit
found and fixed ~19 files and deleted 2 redundant ones. The **fix principle is settled and applied**:
delete the rot-prone specific; point to the single maintained source; never restate/enumerate; don't
annotate the fix.

What is NOT settled is **how to stop it re-accreting** — a regular review/cleanup cadence. This is the
concrete instance of design-reflection **R2** (institutionalize a forward-looking coherence-drift audit —
jobs/COO/20260808-design-reflection.md). Options to weigh: a periodic scheduled scan (reuse the OP-25
routine machinery) for stale-inheritable claims + BRD/schema drift; whether the standing discipline is
"delete-and-point" (chosen here) or a "last-verified stamp" (used only for dated probe results); whether
it folds into `/coo-startup` or runs on its own cadence. Needs a PO decision on cadence + mechanism before
it becomes tracked work. Related: R2, R3 (governance prune), the firewall/audit thread.

## Parked

_Decided not-now / watch-for-recurrence, with no other home. Each stays only so it can be
re-raised if the pattern shows up again. The shared lesson (D-03): a single contained incident
is not enough for a standing rule._

### D-03: OP-21 process-kill guardrail — dropped, watch
2026-07-20. An agent's blind `pkill`-style command took down the real `dev:api` server (OS
process space is shared across every worktree). Self-remediated, no data lost. COO proposed a
"confirm exact PID/ownership before any kill" guardrail; the PO dropped it — *"I don't touch the
dev server while you guys are working."* No rule adopted. **This is the precedent the entries below
cite.** Revisit only if a recurrence affects a live PO session.

### D-08: Mid-thread `/workspace` leak — a fourth isolation clause? — watch
2026-07-21. A worktree-isolated agent ran a `cd /workspace &&`-prefixed command mid-thread against
the shared tree (OP-20 only mandates a cwd check as the *first* action, not on every later command).
The sandbox guard caught it; COO reverted by hand, nothing pushed. No fourth OP-20 clause adopted
(D-03 precedent). Revisit on recurrence.

### D-09: COO worktree cleanup can race an agent's lingering process — watch
2026-07-22. After a "completed" notification, a routine `git worktree remove` collided with the
agent's still-alive poll subprocess. No harm — the agent's commits were already on origin. Open
question if ever revisited: leave a beat after a completion notification before removing. No rule
adopted (D-03 precedent). Revisit on recurrence.

### D-13: Two concurrent COO sessions collided three times in one day — watch
2026-07-28. Shared `/workspace` HEAD, an OP number allocated twice independently, and an accidental
direct-to-main commit — all in one day of two parallel COO sessions. Resolved for the day (one stood
down and handed over its PR). No standing rule; the fix if ever adopted is tracker-ID pre-allocation
+ a per-session worktree rather than sharing `/workspace`. Revisit if concurrent COO sessions become
normal rather than a one-off.

### D-24: `ci-wait.sh` reported PASS against a stale SHA — watch
2026-08-04. One instance: `ci-wait.sh pr 398` reported green against the pre-push head seconds after
a push moved it; caught by re-checking the real head before merge, and it behaved correctly on three
later runs the same session. Most likely a race between `git push` and PR-head propagation — but it
is a **fail-open** on the project's primary CI gate (QUAL-27 cousin). If it recurs, file it; the fix
would re-resolve and compare the head SHA *after* the watch completes rather than pinning it at start.

### D-26: Declare a spike's effort-box / kill-criterion up front — watch
2026-08-05. Proposed after the GE-17 spike ran ~4 days / ~15 design-review PRs with zero shipped code
before being killed. Deferred, not adopted: the team is already process-rich, and **OP-33** (the
premise-before-probe gate) may catch the runaway-spike class at its source, making this redundant.
Revisit only if a second uncontrolled spike appears after OP-33 is in force.
