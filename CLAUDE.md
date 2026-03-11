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

## Schema changes (Drizzle ORM)
**Never use `db:push`.** Always use the migrate workflow:
```bash
npm run db:generate   # generate a new migration SQL file
npm run db:migrate    # apply pending migrations
```
`db:push` is disabled. drizzle-kit has four SQLite bugs that cause it to loop infinitely;
they are patched via `patches/drizzle-kit+0.31.9.patch` (auto-applied on `npm install`).
See ADL-15 for full rationale.

## Key files
- `src/backend/server.ts` — Express app entry point
- `src/backend/db/schema.ts` — Drizzle schema
- `src/frontend/main.tsx` — React entry point
- `drizzle.config.ts` — DB config
- `.github/workflows/` — CI/CD pipelines
- `patches/drizzle-kit+0.31.9.patch` — drizzle-kit SQLite bug fixes (patch-package)
