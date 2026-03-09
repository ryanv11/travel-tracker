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
npm run test:contract          # Contract tests (Vitest)
npm run type:check             # TypeScript type check (frontend)
```
Always run the relevant test suite before pushing. All tests must pass.

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
