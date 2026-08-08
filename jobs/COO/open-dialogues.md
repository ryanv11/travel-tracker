# COO ↔ PO Open Dialogues

Lightweight register for topics under discussion but not yet decided or actioned.
**Not authoritative** — nothing here is policy, a commitment, or tracked work until
it's promoted to CLAUDE.md, a tracker.json entry, an ADL, or a BRD section. This file
exists so a real discussion thread survives `/clear` without prematurely cluttering
those documents with half-formed proposals.

Adopted 2026-07-19, prompted by the first live run of the Restart Preview
(`/coo-merge-and-close`) surfacing genuine open threads that didn't belong in
tracker.json but also weren't safe to let vanish.

## How to use

- New entry when a discussion produces a real proposal or plan that isn't yet
  confirmed — not for every passing remark.
- Update the entry's status as the conversation progresses across sessions.
- On resolution: promote to its real home (tracker/ADL/CLAUDE.md/BRD/skill file)
  citing this entry's ID, then move the entry to **Resolved** below with a pointer.
  If dropped without action, move it to Resolved noting why.
- Checked at every `/coo-startup` pickup and referenced by the Restart Preview step
  in `/coo-merge-and-close` — an item in the Restart Preview's "not captured" tier
  that's genuinely still a discussion (not a clear-cut missing artifact) belongs here,
  not in the park doc's prose.

## Open

> **Curated 2026-08-08 (PO direction).** This file holds only genuinely *undecided, not-yet-tracked*
> topics. Anything being worked on, on hold, closed, or that is a rule/learning has been moved to its
> real home (tracker / ADL / CLAUDE.md / memory) and left as a one-line pointer under **Resolved** below.

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

### D-25: Two structural rules proposed this session, both awaiting a home in CLAUDE.md
**Raised:** 2026-08-04 · **Status:** proposed by Architect agents, COO agrees, not yet adopted.

Both came out of the ADL-49 round and are captured in **ADL-49 §10.11.5.1** as liftable text. Neither
is in CLAUDE.md yet, and adding a mandatory rule is a PO-facing change rather than COO housekeeping.

1. **"An amendment must re-walk the sections it did not intend to change."** Every one of the four
   findings against ADL-49 §10 had the same shape — *a correct discovery whose consequences stopped
   one step early*. §10.8 derived that the allowlist matches IPs, then closed by reassuring the reader
   it changed no earlier verdict; it changed several. The proposed check is three questions before
   filing an amendment: does it invalidate an earlier **verdict**, an earlier **method**, or an
   earlier **reason**?
2. **Reviewer-side corollary: an OP-27 pass over an amended document reviews the *document*, not the
   amendment.** All four blocking findings lived in the *seam* between §1–§9 and the new §10, and
   would have been invisible to a reviewer handed §10 alone. This session only caught them because
   the review brief happened to scope the whole document — which was luck, not policy.

The second is the more valuable of the two and the less obvious.

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

### D-16: OP-27 says who reviews and when, but not that the spec's own open questions must be closed first
**Raised:** 2026-07-28

