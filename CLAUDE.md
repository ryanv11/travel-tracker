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

## Depwire (codebase intelligence MCP)
Depwire is configured as an MCP server (`.mcp.json`) and runs automatically in Claude Code sessions.
Installed globally: `depwire-cli`. Tools available via `mcp__depwire__*`.

**Use it for:**
- `impact_analysis` / `get_dependencies` / `get_dependents` — cross-file import chain tracking.
  Reliable and accurate. Primary use case: ADL-18 repository layer work — enumerate which route
  functions call `getDb` directly and must be migrated.
- `get_file_context` — quick view of what a file imports and what imports it.
- `get_architecture_summary` — hub files and layer breakdown are accurate for orientation.

**Do not use it for:**
- Drizzle schema symbol tracking — `schema.ts` has 57 symbols but only 1 connection reported.
  All `db.select().from(trips)` usage is invisible to tree-sitter. Never trust impact results
  for schema table variables.
- `import type` tracking — TypeScript type-only imports are not followed. `src/frontend/types/api.ts`
  is flagged as an orphan despite being used everywhere. Orphan file lists will have false positives.
- `depwire docs` — crashes generating DEAD_CODE.md; skip entirely.
- Health score "Orphans & Dead Code" dimension — 86.5% dead symbols is a false positive.
  All other health dimensions (coupling, cohesion, circular deps, depth) are usable.
- Intra-file call graph — only tracks cross-file imports, not function calls within the same file.

## Key files
- `src/backend/server.ts` — Express app entry point
- `src/backend/db/schema.ts` — Drizzle schema
- `src/frontend/main.tsx` — React entry point
- `drizzle.config.ts` — DB config
- `.github/workflows/` — CI/CD pipelines
- `patches/drizzle-kit+0.31.9.patch` — drizzle-kit SQLite bug fixes (patch-package)
