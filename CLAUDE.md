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
- **Never commit directly to `main`**
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

### Agent dispatch isolation (mandatory)
Adopted 2026-07-20 after a live collision: an Architect agent dispatched without
`isolation: "worktree"` shared the COO session's own working tree, and the COO's
concurrent `git checkout` moved `HEAD` out from under the agent mid-task. Its commit
landed on the COO's branch instead of its own; caught and recovered manually before
anything was pushed, but the failure mode is real and will recur without isolation.

**Every Agent-tool dispatch of a role agent that will do git work (commits, branches,
PRs) must pass `isolation: "worktree"`.** This is what makes the branch-per-brief rule
above actually hold — a shared working tree means "each brief gets its own branch" is
true in name only, since two concurrent processes fight over the same `HEAD`, index,
and working directory. Read-only dispatches (research, review, investigation with no
commits) don't need it.

**Two further near-misses (2026-07-20, same day, tracked as OP-20) showed
`isolation: "worktree"` alone is not sufficient** — both contained, nothing lost, but
two in one dispatch round is too many to treat as one-offs:
1. **Shared stash ref.** `refs/stash` is a single ref shared across every linked
   worktree in this repo — worktree isolation covers branch, `HEAD`, index, and working
   directory, but not the stash stack. Two concurrent agents both running bare
   `git stash`/`git stash pop` raced on it; one agent's `pop` returned a *different*
   agent's uncommitted WIP instead of its own. **Agents must not use bare `git stash` /
   `git stash pop`.** To compare a diff against a clean tree, use `git diff` (redirected
   to a scratch file) instead — never the shared stash stack.
2. **Working-directory confusion.** A dispatched agent ran its initial investigation
   commands against `/workspace` (the shared COO tree) before noticing it hadn't `cd`'d
   into its assigned worktree path. Isolation only protects an agent that is actually
   inside its worktree. **Every worktree-isolated dispatch's first action must confirm
   its working directory** (`pwd` / `git rev-parse --show-toplevel` matches the assigned
   worktree path) before running anything else.

**A fresh worktree does not inherit `node_modules`** (2026-07-21) — it is not shared or
symlinked from the main checkout in this repo's setup. An agent that confirms its
`pwd` correctly but then runs tests/scripts assuming dependencies are already installed
will hit confusing missing-module errors that look like a worktree-isolation bug but
aren't. Run `npm install` inside the worktree before anything else that needs
`node_modules`, same as a fresh clone would.

### Classify a defect before briefing it: regression, deployment, or gap (mandatory, OP-32)

Adopted 2026-07-28 on PO direction, after BUG-55 was briefed as a missing feature when the
feature was fully built and the real fault was a CSP misconfiguration.

**Every defect is one of three classes, and the class determines the first action:**

| Class | Meaning | First action | Implies |
|---|---|---|---|
| **Regression** | It worked before; code changed and broke it | Find *what broke it* — git history over the failing path | A **missing test**, always. The fix is incomplete without one |
| **Deployment/config** | The code is correct; the environment, build, or config is wrong | Do **not** touch application logic. Diff the environments | An **environment-parity gap** (see below) |
| **Gap / enhancement** | It was never built | Build it | A BRD home and success criteria are required first |

Getting the class wrong invalidates the entire brief. BUG-55 was briefed as a gap; it was a
deployment defect, and the brief would have had an agent rebuild working code — then "verify"
it against a local environment where it already worked.

**The rules:**

1. **Classify before briefing, and state the class in the brief.** An unclassified item is
   not dispatchable.
2. **"It used to work" is decisive evidence and must be asked for.** It converts a gap into a
   regression or a deployment defect instantly. The PO logging UAT feedback is not expected to
   classify it — *the COO must ask* when the tracker note doesn't say.
3. **A tracker note guessing at cause is not a classification.** BUG-55's note said *"likely
   the geocode/lookup path isn't wired"* — an unverified single-probe absence claim (see the
   negative-findings rule below) that sat for a week and was disproved by one grep. Re-probe
   before inheriting it into a brief.
4. **Never widen the class silently.** If a fix turns out to span two classes, say so and
   re-scope rather than absorbing it.

### Deployment shakedown before UAT (mandatory, OP-32)

UAT run against a build nobody has verified produces **false product bugs** — defects logged
against the product that are really environment faults. This has now cost the project twice:
the BRD-NF09 deploy shakedown (D-06) and BUG-55.

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
(CSP allowlist contract test) and **QUAL-20** (post-deploy smoke check). The worked example,
kept because it explains the shape better than the rule does: production serves the frontend
document from Express with helmet's CSP applied (`src/backend/server.ts:233`, gated on
`NODE_ENV=production`), but E2E serves it from `vite preview` on a *different port*
(`playwright.config.ts` `webServer`), so the document under test carries **no CSP header at
all**. Every `connect-src` violation is therefore unobservable in CI. The test suite was not
weak — the environment could not express the failure.

