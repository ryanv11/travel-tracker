TO: COO
FROM: ARCHITECT
DATE: 2026-03-21 20:00
RE: ADL-22 filed — Playwright E2E infrastructure decision

---

## Status: COMPLETE — awaiting COO approval before QA dispatch

ADL-22 has been appended to `jobs/architect/tech/20260307-architecture-decisions-log.md`.
A `playwright.config.ts` skeleton has been committed to the workspace root.

---

## Decision summary

**Adopt Playwright. Chromium-only, headless. Option B (bake browsers into Dockerfile).**

The firewall constraint is resolved by installing Playwright's Chromium binary
during the Docker image build (before the firewall runs at postStartCommand). This
gives exact version matching between `@playwright/test` and the browser binary,
with no runtime CDN dependency.

---

## Critical sync contract

The `PLAYWRIGHT_VERSION` ARG in `.devcontainer/Dockerfile` MUST always match the
`@playwright/test` version in `package.json`. When QA bumps the Playwright version,
they must update the ARG and trigger a container rebuild. Document this in the QA
brief.

---

## What needs to happen before QA can start

### 1. Dockerfile update (combines ADL-21 + ADL-22 changes)

Two changes to `.devcontainer/Dockerfile`:

```dockerfile
# Change line 1 (ADL-21):
FROM node:22          # was: FROM node:20

# Add after the USER root block, before final USER node (ADL-22):
ARG PLAYWRIGHT_VERSION=1.52.0
RUN npx --yes @playwright/test@${PLAYWRIGHT_VERSION} install --with-deps chromium
```

Recommend these two changes land in a single container rebuild to avoid doing it
twice. Whoever handles the ADL-21 CI migration should also do this Dockerfile update.

### 2. .env.local

Add `BYPASS_AUTH=true` if not already present (required for E2E backend requests).

### 3. .gitignore additions (QA to handle)

```
e2e.db
playwright-report/
test-results/
```

---

## Database strategy summary

- Isolated file: `e2e.db` (never touches `dev.db`)
- Schema bootstrap: `SQLITE_PATH=./e2e.db npm run db:migrate` runs automatically
  as the first step of `npm run test:e2e`
- Seeding: tests create data via API calls in test setup. QA should build typed
  factory helpers in `src/e2e/helpers/`
- Cleanup: `npm run test:e2e:clean` deletes `e2e.db`. Manual invocation only —
  data persists after a run for failure triage

---

## npm scripts to add to package.json (QA brief)

```json
"test:e2e":       "SQLITE_PATH=./e2e.db npm run db:migrate && playwright test",
"test:e2e:clean": "rm -f ./e2e.db"
```

---

## playwright.config.ts

Skeleton committed at `/workspace/playwright.config.ts`. Key settings:
- `testDir: 'src/e2e'`
- `workers: 1` (sequential — shared DB)
- `retries: 0` (determinism required)
- `timeout: 30_000`
- `webServer` starts backend (port 3001, SQLITE_PATH=./e2e.db, BYPASS_AUTH=true)
  and frontend (port 5173) before tests run

---

## Future CI path

When ready: add an `e2e` job in `ci.yml` gated on `test:backend` + `test:frontend`
passing. No `playwright install` step needed in CI — browsers are in the image.

---

## Brief disposition

Original brief moved to `jobs/architect/inbox/read/`.
