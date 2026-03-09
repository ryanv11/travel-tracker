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
npm run type:check             # TypeScript type check (frontend)
```

## Pre-push checklist (mandatory)
Before every `git push`, run all four checks and iterate fixes until they pass:
```bash
npm run type:check
npm run test:backend
npm run test:frontend
```
Contract tests require a live backend — only run them if the backend is running locally.

**Known intentional failures — do NOT fix these, do NOT block on them:**
- `BUG-10 canary` in `common.test.ts` — intentionally failing until Backend delivers their fix.
  Any other failure in these suites must be fixed before pushing.

**Blocked-by-another-team exception:**
If a test failure is caused by a missing schema column, API field, or other cross-team
dependency that cannot be resolved without another team's work, document the blocker
clearly in your commit message and push. Do not hold a push indefinitely for another team.

## Git workflow
- Commit directly to `main` (pre-production — branching strategy to be adopted at prod deploy)
- After every `git push`, check CI results:
```bash
gh run list --repo ryanv11/travel-tracker --limit=5
gh run view <run-id> --log-failed   # if any job failed
```
- Do not consider a task complete until CI passes (all jobs green)
- Fix any CI failures before moving on

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

## Key files
- `src/backend/server.ts` — Express app entry point
- `src/backend/db/schema.ts` — Drizzle schema
- `src/frontend/main.tsx` — React entry point
- `drizzle.config.ts` — DB config
- `.github/workflows/` — CI/CD pipelines