**Trigger, and it was a PO correction of the COO.** Having dispatched the ADL-46 spec brief
(issue #326), the COO announced it would dispatch the OP-27 fresh-eyes reviewer as soon as the
authoring Architect closed out. Ryan stopped it: *"before dispatching the second architect,
let's make sure there aren't any outstanding questions or concerns from the first."*

He was right, and OP-27 as written does not say this. It specifies **who** reviews (a second,
freshly dispatched Architect) and **when** relative to the author (after it closes out fully,
so context is genuinely fresh), but says nothing about the spec's own flagged-open items being
resolved first.

**Why it matters.** ADL-46 shipped with three items the author had deliberately flagged rather
than guessed: a deactivation-scope ambiguity, the pending-city containment rule, and its own
phasing recommendation. Dispatched immediately, the reviewer would have spent its pass
rediscovering questions the author had already surfaced — and worse, reviewing a **D9 the PO
then overrode**, since Ryan chose one-release delivery over the author's phased dispatch. The
whole value of fresh eyes is catching what *nobody* saw; spending it on known gaps is waste.

What actually happened instead: the three items went to the PO, all three were decided, the
authoring Architect amended the spec, and only then was the reviewer dispatched — against a
settled plan, with its §13 confidence register **re-aimed** at what remained genuinely
uncertain. Two of the author's originally-weakest points had been closed by the PO decisions,
so the register would otherwise have pointed the reviewer at resolved questions.

**Proposed amendment to OP-27**, not adopted, for Ryan to accept or reject:

> Before dispatching the fresh-eyes reviewer, resolve the authoring agent's own flagged open
> questions — PO decisions taken, spec amended. The reviewer receives a settled spec, so its
> pass is spent on blind spots rather than on gaps the author already identified.

**COO recommendation: adopt.** It is one sentence, it cost nothing to follow, and the failure
it prevents is silent — a review that comes back clean because it spent itself on the wrong
target looks identical to a review that genuinely found nothing. Same family as OP-27 itself.
Counter-argument worth stating: it adds a PO round-trip before every review, which on a spec
with no open questions is pure latency — so the rule should read "resolve **if any**", not
"always pause".

## Resolved

### D-17: ATDD-first — PROMOTED 2026-08-05
Trial passed on the ADL-46 release; promoted to **ADL-50** + **CLAUDE.md OP-35** + the Architect-prompt
`ATDD-first: yes/no` marking + `.claude/hooks/atdd-first-guard.sh` + a startup canary. Full trial history
lives in **ADL-50** (canonical home); the Open-section trial log was cut 2026-08-07 on PO direction, the
record being durable in ADL-50. First application: the BUG-75 Round-4 build (QA-first, Opus 5).

### D-22: BUG-75 "four Newports" data-model-vs-product + the GE-16/GE-17 conflict — RESOLVED 2026-08-05
**Raised:** 2026-08-03/04 · **Resolved:** 2026-08-05
PO settled the requirements question (distinct real-world places sharing name+country+region may coexist;
only a true same-place repeat is a duplicate). GE-17 withdrawn; GE-16's duplicate clause stamped
under-correction in BRD v3.18 (BRD now at v3.19). Homes: BUG-75 tracker entry (P1, unblocked), BRD GE-16,
and the dispatch-ready Round-4 brief `jobs/architect/tech/20260805-BUG75-identity-round4-brief.md`.

### D-15: green PR on a stale base merged into a red main — ANSWERED 2026-08-01
**Raised:** 2026-07-28 · **Resolved:** 2026-08-01
Answered mechanically by branch protection rather than a new process rule: `main` requires branches
up-to-date before merging (`required_status_checks.strict: true`) alongside required PR review and
`enforce_admins`. Home: GitHub branch-protection config on `main` (re-verified via
`gh api …/branches/main/protection` 2026-08-07 — strict, required reviews, enforce_admins all true).

### D-10: Move the project off OneDrive — CLOSED 2026-07-23
**Raised:** 2026-07-23 · **Resolved:** 2026-07-23
Migration to `~/Projects/travel-tracker` executed on the host and verified (fresh clone, gitignored files
copied byte-identical, notify bridge reinstalled, tests green). Canonical home: **ADL-39** (incl. the F2
config-volume re-key follow-up, which materialised and was recovered as designed). The related
settings.local.json root-cause observation remains open as D-11.

### D-06: Add prod/staging Railway domains to this container's firewall allowlist — RESOLVED 2026-08-04 (ADOPTED)
**Raised:** 2026-07-21 · **Resolved:** 2026-08-04
Both `travel-tracker-staging.up.railway.app` and `travel-tracker-production-241f.up.railway.app` were added
to `.devcontainer/init-firewall.sh` (confirmed present at lines 214-215) on PO approval via ADL-49 §10.7's
consolidated diff. The allowlist change is landed in the repo and takes effect at the next container rebuild
— the original entry's "kept in place until post-rebuild verification confirms it" caveat is preserved here.

### D-03: OP-21 process-kill guardrail (proposed, dropped)
**Raised:** 2026-07-20 · **Resolved:** 2026-07-20

During the 2026-07-20 UAT-triage merge batch, an agent resolving a PR conflict ran a
blind `pkill`-style kill matching a generic process pattern and took down the real
`dev:api` server (not worktree-scoped — OS process space is shared across every
worktree in this container). It self-remediated (restarted the server, verified
healthy, no data loss), but COO proposed a fourth guardrail in the OP-19/OP-20 family
(agents must confirm exact PID/ownership before any kill command, not match on a
broad pattern) and separately asked whether the killed process had disrupted Ryan's
own work. Ryan's answer to both: drop it — "I don't touch the dev server while you
guys are working," so the specific exposure this incident showed doesn't apply to his
usage pattern. No CLAUDE.md change made; unlike OP-19/OP-20 (both confirmed as
standing rules), this one didn't clear the bar for adoption. Not re-raised unless a
recurrence actually affects a live PO session.

### D-01: Role system-prompt refresh + `.claude/agents/` custom definitions
**Raised:** 2026-07-19 · **Resolved:** 2026-07-20

Both parts of the proposed fix were carried out in full, all 8 roles (architect,
backend, database, frontend, qa, docs, ux, integrations):
1. Refreshed the git/completion-report sections of every `jobs/<role>/<role>-system-
   prompt.txt` — `git push origin main` direct-to-main replaced with the branch → 
   `/pre-push` → PR (`Closes #N` + BRD section) → CI-log-read (`gh run list` /
   `gh run view --log-failed`) → no-self-merge workflow from CLAUDE.md. Added a
   COMPLETION REPORT FORMAT section (header block: Tracker ID · issue/PR # · BRD
   section · branch) to the 5 roles that lacked one (architect, database, ux, docs,
   integrations) — modelled on the real format already in use in `jobs/COO/inbox/`.
   Backend's format also gained the mandatory security-checklist bullet (auth
   middleware, userId scoping, FK `.notNull()`, referencing OP-06 §2 / ADL-27).
