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
gh run list --repo ryanv11/travel-tracker --limit=5
gh run view <run-id> --log-failed   # if any job failed
```
- Do not consider a task complete until CI passes (all jobs green)
- Fix any CI failures before filing your completion report

### Merging a PR and closing a session (COO only)
The COO merges via the `/coo-merge-and-close` skill — squash merge, branch hygiene,
and the full session-close checklist live there. Two rules bind regardless:
- Squash merge is standard; no stale local branches after a merge session
- **Post-merge verification is mandatory**: main's own CI must go green after every
  merge (`gh run list --branch main`) — a green PR does not guarantee a green main
  (BUG-24). Red main is fixed immediately, never left unowned.

### Recording decisions (ADL entries, BRD bumps)
Load the `/record-decision` skill before editing the ADL log, a standalone ADL file,
or the BRD — numbering, supersession stamps, open-question closure, and the
three-places BRD version bump live there.

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

## COO session startup (mandatory)
Run `/coo-startup` at the start of every COO session before doing anything else.

UAT is a mandatory gate for phase completion — no phase closes without a PO PASS verdict.
Screenshots are stored in `jobs/PO/screenshots/`.

## Key files
See [CODEBASE.md](./CODEBASE.md) for the full repository map. Essential references:
- `_project/tracker.json` — Feature/bug tracker (COO-maintained)
- `_project/travel-tracker-BRD.md` — Business requirements document (v2.7)
- `src/backend/db/schema.ts` — Drizzle schema (single source of truth)
- `patches/drizzle-kit+0.31.9.patch` — drizzle-kit SQLite bug fixes (patch-package)
