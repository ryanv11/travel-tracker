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
 *   npm install -D @playwright/test@1.52.0
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

  // Each test file gets 30s. Increase for slow CI environments if needed.
  timeout: 30_000,

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
  webServer: [
    {
      // Backend — Express on port 3001
      // SQLITE_PATH: isolated e2e database (db:migrate runs before playwright starts)
      // BYPASS_AUTH: skips Clerk JWT verification for all API requests
      command:
        'SQLITE_PATH=file:./e2e.db BYPASS_AUTH=true npm run dev:api',
      url: 'http://localhost:3001/api/trips',
      reuseExistingServer: false,
      timeout: 30_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      // Frontend — Vite dev server on port 5173
      command: 'npm run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: false,
      timeout: 30_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],

  // Output directory for test artifacts (traces, screenshots).
  // Add 'playwright-report/' and 'test-results/' to .gitignore.
  reporter: [['html', { open: 'never' }], ['list']],
  outputDir: 'test-results/',
});