2. Created `.claude/agents/{architect,backend,database,frontend,qa,docs,ux,
   integrations}.md` — each a thin wrapper: frontmatter pins `name` + `model`, body
   gives a one-sentence persona summary and directs the agent to read the full
   `jobs/<role>/<role>-system-prompt.txt` for the complete protocol. Deliberately
   thin rather than duplicating the full persona, so the system-prompt.txt stays the
   single source of truth and can't drift from the agent definition.

Dispatch is now `subagent_type: "<role>"` instead of `general-purpose` + COO
hand-typing an inline persona. Depended on D-02's model-tier decision, resolved
alongside it in the same PR.

### D-02: Model tiering policy
**Raised:** 2026-07-19 · **Resolved:** 2026-07-20

Ratified: implementation roles (backend, database, frontend, qa, docs, ux,
integrations) run on Sonnet 5, encoded in each role's `.claude/agents/<role>.md`
frontmatter. Architect runs on Opus 4.8 — Ryan's call after COO laid out the actual
Opus-vs-Fable tradeoff (cost, positioning, fit for bounded-consultation work vs.
long-horizon autonomous work); Fable 5 was considered and set aside as disproportionate
to Architect's actual job shape here (bounded design review/ADL output, not open-ended
autonomous runs). COO-lane background tasks dispatched via the Agent tool (mechanical/
verification work — CI-anomaly probes, drift-ledger checks, etc., not this interactive
session) stay on Haiku 4.5, per Ryan's explicit instruction to let COO make that call
itself. The live interactive COO session's own model (this conversation) is out of
scope for agent-definition frontmatter — Ryan sets it himself via `/model`.

### D-26: Declare a spike's effort-box / kill-criterion up front — PARKED 2026-08-08
Decided: defer, do not adopt a third process gate; **OP-33** already catches the bad-premise class at source. Revisit only if a second uncontrolled spike appears after OP-33 is in force. (Was a rule proposal.)

