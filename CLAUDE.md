# Travel Tracker — Claude Code Guide

## Project
Full-stack travel tracking app. React + Vite frontend, Express backend, SQLite (libSQL) via Drizzle ORM.
GitHub repo: `ryanv11/travel-tracker`

## Dev servers (run in separate terminals)
```bash
npm run dev:api      # Express backend → http://localhost:3001
npm run dev          # Vite frontend  → http://localhost:5173
```

## Testing
```bash
npm run test:backend           # Backend unit tests (Vitest)
npm run test:frontend          # Frontend unit tests (Vitest)
npm run test:contract          # Contract tests (Vitest — requires backend running)
npm run type:check             # TypeScript type check (frontend only)
npm run type:check:backend     # TypeScript type check (backend only)
npm run type:check:all         # TypeScript type check (frontend + backend)
```

## Pre-push checklist (mandatory)
Run `/pre-push` before every `git push` and iterate until all checks pass.

## Git workflow

### Branching (adopted 2026-03-21)
- **Never commit directly to `main`** (or `production`) — hard-blocked by
  `.claude/hooks/no-protected-commit.sh` (PreToolUse). Emergency override:
  prefix the command with `ALLOW_PROTECTED_COMMIT=1`. The prod promotion uses
  `git merge --ff-only` (no commit) and is unaffected.
- Each agent brief gets its own branch:
  - `feat/<slug>` — new features (e.g. `feat/nr14-backend-auth`)
  - `fix/<slug>` — bug fixes (e.g. `fix/d04-country-name`)
  - `chore/<slug>` — tooling, housekeeping (e.g. `chore/update-claude-md`)
- Branch off `main`, commit to your branch, then open a PR
- **Agents must never leave deliverables as uncommitted working tree changes** — all output must be committed to the agent's branch before filing a completion report
- PR title and description must reference the GitHub issue number (`Closes #N`) and BRD section if applicable
- **COO reviews and merges PRs** — agents do not merge their own PRs

