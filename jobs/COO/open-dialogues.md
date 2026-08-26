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

### D-33: Multi-user geocoding scaling — does the shared cache suffice, or do we need coalescing / a hosted source?
**Raised:** 2026-08-11 · **Status:** parked (PO agreed) — capture now, pull into an Architect ADL only when multi-user is actually on the roadmap. Sibling of D-30 (build-vs-buy).

Thinking ahead to multi-user, the PO asked whether the public-Nominatim 1 req/s budget forces request batching and/or a local/hosted geocoding source. Verified facts (recorded so they aren't re-derived):
- **The shared catalogue accretes cross-user — but that ALONE does NOT drop the interactive live-call rate (corrected 2026-08-12, PO-caught; the earlier "residual = cache misses only" premise was WRONG).** Resolved cities are visible to all (`repositories/cities.ts` containment: `geocodeStatus='resolved' OR createdByUserId=caller OR createdByUserId IS NULL`; GE-16 / ADL-46 D5), so the catalogue genuinely grows cross-user. BUT the add-place DISAMBIGUATION path (ADL-56 Slice 1) fires a live lookup on every settled query REGARDLESS of cache state — a cached row cannot self-report whether the name's full set of real places is present (a single cached "Newport, Oregon" cannot reveal the other Newports; that inability IS BUG-97). So accretion reduces reliance for the BACKGROUND resolve/lookup paths, NOT for interactive disambiguation, whose rate is flat (one call per settled add) under always-fire-live. **The lever that actually drops the interactive rate: cache the live SEARCH RESULT per `(name, country)` server-side with a TTL, so a repeat search of a name — by any user, within the TTL — skips the Nominatim call. That is the honest "shared cache reduces reliance" mechanism: caching the ambiguity resolution, not just the picked place. Without it the interactive rate never drops.**
- **The 1 req/s is a shared, app-wide budget** (public nominatim.openstreetmap.org; single serialized chokepoint at 1100ms, `services/nominatim-client.ts`). Not a free tier with an in-place upgrade — heavy use needs self-hosting or a paid Nominatim-compatible provider. Because ALL egress funnels through one chokepoint, swapping endpoints later is a base-URL/auth change, not a rewrite.
- **The earlier "no" to a local list (GE-17) was withdrawn on four grounds that ALL failed — none was multi-user** (offline=false, testability=false, ambiguity-detection=weakened, Scotland-coverage=false). So multi-user rate-budget is a genuinely NEW, un-probed argument, not one weighed and dismissed. Per OP-33 it is a multi-plank case owed the same probing the four dead planks got — and the verified cross-user accretion is its strongest counter-plank.
- **Rate-drop levers (D-33 scope), in priority order:** (1) the per-`(name,country)` live-response cache above — the ONLY thing that drops the interactive rate as the cache warms (skips the call entirely for a repeat name); (2) COALESCE concurrent in-flight duplicate lookups (many users adding the same new city at once → one shared resolution); (3) hosted/paid Nominatim-compatible source if 1+2 still don't hold the budget. **Batching reality (why (2) is bounded):** the queue already fires at ~1/sec; `/lookup` (by osm_id) already batches ids; `/search` (by name) cannot batch distinct names — so coalescing helps only concurrent *duplicate* names, not distinct ones. That is why (1) is the primary lever.

**Why parked, not spiked now:** sizing it needs user-count / add-rate / cache-miss-rate premises that don't exist yet; OP-33 says don't promote a design on premises we can't establish. Trigger to pull it: multi-user moves from "thinking ahead" to on the roadmap. **The per-`(name,country)` response-cache lever is now tracked as QUAL-51** (deferred, pulls with multi-user); this thread stays open for the broader question — does response-cache + coalescing suffice, or do we need a hosted/paid source.

### D-30: A build-vs-buy rule
**Raised:** 2026-08-09 · **Status:** PO wants to discuss; not yet framed. Placeholder so it isn't lost.

PO flagged wanting a standing **build-vs-buy** rule at some point — when the team should reach for an
existing library/service vs. build in-house. No framing yet; the PO will open the discussion. Likely
touches the same territory as the GE-17 gazetteer spike (build-vs-buy decided by spike) and the
"default to reuse, not duplication" preference. Promote to an ADL/CLAUDE.md rule if it lands.

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

### D-26: Declare a spike's effort-box / kill-criterion up front — watch
2026-08-05. Proposed after the GE-17 spike ran ~4 days / ~15 design-review PRs with zero shipped code
before being killed. Deferred, not adopted: the team is already process-rich, and **OP-33** (the
premise-before-probe gate) may catch the runaway-spike class at its source, making this redundant.
Revisit only if a second uncontrolled spike appears after OP-33 is in force.