### Negative findings need two probes (mandatory)
Adopted 2026-07-28 after three confidently-stated false premises came out of one wave of
Architect work (Wave 0), each caught only because someone later re-ran the probe:

1. **"`PRAGMA foreign_keys` is off at runtime"** — false. `@libsql/client` enables FK
   enforcement by default (a libSQL divergence from stock SQLite). The design built on it
   proposed eight hand-ordered deletes duplicating the FK graph in application code.
2. **"There is no `router.delete` in `trips.ts`"** — false. `tripsRouter.delete('/:id')`
   exists at `src/backend/routes/trips.ts:429`. The probe grepped `router.delete` against a
   router actually named `tripsRouter`. The COO then propagated it into a tracker note
   without re-verifying, and it mis-sized a brief until corrected.
3. **"This environment's firewall reaches no Turso host"** — false. The ADL-33 / OP-21
   diagnostic path is allowlisted; `scripts/agent-diagnostics/turso-query.mjs` reaches
   staging fine. An open question sat recorded as unanswerable for a day.

All three share a shape: **an agent probes once, gets a negative result, and reports the
absence as established fact.** A grep that missed on a naming assumption, a probe that
covered one driver, a connection attempt that didn't use the allowlisted path. Positive
findings self-verify — the thing is there, you can see it. Negative findings don't, and
they are disproportionately load-bearing because designs get built on top of "X doesn't
exist" without anyone thinking to check again.

**The rule.** Any claim that something does not exist, is not enabled, is unreachable, or
is not implemented must either:
- be established by **two independent probes** that could fail differently — e.g. a grep
  *and* reading the file; a network probe *and* checking the allowlist config; a code
  search *and* running the thing — where "independent" means a single wrong assumption
  cannot produce both results; **or**
- be **explicitly marked unverified** in the deliverable, with the probe that was run and
  its known blind spot stated, so the next reader knows what was and wasn't checked.

Never silently upgrade a single negative probe into a stated fact. "I grepped for X and
found nothing" is a finding; "X does not exist" is a claim, and it needs the second probe.

This binds **agents writing deliverables** and **the COO propagating agent findings into
tracker notes, briefs, or plans** — failure 2 above was a COO failure, not an agent one.
Applies to every role. Briefs should not need to restate it, but a brief whose core task is
to establish an absence should call it out explicitly.

**Hook-enforced, not just written (adopted 2026-07-28, OP-26).** PO direction after the
above: local-environment quirks in this project (firewall allowlist, patched drizzle-kit,
remote libSQL transport behavior) make a single negative probe disproportionately likely to
be an environment artifact rather than a true absence — this rule needs to catch that
mechanically, not rely on an agent remembering it mid-task. A `PostToolUse` hook scans new
writes under `jobs/**` and tracker notes for absence-language patterns ("does not exist,"
"not found," "unreachable," "cannot be verified," "not implemented," "is off/disabled") and
flags any that lack an adjacent second-probe or `UNVERIFIED` marker. Starts as **warn, not
block** — regex against natural language will false-positive (e.g. an agent quoting this
very rule), and a hard block stalls an agent mid-task for no reason. Revisit block-vs-warn
once the false-positive rate from real use is known.