### Environment promotion (adopted 2026-07-21)
Two Railway environments, two different promotion models (ADL-35, OP-22):
- **Staging** watches `main` continuously — every merge to `main` deploys to staging automatically, same as before.
- **Production** watches a long-lived `production` branch instead of `main`. Promotion is an explicit,
  separate step: `git merge --ff-only origin/main` into `production`, then push. No tags-as-trigger, no
  GitHub Action — this stays a manual, zero-glue fast-forward (Railway's own branch-watching does the rest).
- **`production` is never a PR target and agents never touch it.** The branch-per-brief workflow above
  (`feat/`/`fix`/`chore` off `main`, PR back to `main`) is completely unchanged — this section only adds a
  second, COO-driven promotion step from `main` to `production` after a merge, when a change is ready for
  prod rather than just staging.
- Staging and prod currently share one Clerk user pool (topology change tracked separately, not yet decided
  — see `jobs/COO/open-dialogues.md`).

### Agent dispatch isolation (mandatory, OP-19/20)

**Every Agent-tool dispatch that will do git work (commits, branches, PRs) must pass
`isolation: "worktree"`.** Read-only dispatches (research, review, investigation) don't need it.
Without it, concurrent agents share one `HEAD`/index/working tree and a commit lands on the wrong
branch — this is what makes the branch-per-brief rule real, not nominal.

Worktree isolation does **not** cover three things (OP-20) — the agent must handle each:
- **Shared stash.** `refs/stash` is a single ref across all worktrees. Never use bare `git stash` /
  `git stash pop`; to compare against a clean tree, `git diff` redirected to a scratch file.
- **Working directory.** A dispatch's first action must confirm its cwd (`pwd` / `git rev-parse
  --show-toplevel` matches the assigned worktree) before running anything else.
- **`node_modules`.** A fresh worktree doesn't inherit it — run `npm install` in the worktree first.

Full incidents: memories [[feedback_agent_dispatch_isolation]], [[feedback_worktree_stash_cwd_guardrail]].

### Deployment shakedown before UAT (mandatory, OP-32)

UAT run against a build nobody has verified produces **false product bugs** — defects logged
against the product that are really environment faults.

**Before a UAT round on deployed code, run a deployment shakedown** confirming the deployed
build behaves like `main`: the app loads, the browser console and network tab are clean, and
each externally-dependent surface is exercised once. Anything failing there is a **deployment
defect**, logged as such — not as a product bug.

**Environment parity is the durable half of this.** A shakedown catches instances; parity
closes classes. The standing rule:

> **Enumerate every way the test environment differs from production, and treat each
> difference as an untested surface.** Any defect class that lives inside a difference is
> invisible to CI by construction — no amount of test-writing inside the wrong environment
> finds it.

The known differences are tracked as **QUAL-18** (single-origin E2E topology), **QUAL-19**
(CSP allowlist contract test) and **QUAL-20** (post-deploy smoke check). The worked example — E2E
serving the frontend from `vite preview` with no CSP header where production serves it from Express
*with* helmet's CSP, making every `connect-src` violation unobservable in CI — is in memory
[[project_env_parity_csp_blindspot]].

> **SUPERSEDED (2026-08-27) by ADL-57 — retained for history.** The enumeration above ran once
> (2026-07-28) and produced QUAL-18/19/20; two further divergences (BUG-101, QUAL-54) were then found
> by accident, and ADL-57 found four more. ADL-57's finding is that *"enumerate every way the test
> environment differs from production"* has **no stopping condition**, so it cannot be completed or
> owned — it is replaced by enumerating each test tier's **fidelity claims** and **declared
> non-goals**, which is bounded. **Canonical home:
> [`jobs/architect/tech/test-environment-fidelity.md`](./jobs/architect/tech/test-environment-fidelity.md)**
> (QUAL-56). The paragraph above is no longer the current list and must not be treated as complete.

### Negative findings need two probes (mandatory)
Positive findings self-verify — the thing is there, you can see it. Negative findings don't, and they
are disproportionately load-bearing because designs get built on "X doesn't exist" without anyone
checking again.

**The rule.** Any claim that something does not exist, is not enabled, is unreachable, or is
not implemented must either:
- be established by **two independent probes that could fail differently** — a grep *and*
  reading the file; a network probe *and* checking the allowlist; a code search *and*
  running the thing — where a single wrong assumption cannot produce both results; **or**
- be **explicitly marked `UNVERIFIED`**, stating the probe that was run and its blind spot.

"I grepped for X and found nothing" is a finding; "X does not exist" is a claim — never
silently upgrade one into the other. **Binds every role, explicitly including the COO**
propagating a finding into a tracker note, brief, or plan: a claim inherited from an
existing project doc is *not* pre-verified, age is not evidence, and this has caught
COO-authored false premises more than once (OP-29).

**Hook-enforced (OP-26/OP-29, warn-only).** `.claude/hooks/negative-findings-guard.sh` scans
new `jobs/**` writes, tracker notes, and `gh issue/pr` bodies (the COO writes briefs via
Bash, not files) for absence-language lacking an adjacent second-probe or `UNVERIFIED`
marker. Warn, not block — regex on prose false-positives (e.g. quoting this rule). War
stories and blind-spots: memories [[feedback_negative_findings_hook_enforcement]],
[[feedback_negative_probe_scope]], [[feedback_reviewers_negative_claims_need_probing_too]].

### No wholesale rewrites of shared records (mandatory, OP-28)

PO direction: *"agents should never fully rewrite anything — if a full rewrite is required there is a
fundamental issue/deviation and I'd want it double checked."*

**The rule, scoped by file class:**
- **Shared-record files — append or amend only, never wholesale replacement.** They accumulate
  entries across agents and sessions, so replacing one destroys other people's records:
  `jobs/**`, `_project/tracker.json`, the BRD, the ADL log, `.planning/**`, `CLAUDE.md`.
  Mechanically: **use `Edit`, not `Write`, on any that already exists.** A deliberate bulk
  restructure (e.g. the whole-file reshape of a doc) is legitimate but declare it and preserve
  the content.
- **Source code — a full-file rewrite is allowed but must be declared** in the completion report
  with the reason, so the COO can confirm it was deliberate, not a deviation.

**Hook-enforced (warn, not block).** `.claude/hooks/no-wholesale-rewrite.sh` fires on a `Write`
to an already-tracked shared-record file and points at `Edit`. Memory
[[feedback_no_wholesale_rewrites]].

### Scanner suppressions need COO sign-off (mandatory, OP-30)

An implementation agent independently weakening a **security scanner's** configuration to turn a red
check green is not a call an implementation brief carries, however narrow. (The existing
`.gitleaks.toml` exact-string allowlist is COO-sanctioned — `useDefault = true` keeps every standard
rule active; this governs *new* suppressions.)

- **First, fix your own text.** When a scanner flags content *you just authored* and it is a
  false positive, reword your text. Rephrasing a changelog note costs nothing and leaves the
  scanner at full strength.
- **Never add or widen a scanner suppression** — `.gitleaks.toml` allowlists, `nosemgrep`
  comments on new code, `npm audit` exceptions, lint-rule disables — **without COO sign-off.**
  Stop and report the finding instead. Existing `nosemgrep` annotations with a stated reason
  (e.g. the `requireAuth`-applied-globally comments in `src/backend/routes/`) are unaffected;
  this governs *new* suppressions.
- A suppression the COO does approve carries a comment naming what was flagged, why it is a
  false positive, and how it was verified — as `.gitleaks.toml` now does.

### BRD → tracker rule (mandatory)
Whenever the BRD is updated (a changelog entry is written), the COO must create tracker
entries for every new requirement ID introduced before closing the session. No BRD version
bump is complete until all new IDs have a corresponding tracker entry.

### Dispatch gate — run `/coo-dispatch` before any deliverable brief (mandatory, OP-39)

Before dispatching any brief that produces committed deliverables, run the **`/coo-dispatch`** skill —
the single canonical home for the pre-dispatch gate (readiness · verification · mechanics, including
classify OP-32, BRD gate, success criteria, security checklist OP-06 and ATDD-first OP-35) and the
required `=== COO DISPATCH GATE ===` brief-header. Enforcement is agent-side: the receiving agent
refuses to start a deliverable brief lacking the header (`_shared/frameworks.txt` standard 31).
Read-only research/review/investigation dispatches are exempt. Lifecycle:
`/coo-startup → /coo-dispatch → /coo-merge-and-close`.

### Spike-gate the BRD: no requirement enters as "approved" on an unverified premise (mandatory, OP-33)

The pattern behind this project's expensive churn: **a premise (usually an "only way" or absence
claim) promoted to a gate artifact — a BRD requirement, a closed bug, a brief — before the probe that
tests it runs.**

**The rule:**
1. A requirement resting on an unestablished premise does **not** get version-bumped into the BRD as
   *approved* — it enters a **proposed, spike-gated** state, recorded but not law.
2. Before the spike, its load-bearing premises are written as a **verify-checklist** (each
   verified/unverified, with the probe that settles it) — the required artifact, not an afterthought.
3. **BRD promotion waits for the checklist to clear.** A premise that fails takes the requirement with it.
4. **"Only way / sole option" justifications are premises, not conclusions** — probe each plank
   separately (an argument *for* something can lose half its planks and still look whole).

Decision-layer counterpart to "success criteria before dispatch": that stops an ambiguous *done*,
this stops an unverified *why*. Full record: tracker OP-33, memory
[[feedback_arguments_for_are_absence_claims_too]].

### PO input is authoritative but not infallible — probe it like any other source (mandatory, OP-34)

PO direction (*"just because I'm the PO doesn't mean I always know best"*): authority suppresses the
downstream check, so an unprobed wrong statement is expensive (the BRD carried *"GE-17 works offline"*
for a whole version this way). PO input still decides — but it is **tested on two axes before it
becomes law or work**:

1. **Truth — factual claims** (*"it works offline," "this used to work"*) are probed exactly as an
   agent's claim; the negative-findings two-probe rule binds, the source being the PO does not exempt
   it. "It used to work" is decisive for defect classification (OP-32) and must be *confirmed*.
2. **Value — requests.** A discretionary / *"wouldn't it be nice"* request gets a proportionate
   **impact-cost-benefit** assessment with a recommendation before it's promoted or dispatched (a
   one-line ask gets a sentence; a clear defect / P1 needs none).

Both resolve to **probe before promote** — the PO is a source, not an exception. Full record: tracker
OP-34, memory [[feedback_never_attribute_an_inference_to_the_po]].

### Document lifecycle (mandatory)
Adopted 2026-07-07 after the doc-integrity audit (`audits/session-a-doc-integrity.md`)
found that every HIGH-severity stale-doc failure traced to a missing closing step, not
rule non-compliance (worst case: OP-06 checklist verdicts never flipped after PRs #80–#94
fixed them). Every document that renders a status or verdict — gate checklists, backlogs,
open-questions sections, "current state" assessments — is presumed live until stamped
otherwise:

1. **Same-PR updates** — a PR that changes a fact asserted by a status/verdict document
   must update that document in the same PR, citing the PR/commit (e.g. flipping an
   OP-06 item FAIL → PASS).
2. **Supersession stamps** — when a new decision or spec supersedes part of an existing
   document, the same PR stamps the superseded section:
   `> SUPERSEDED (YYYY-MM-DD) by <successor> — retained for history.` Old text stays.
3. **Historical banners** — a document nobody will maintain must say so at the top:
   `> HISTORICAL — snapshot as of YYYY-MM-DD, not maintained.` This removes it from the
   "current truth" set without deleting the record.
4. **Open-question closure** — when a decision answers an open question in the BRD or a
   spec, the answering PR records the resolution in that open-questions section.
5. **One canonical home per topic** — no new document may claim to be "authoritative",
   "binding", or a "single source of truth" for a topic that already has a canonical
   document; it must point at the canonical home instead.

Enforcement hooks: `/pre-push` includes a status-doc check; `/coo-startup` includes a
lifecycle spot-check over PRs merged since the last session.

### GitHub issue ↔ tracker cross-referencing (mandatory)
When raising a GitHub issue for something that has a tracker entry, include the tracker ID
in the issue title — e.g. `fix(BUG-15): wrap executeCarryForward in a transaction`.
The tracker entry's `notes` field must include the GitHub issue number in return.
This applies to all new issues — bugs, features, chores — anything with a tracker entry.

**Tracker integrity is machine-enforced.** Before assigning a new ID, take max+1 of the
whole prefix across BOTH `tracker.json` and CLAUDE.md governance IDs (OP-NN rules also live
in the tracker — it is the complete OP registry). `npm run tracker:check` (in `/pre-push`
and CI) hard-fails on any duplicate ID, missing required field, or `brdRefs` value that
isn't a real BRD requirement ID. A duplicate tracker ID has slipped three times and git
never catches it — this gate does.

### Every issue and PR body opens in plain language (mandatory, OP-41)

Issue and PR bodies land in the **PO's** notifications, and he is not in the code every day.
Today they are written entirely for the receiving engineer: precise, evidenced, and
impenetrable to anyone who hasn't memorised the tracker.

**The rule.** Every `gh issue create` / `gh pr create` body opens with a short
**`**In plain terms:**`** block — two or three sentences, no tracker IDs as nouns, no jargon,
saying what a user would actually experience and what the change does about it. The existing
technical body then follows **unchanged**, below it. The engineer reads past the block; the
PO reads only it.

```
**In plain terms:** when you pick a place from the search results it saves straight away —
before you can fill in the arrival and departure dates sitting right there on the same
screen. It does this on both search screens. The fix is that picking should just fill in
the form and wait for you to press "Add City & Place".

**Tracker:** BUG-99 (P2) · **BRD:** GE-21 (v3.22) · **Design:** ADL-56 D1/D7, Slice 1
## Symptom
...technical body continues exactly as before...
```

**Titles are deliberately unchanged** — they feed squash commit messages and are referenced
from tracker notes, so the `type(ID): description` convention stays exactly as specified
above. This rule adds a block; it removes and reformats nothing.

**Scope.** Issue and PR bodies only. Code comments, tracker notes, ADLs, the BRD and
completion reports are unaffected — they are read by engineers and machine-checked, and they
stay precise. The COO's full PO-facing writing standard lives in `/coo-startup`
(*Writing for the PO*); this is the one clause of it that binds every role.

**Not machine-enforced, and that is a known weakness.** A hook cannot tell whether prose is
plain English — a regex attempting it would misfire the way the warn-only
`negative-findings-guard.sh` does. This rule relies on the `/coo-dispatch` brief header and
on COO review at merge. The failure mode is only "an issue is hard to read", never silent
corruption, which is why it is accepted rather than mechanised.

### Opening a PR
```bash
git checkout -b feat/your-slug
# ... do work, commit ...
git push -u origin feat/your-slug
gh pr create --title "feat: description (#N)" \
  --body "**In plain terms:** <2-3 sentences, plain English, per OP-41>

Closes #N
BRD §X.X TR-XX"
```

### After opening a PR
```bash
scripts/ci-wait.sh pr <PR_NUMBER>

# If ci-wait.sh reports a failure, read the logs like this:
gh api "repos/ryanv11/travel-tracker/actions/runs/<run-id>/logs" > /tmp/runlogs.zip
unzip -p /tmp/runlogs.zip | grep -iE "fail|error" | head -40
```
`scripts/ci-wait.sh` blocks until every check finishes and exits non-zero if any
failed, instead of a hand-rolled polling loop — don't write your own (see the
script's header comment for why: a past ad-hoc script broke outright from naming a
variable `status`, a read-only special variable in this environment's zsh shell).

> **Do not use `gh run view <id> --log-failed` — it fails open in this container**
> (QUAL-27, found 2026-08-04 by the OP-27 review of ADL-49, COO-verified with three
> probes that fail differently). Job-level logs are served from an Azure blob host the
> firewall blocks; `gh` swallows the connection error and **exits 0 with empty output**.
> An agent that runs it on a genuinely failed run sees nothing and success, which reads
> as "nothing failed". `scripts/ci-wait.sh` itself is unaffected — it is built to fail
> closed ("absence of evidence is treated as failure") and correctly reported the failure
> that exposed this. What broke was the *diagnosis* step after the gate, not the gate.
> The `gh api …/logs` form above uses a reachable host and is verified working.
- Do not consider a task complete until CI passes (all jobs green)
- Fix any CI failures before filing your completion report

### Merging a PR and closing a session (COO only)
The COO merges via the `/coo-merge-and-close` skill — squash merge, branch hygiene,
and the full session-close checklist live there. Two rules bind regardless:
- Squash merge is standard; no stale local branches after a merge session
- **Post-merge verification is mandatory**: main's own CI must go green after every
  merge (`scripts/ci-wait.sh branch main`) — a green PR does not guarantee a green
  main (BUG-24). Red main is fixed immediately, never left unowned.

### Recording decisions (ADL entries, BRD bumps)
Load the `/record-decision` skill before editing the ADL log, a standalone ADL file,
or the BRD — numbering, supersession stamps, open-question closure, and the
three-places BRD version bump live there.

### Architect fresh-eyes review (mandatory, OP-27)
Adopted 2026-07-28. Every Architect deliverable that will be cited elsewhere — an ADL
feeding a BRD bump or an implementation brief — gets reviewed by a **second, freshly
dispatched** Architect agent before it's trusted, not by the same agent re-checking its
own work in the same thread.

Workflow: dispatch the spec-writing Architect brief → let that subagent close out fully
(new context, no memory of its own reasoning carried forward) → dispatch a second Architect
agent, fresh context, given only the spec, with an explicit instruction to critique and
stress-test it rather than confirm it. This is not optional for small deliverables — the
Wave 0 precedent this is modeled on (ADL-41 §7.2.1's false FK-enforcement claim, caught only
because the re-dispatched agent was told to review critically rather than rubber-stamp) cost
a wrong eight-delete design when it was skipped once. Same shape as the negative-findings
rule above: a single reasoning chain, even given a chance to double back, tends to
re-confirm its own premise — genuinely independent eyes catch what a self-check doesn't.

**Tier the review by stakes (design-reflection R5, PO-directed) — but never tier away independence.**
Every cited Architect deliverable still gets a fresh-eyes review; nothing skips it. What the reason
for this rule demands at *every* level — a single chain re-confirms its own premise — is that the
reviewer is **always a freshly-dispatched agent, never the author re-checking itself**. What scales
with stakes is the reviewer's *model and depth*:
- **High-stakes** (the OP-35 objective trigger — schema / migration / access-matrix / data-integrity
  invariant like uniqueness/FK/dedup / shared-contract release) → a full fresh **Opus** review, deep
  adversarial stress-test (the original behaviour).
- **Low-stakes** (a cited ADL *not* in those classes — process, tooling, doc-structure, naming) → a
  lighter fresh review: still an independent fresh chain, but a cheaper-tier (**Sonnet**) reviewer
  running a focused checklist (premise / negative-findings check + the amendment-seam check below),
  not a full stress-test.
- **Optional escalation** — for the hardest *non-security* reasoning (e.g. a gnarly data-integrity /
  dedup invariant), **Fable** may stand in for Opus. Not a mandatory tier. **Do not** route
  security-flavoured reviews (access-matrix, auth, `userId`-scoping) to Fable: its cybersecurity
  classifiers can refuse benign security-review content, and an Agent-tool dispatch has no
  refusal-fallback.

**Two refinements adopted 2026-08-08 (PO direction; ADL-52).** Both prevent the same silent
failure — a review that comes back clean because it spent itself on the wrong target looks
identical to one that genuinely found nothing.

1. **Resolve the authoring agent's own flagged open questions before dispatching the
   reviewer — *if any*.** When the author deliberately flags open items rather than guessing,
   take the PO decisions and amend the spec *first*, so the reviewer receives a settled spec
   and spends its one pass on blind spots, not on gaps the author already surfaced. The
   *if any* is load-bearing: a spec with no open questions skips this and adds zero latency.
   Trigger: the ADL-46 review — the COO was about to dispatch the reviewer at a spec carrying
   three author-flagged items and a phasing plan the PO then overrode; the PO stopped it
   (*"before dispatching the second architect, let's make sure there aren't any outstanding
   questions or concerns from the first"*).

2. **A review of an *amended* document reviews the whole document, not just the amendment —
   and explicitly checks the seam.** Hand a reviewer only the new section and every finding
   that lives in the contradiction between the amendment and the sections it *didn't* touch
   is invisible by construction. So scope the entire document, and ask specifically whether
   the amendment invalidated an earlier **verdict**, **method**, or **reason** in a section
   it never edited — an amendment's consequences routinely stop one step early (the discovery
   is correct; its knock-ons aren't walked). Trigger: all four blocking findings against
   ADL-49 §10 lived in the seam between §1–§9 and the new §10, caught only because the review
   brief happened to scope the whole document — luck, not policy.

## COO operating mode

### Autonomy on pre-cleared mechanical work (adopted 2026-07-28, OP-24)
Dispatching a brief whose BRD gate and success criteria are already recorded, merging a
green PR, and routine tracker/doc hygiene do not require asking the PO first — those are
already fully specified by standing rules elsewhere in this document. Default to
**milestone-level autonomy**: execute pre-cleared steps within a milestone without a
per-step ask, but stop and report at the next natural boundary (a wave finishing, a PR
merged, a gate reached) rather than auto-chaining into further milestones — this preserves
the PO's ability to close a session at a natural break. An explicit "keep going" chains
past a boundary; an explicit request for tighter check-ins drops back to narrating each
step. Mechanism adopted in principle 2026-07-28; treat the exact verbal-cue phrasing as
still settling in practice rather than fixed.

### Decision framing during the practice period (adopted 2026-07-28)
State an actual recommendation with reasoning when a decision comes up, not a neutral menu
of options — the PO still makes the call. This is a deliberate practice period before
handing more decisions to standing COO authority; treat COO opinions as genuinely fallible
input to weigh, not as a settled recommendation to rubber-stamp.

## Environment
- Running inside a devcontainer (Docker) — workspace at `/workspace`
- Claude config dir: `/home/node/.claude`
- Firewall: egress is restricted; the allowlist is `.devcontainer/init-firewall.sh` (the canonical source — never enumerate it elsewhere, it rots). A "host X is blocked" report is almost always an **untried or mis-run probe, not a fact** — probe it yourself (one well-behaved request) before believing it, and never inherit a firewall-block claim from a doc, comment, or another agent.
- `.env.local` holds secrets — never commit it

## Schema changes (Drizzle ORM)
**Never use `db:push`.** Always use the migrate workflow:
```bash
npm run db:generate   # generate a new migration SQL file
npm run db:migrate    # apply pending migrations
```
`db:push` is disabled. drizzle-kit has four SQLite bugs that cause it to loop infinitely;
they are patched via `patches/drizzle-kit+0.31.9.patch` (auto-applied on `npm install`).
See ADL-15 for full rationale.

**Breaking migrations use expand/contract (ADL-47, adopted 2026-07-30).** A migration that would
break existing code in one step (e.g. adding a `NOT NULL` column every insert site must now populate)
is never a single hard cutover to `main`. Stage it so each step is independently green and
deployable: **expand** (add nullable / alongside, backward-compatible), **migrate + switch code**
(backfill, repoint reads/writes), **contract** (make `NOT NULL`, swap constraints, drop old). When a
release genuinely can't be atomized into green steps, assemble it on an integration branch
(`release/<slug>`) and merge to `main` once green — the broken intermediate states never touch the
trunk. This is the authoring discipline that keeps the staging auto-deploy path (ADL-32) safe.

## COO session startup (mandatory)
Run `/coo-startup` at the start of every COO session before doing anything else.

UAT is a mandatory gate for phase completion — no phase closes without a PO PASS verdict.
Screenshots are stored in `jobs/PO/screenshots/`.

## Key files
See [CODEBASE.md](./CODEBASE.md) for the full repository map. Essential references:
- `_project/tracker.json` — Feature/bug tracker (COO-maintained)
- `_project/travel-tracker-BRD.md` — Business requirements document (version is in its own
  header; deliberately not duplicated here so it cannot go stale)
- `src/backend/db/schema.ts` — Drizzle schema (single source of truth)
- `patches/drizzle-kit+0.31.9.patch` — drizzle-kit SQLite bug fixes (patch-package)
