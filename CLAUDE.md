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
Before every `git push`, run all four checks and iterate fixes until they pass:
```bash
npm run type:check:all
npm run test:backend
npm run test:frontend
```
Contract tests require a live backend — only run them if the backend is running locally.

**Blocked-by-another-team exception:**
If a test failure is caused by a missing schema column, API field, or other cross-team
dependency that cannot be resolved without another team's work, document the blocker
clearly in your commit message and push. Do not hold a push indefinitely for another team.

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

## CI pipelines (GitHub Actions)
| Workflow | Triggers | Jobs |
|----------|----------|------|
| `ci.yml` | push / PR | Type Check, Backend Tests, Frontend Tests, Contract Tests |
| `security.yml` | push / PR | Dependency Scan (npm audit), Secret Scan (Gitleaks), SAST (Semgrep) |

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

## UAT gate (mandatory)
PO (user) live testing is a **mandatory gate** for phase completion. No phase can be
formally closed as DONE without a UAT PASS verdict.

**On every COO session pickup:** read `jobs/PO/uat-log.md` and check for:
- Any session with verdict PARTIAL or FAIL → surface to user before proceeding
- Any unreviewed findings (unchecked `[ ]` items) → ask user for status before actioning
- Any findings marked "fixed myself" without a bug ID → log them formally

**Before actioning any bug fix:** if the finding came from UAT and the session verdict is
not yet PASS, check in with the user — the fix may be part of a broader flow still being tested.

Screenshots are stored in `jobs/PO/screenshots/`.

## Drift ledger

`.planning/drift-ledger.jsonl` is an append-only log maintained by hooks. It records
every file edit (tagged with `agent_type` for inline agent edits), a `subagent_stop`
marker each time an inline agent completes, an automatic `session_end` sentinel on every
session close, and a `reviewed` marker written manually by the COO after each startup audit.

**On every COO session pickup** — after the UAT check, read the ledger:
1. Find the last `reviewed` entry (or start of file if none exists yet)
2. Scan forward to the end — look for any `subagent_stop` entries
3. For each `subagent_stop`: verify the inline agent's work is documented —
   completion report written, state files updated, changes committed
4. Fix any gaps found, then write the `reviewed` sentinel:
```bash
echo "{\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"action\":\"reviewed\"}" >> .planning/drift-ledger.jsonl
```

If the ledger is clean (no `subagent_stop` entries since last `reviewed`), write the
sentinel immediately and proceed. The `session_end` sentinel is written automatically
by the SessionEnd hook — no manual step required at shutdown.

**Post-spawn verification (inline agents only):** after every inline agent completes
during a session, immediately verify before continuing: completion report written,
state files updated, changes committed. The ledger is the audit layer that catches
what this step misses — if startup reads are consistently clean, the verification
is working. Repeated gaps signal that more work should move to dedicated sessions.

## Key files
- `src/backend/server.ts` — Express app entry point
- `src/backend/db/schema.ts` — Drizzle schema
- `src/frontend/main.tsx` — React entry point
- `drizzle.config.ts` — DB config
- `.github/workflows/` — CI/CD pipelines
- `patches/drizzle-kit+0.31.9.patch` — drizzle-kit SQLite bug fixes (patch-package)