**The rule binds the whole team, and the hook now reaches the COO too (2026-07-28, OP-29).**
It fired again on the very next wave: brief B2 (issue #298) asserted that *"AD-09's
owner-only deactivation is not enforced on the backend today"* and bundled a "go enforce it"
task on that premise. It was false — `adminRouter.use(requireOwner)` already gated every
categories/activities route, and `security.access-matrix.test.ts` already had passing
non-owner-403 tests for exactly that. The claim came out of a planning doc and the COO
propagated it into the brief without a second probe. Only the brief's own instruction to
double-probe caught it, before any code was written.

Two things follow, both adopted on PO direction:

1. **No role is exempt — explicitly including the COO.** The rule applies to every artifact
   any role produces: deliverables, tracker notes, ADLs, plans, completion reports, **and
   COO-authored briefs**. A claim inherited from an existing project document is *not*
   pre-verified; age is not evidence. If you are about to build on "X doesn't exist," probe
   it again yourself.
2. **Enforcement had a COO-shaped hole and it has been closed.** The OP-26 hook matched only
   `Write|Edit`, but the COO does not write briefs to files — it writes them into GitHub
   issue bodies via Bash. The single highest-leverage place for a false absence was the one
   place the hook could not see. It now also scans `gh issue create` / `gh pr create` /
   `gh issue comment` bodies. The pattern set was widened at the same time: testing showed it
   missed *both* phrasings that actually caused this project's false premises — "is not
   enforced" and "there is no X" — so absence-of-enforcement language is now covered.

### No wholesale rewrites of shared records (mandatory, OP-28)

Adopted 2026-07-28 on PO direction: *"agents should never fully rewrite anything — if a full
rewrite is required there is a fundamental issue/deviation and I'd want it double checked."*

Trigger: two concurrent Frontend agents (B1 and B2) each rewrote
`jobs/frontend/context/current.txt` in full on the same day. Each rewrite was individually
reasonable and each silently dropped the other's thread record; it surfaced only as a merge
conflict the COO hand-resolved. This was a **recurrence** — the Wave 0 concurrency notes
record the same file colliding in 3 of 4 concurrent agents for the same reason, and the fix
identified then was never adopted. Twice across two waves is a pattern, not an accident.

**The rule, scoped by file class:**

- **Shared-record files — append or amend only, never wholesale replacement.** These
  accumulate entries across many agents and sessions, so replacing one destroys other
  people's records: `jobs/**` (context docs, park docs, inbox, role tech docs),
  `_project/tracker.json`, the BRD, the ADL log, the backlog clearance plan, `.planning/**`,
  and `CLAUDE.md`. Mechanically: **use `Edit`, not `Write`, on any of these that already
  exists.** Add a new dated entry; leave prior entries in place.
- **Source code — a full-file rewrite is allowed, but must be declared.** A small module
  legitimately changing in full is normal work and blocking it would be noise. But if you
  replace a source file wholesale, **say so explicitly in your completion report with the
  reason**, so the COO can double-check that it was a deliberate choice and not a deviation
  from the brief.

A blanket "never rewrite anything" was considered and deliberately narrowed to this split —
the PO invited that calibration. Generated files, stubs a brief says to replace, and small
modules changing entirely are all legitimate; the accumulating-record case is the one where
a rewrite is nearly always wrong.

**Hook-enforced (warn, not block).** `.claude/hooks/no-wholesale-rewrite.sh` fires on a
`Write` to an already-tracked file under the shared-record paths and points the agent at
`Edit`. Warn-only, following OP-26's precedent; revisit once the false-positive rate is known.

### Scanner suppressions need COO sign-off (mandatory, OP-30)

Adopted 2026-07-28. During B2, Gitleaks' `generic-api-key` rule flagged the literal string
`Categories/Activities/Countries` in a tracker note the agent had just written — a genuine
false positive. The agent resolved it by adding `.gitleaks.toml` with a narrow allowlist and
went green. The config itself is sound (`useDefault = true` keeps every standard rule active;
the allowlist is an exact-string match on that one phrase, not a path or file exemption), and
it is kept.

The precedent is the problem: an implementation agent independently weakening a **security
scanner's** configuration in order to turn a red check green is not a call an implementation
brief carries, however narrow the change.

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

### BRD gate before dispatching briefs (mandatory)
Before dispatching implementation briefs from any Architect deliverable or spec, the COO
must add any new requirement IDs to the BRD and bump the version. No backend or frontend
brief goes out without a BRD home for its requirements.

### Success criteria before dispatch (mandatory)
Every requirement or spec must state its success criteria — a measurable definition of
"done" — before the COO dispatches any implementation brief from it. A requirement with no
stated success criteria has no way to be UAT'd or closed cleanly; it just accumulates as an
ambiguous "done" in the tracker. Adopted 2026-07-07 after finding the project had no
definition-of-done doc anywhere (the `objective.txt` stub meant to hold this was never
filled in and has been deleted).

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

### Security checklist for Backend briefs (mandatory)
Every Backend brief that adds or modifies routes must include a security checklist requiring
the agent to confirm for each new route:
1. Auth middleware applied — `requireAuth` at minimum; `requireOwner` for owner-only operations
2. All repository queries that touch user data include `userId` scoping (`eq(table.userId, req.user.id)`)
3. Any new user-data table columns that reference a user have `.notNull()` on the FK
Reference: `jobs/architect/tech/OP-06-hardening-checklist.md` §2 access matrix and ADL-27.

### GitHub issue ↔ tracker cross-referencing (mandatory)
When raising a GitHub issue for something that has a tracker entry, include the tracker ID
in the issue title — e.g. `fix(BUG-15): wrap executeCarryForward in a transaction`.
The tracker entry's `notes` field must include the GitHub issue number in return.
This applies to all new issues — bugs, features, chores — anything with a tracker entry.

### Opening a PR
```bash
git checkout -b feat/your-slug
# ... do work, commit ...
git push -u origin feat/your-slug
gh pr create --title "feat: description (#N)" --body "Closes #N\nBRD §X.X TR-XX"
```

### After opening a PR
```bash
scripts/ci-wait.sh pr <PR_NUMBER>
gh run view <run-id> --log-failed   # if ci-wait.sh reports a failure
```
`scripts/ci-wait.sh` blocks until every check finishes and exits non-zero if any
failed, instead of a hand-rolled polling loop — don't write your own (see the
script's header comment for why: a past ad-hoc script broke outright from naming a
variable `status`, a read-only special variable in this environment's zsh shell).
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
- Firewall allows: GitHub, npm registry, Anthropic API only
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
