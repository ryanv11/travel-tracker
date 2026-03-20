TO: QA
FROM: COO
DATE: 2026-03-21 23:00
RE: Playwright E2E suite — initial implementation (ADL-22)

⚠️  DEPENDENCY: This brief is blocked on the Backend ADL-21/ADL-22 infrastructure
PR merging first (`chore/adl21-adl22-node22-playwright`). Do not start until COO
confirms that PR is merged and container has been rebuilt.

---

## Background

ADL-22 approved Playwright for E2E testing. Infrastructure (Chromium in Dockerfile,
config, scripts) is handled by the Backend infra PR. Your job is to write the test
suite itself.

Branch: `feat/playwright-e2e-suite` (branch off main after infra PR is merged)

---

## What already exists (from Architect)

`/workspace/playwright.config.ts` — skeleton config committed to workspace root.
Key settings:
- `testDir: 'src/e2e'`
- `workers: 1` (sequential — shared DB)
- `retries: 0` (determinism required)
- `timeout: 30_000`
- `webServer` block starts backend (port 3001, `SQLITE_PATH=./e2e.db`, `BYPASS_AUTH=true`)
  and frontend (port 5173)

---

## Database strategy

- Isolated DB: `e2e.db` (never touches `dev.db`)
- Bootstrap: `npm run test:e2e` runs `db:migrate` automatically before tests
- Seeding: tests create data via API calls in `beforeEach`/`beforeAll` setup
- Cleanup: truncate/recreate data in test teardown; `npm run test:e2e:clean` deletes
  `e2e.db` entirely (manual)

---

## Directory structure

```
src/e2e/
  helpers/
    factories.ts     # typed helper functions to create trips, places, items via API
    auth.ts          # BYPASS_AUTH helpers (user header injection if needed)
  trips.spec.ts      # trip list + CRUD flows
  map.spec.ts        # map shading (smoke test)
```

---

## Scope — initial suite (MVP)

Focus on the highest-value happy paths only. Do not attempt to cover every UI
interaction — that comes in a later pass.

### trips.spec.ts

1. **Trip list renders** — navigate to `/trips`, assert at least the left panel and
   "My Trips" heading are visible
2. **Create trip** — POST via API in setup, reload page, assert trip appears in list
3. **Search** — create 2 trips, type in search, assert only matching trip visible
4. **Status filter** — create trips in different statuses, click a status chip,
   assert only correct trips shown
5. **Trip detail** — click a trip in list, assert right panel shows trip name
6. **Delete trip** — select a trip, click delete, confirm, assert trip removed from list

### map.spec.ts

1. **Map loads** — navigate to `/map`, assert map container renders without console errors
   (smoke test only — no assertion on specific shading)

---

## Factory helpers (src/e2e/helpers/factories.ts)

Build typed helpers that call the API directly (not via UI) for test setup:

```ts
export async function createTrip(request: APIRequestContext, overrides?: Partial<TripFormData>): Promise<TripSummary>
export async function deleteAllTrips(request: APIRequestContext): Promise<void>
```

Use Playwright's `request` fixture for API calls. BYPASS_AUTH means no auth header
is needed — the backend accepts all requests as test-user-00000000-0000-0000-0000-000000000000.

---

## Running locally

```bash
npm run test:e2e          # runs full suite
npm run test:e2e:clean    # wipe e2e.db between runs if needed
```

Both dev servers must NOT be running separately — the `webServer` block in
`playwright.config.ts` starts them automatically.

---

## Pre-push checklist

```bash
npm run type:check
npm run test:backend
npm run test:frontend
npm run test:e2e    # must pass before pushing
```

---

## PR

```bash
gh pr create \
  --title "feat: initial Playwright E2E suite — trip list, CRUD, map smoke" \
  --body "Initial E2E suite using ADL-22 Playwright infrastructure.

Covers:
- Trip list renders, search, status filter
- Trip create + detail + delete (happy path)
- Map smoke test

Factory helpers for API-driven test setup in src/e2e/helpers/."
```