### D-24: `ci-wait.sh` reported PASS against a stale SHA — WATCH-ONLY 2026-08-08
One instance, not a class; a fail-open (QUAL-27 cousin). If it recurs, file it as a defect — fix would be to re-resolve and compare the head SHA after the watch completes. No tracked work until then.

### D-21: Nominatim/MapTiler firewall allowlist + replay fixtures — TRACKED 2026-08-08
Designed as **ADL-49**; promoted to tracker **OP-33** (apply on next container rebuild). The PO's go/no-go now lives on that item. The highest-value item on the thread (BUG-76 settlement-filter fix) already shipped.

### D-19: Constrain city lookup by trip countries + shortlist-not-filter — SUPERSEDED 2026-08-08
Overtaken by the shipped city-identity work: **UX-12 + QUAL-21 done, BUG-71/75/76 shipped**. The remaining lookup-constraint folds into **ADL-48 stage S3** (against the bundled gazetteer, `ORDER BY (country_code IN trip-countries) DESC` *is* the shortlist-not-filter pattern). Pick it up as an ADL-48 S3 consequence, not a separate design. Homes: ADL-48, UX spec (PR #344), BRD GE-15/16.

### D-20: Shared-record append collisions — TRACKED 2026-08-08
Promoted to tracker **QUAL-34** (union-merge driver for `.planning/drift-ledger.jsonl` + per-agent context files with `current.txt` as an index). Relates QUAL-12.

### D-13: Two concurrent COO sessions collided three times in one day — PARKED 2026-08-08
Resolved for the day (one session stood down and handed over its PR); no standing rule adopted, per the D-03 single-incident precedent. Revisit if concurrent COO sessions become normal. The fix if adopted: tracker-ID pre-allocation + a per-session worktree rather than sharing `/workspace`.

### D-12: Four BRD contradictions from the QUAL-05 sweep — SPLIT 2026-08-08
Item 1 (SE-01/SE-03 three-role drift) resolved by **ADL-46 → BRD v3.13**. Items 2–4 (import scope §7/§11 + PH-02/IM-06; MB-01 mobile scope) promoted to tracker **QUAL-36** so they surface at startup; each becomes a BRD bump when the PO decides import / mobile scope.

### D-11: `.claude/settings.local.json` vanished mid-session — CLOSED 2026-08-08
Practical risk closed at the OneDrive→local migration (runbook manual-copy step landed; file verified byte-identical afterward, no recurrence). Root cause never isolated, but nothing actionable remains. Home: **ADL-39** / memory `project_onedrive_dehydration`.

### D-09: COO worktree cleanup can race an agent's lingering process — PARKED 2026-08-08
Single contained incident (no harm; the agent's commits were already on origin). No rule adopted, per the D-03 precedent. Revisit on recurrence. Distinct from QUAL-32 (worktree-backlog prune, done).

### D-08: Mid-thread `/workspace` leak — fourth isolation clause? — PARKED 2026-08-08
Single contained incident (the sandbox guard caught it; COO reverted by hand). No fourth OP-20 clause adopted, per the D-03 precedent. Revisit on recurrence.

### D-07: `gh` CLI has no persistent auth in the container — TRACKED 2026-08-08
Promoted to tracker **OP-34** (host `GH_TOKEN` passthrough, or bake the credential-bridge into container startup — PO to choose). The per-session workaround (`git credential fill` → `gh auth login --with-token`) is documented there.

### D-04: Clerk API version drift — MOVED TO MEMORY 2026-08-08
Standing watch-note (pinned `2025-11-10`; check the changelog before any bump — Clerk docs not in the allowlist). Home: memory `reference_clerk_api_version_drift`. Not a live discussion.

### D-18: Lean the /coo-startup audit — TRACKED 2026-08-08
Promoted to tracker **QUAL-35** (gate heavy checks on a change-probe against the last `reviewed` sentinel; de-inline UAT + open-dialogues; archive Resolved to a separate file). PO-raised 2026-07-31; analysis complete, COO recommends adopting.

