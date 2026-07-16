/**
 * Playwright E2E Configuration — Travel Tracker
 *
 * ADL-22: E2E testing infrastructure decision (2026-03-21)
 *
 * Usage:
 *   npm run test:e2e        — migrate e2e.db then run all tests
 *   npm run test:e2e:clean  — delete e2e.db (force fresh state on next run)
 *
 * Prerequisites (QA to complete):
 *   npm install -D @playwright/test@1.58.2
 *   Add to package.json scripts:
 *     "test:e2e":       "SQLITE_PATH=./e2e.db npm run db:migrate && playwright test"
 *     "test:e2e:clean": "rm -f ./e2e.db"
 *   Add to .gitignore:
 *     e2e.db
 *
 * Dockerfile dependency (ADL-22):
 *   The PLAYWRIGHT_VERSION ARG in .devcontainer/Dockerfile MUST match
 *   the @playwright/test version in package.json at all times.
 *   After bumping @playwright/test here, update the ARG and rebuild the container.
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './src/e2e',

  // Each test file gets 30s (45s in CI — 2 vCPU runners are inherently slower than the
  // local devcontainer even against the built app; see OP-11 webServer comment below for
  // the actual fix, this is a modest safety margin on top of it, not a substitute for it).
  timeout: process.env.CI ? 45_000 : 30_000,

  // Tests must be deterministic. Fix flakiness at the source, don't retry it away.
  retries: 0,

  // Sequential execution: tests share one e2e.db — parallelism causes race conditions.
  workers: 1,

  // Capture traces on first retry (useful when debugging after a run).
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Playwright uses the baked-in browser binary (ADL-22 Option B).
        // No executablePath override needed — playwright install --with-deps
        // was run at Dockerfile build time and placed the binary in the
        // standard Playwright cache location.
      },
    },
  ],

  // Playwright starts both servers before tests run and tears them down after.
  // reuseExistingServer: false ensures a clean server on every test:e2e invocation.
  //
  // OP-11: in CI, both servers run their production-shaped path (non-watch backend,
  // built + `vite preview` frontend) instead of the dev servers used locally. GitHub
  // Actions' ubuntu-latest runners (2 vCPU) turned out too slow for Vite's dev server —
  // its on-demand per-route transform under cold CPU contention pushed test actions past
  // Playwright's 30s default timeout (30/36 specs failed, ~8.5min run, first-navigation
  // tests failing at exactly 30.1s). `vite preview` serves pre-built static assets, so
  // there's no cold-transform cost — this removes the actual bottleneck rather than just
  // raising timeouts. Locally (already fast and proven stable) the dev servers are kept
  // for iteration speed; see vite.config.ts `preview` block for the proxy config
  // `vite preview` needs (it does not inherit `server.proxy`).
  webServer: [
    {
      // Backend — Express on port 3001
      // SQLITE_PATH: isolated e2e database (db:migrate runs before playwright starts)
      // BYPASS_AUTH: skips Clerk JWT verification for all API requests
      // OWNER_CLERK_ID: makes the bypass test user the owner (ADL-27) — owner-gated
      // routes (admin, cities POST, shading config) 403 without it
      // npm run start (non-watch) — no fs-watcher overhead; matches the contract-tests
      // CI job's convention. `dev:api`'s watch mode buys nothing for a one-shot test run.
      command:
        'SQLITE_PATH=file:./e2e.db BYPASS_AUTH=true OWNER_CLERK_ID=test_clerk_id npm run start',
      url: 'http://localhost:3001/api/trips',
      reuseExistingServer: false,
      timeout: 30_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      // Frontend — port 5173.
      // VITE_BYPASS_AUTH: skips Clerk auth gate so E2E tests can access the app
      // unauthenticated. Must be set at BUILD time in CI (Vite statically replaces
      // import.meta.env.VITE_* at build time), not just at serve time.
      // VITE_API_BASE_URL: src/frontend/utils/apiClient.ts prefixes every fetch() with
      // this — it has no fallback, so an unset value bakes literal "undefined" into
      // every API URL in the built bundle. Locally this is always set via .env.local
      // (which Vite auto-loads independently of the backend's own dotenv calls), but
      // .env.local doesn't exist in CI, so it must be set explicitly here for the build.
      command: process.env.CI
        ? 'VITE_BYPASS_AUTH=true VITE_API_BASE_URL=http://localhost:3001 npm run build && npx vite preview --port 5173 --strictPort'
        : 'VITE_BYPASS_AUTH=true npm run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: false,
      // Build adds real wall time on top of server startup — generous in CI only.
      timeout: process.env.CI ? 90_000 : 30_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],

  // Output directory for test artifacts (traces, screenshots).
  // Add 'playwright-report/' and 'test-results/' to .gitignore.
  reporter: [['html', { open: 'never' }], ['list']],
  outputDir: 'test-results/',
});
