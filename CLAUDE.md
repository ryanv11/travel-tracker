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
- PR title and description must reference the GitHub issue number (`Closes #N`) and BRD section if applicable
- **COO reviews and merges PRs** — agents do not merge their own PRs

### BRD → tracker rule (mandatory)
Whenever the BRD is updated (a changelog entry is written), the COO must create tracker
entries for every new requirement ID introduced before closing the session. No BRD version
bump is complete until all new IDs have a corresponding tracker entry.

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

### Merging a PR (COO only)
```bash
gh pr merge <number> --repo ryanv11/travel-tracker --squash --delete-branch
git checkout main && git pull
git branch -D <branch-name>   # force-delete local branch (expected with squash merges)
```
- GitHub is configured to auto-delete remote branches on merge (`delete_branch_on_merge=true`)
- Squash merge is standard — one clean commit per PR on `main`
- Local branch must be manually deleted after merge — do not leave stale local branches
- Run `git branch` after every merge session to confirm no branches remain except `main`

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
- `_project/travel-tracker-BRD.md` — Business requirements document (v2.6)
- `src/backend/db/schema.ts` — Drizzle schema (single source of truth)
- `patches/drizzle-kit+0.31.9.patch` — drizzle-kit SQLite bug fixes (patch-package)
