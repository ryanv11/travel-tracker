/**
 * Post-deploy shakedown — Playwright config — Travel Tracker (QUAL-20)
 *
 * This is deliberately a SEPARATE config from playwright.config.ts, not a project inside it.
 * The two suites test different things against different topologies and must never be
 * confused with each other:
 *
 *   playwright.config.ts        — pre-merge E2E. Runs against a LOCAL build (vite preview +
 *                                  a fresh sqlite e2e.db), BYPASS_AUTH=true, proves product
 *                                  BEHAVIOUR against source-controlled code. See QUAL-18 for
 *                                  the CSP blind spot this topology has (no webServer here
 *                                  fixes that — this config doesn't serve anything at all).
 *
 *   playwright.shakedown.config.ts (this file) — post-deploy. Runs against the ALREADY
 *                                  DEPLOYED staging URL, no BYPASS_AUTH (there is no bypass
 *                                  on a hosted environment — src/backend/middleware/auth.ts's
 *                                  guard is fail-closed there), no webServer block at all
 *                                  because there is nothing local to start. Proves the
 *                                  DEPLOYMENT is intact — same build reachable, same CSP
 *                                  applied, no 5xx on the anonymous surface — not product
 *                                  behaviour. See jobs/qa/tech/20260804-post-deploy-shakedown.md
 *                                  for what this suite does and does not cover, and why.
 *
 * Usage:
 *   npm run shakedown:staging                              # defaults to staging
 *   SHAKEDOWN_BASE_URL=<url> npm run shakedown:staging      # override (e.g. a preview env)
 */

import { defineConfig } from '@playwright/test';

const DEFAULT_STAGING_URL = 'https://travel-tracker-staging.up.railway.app';

export default defineConfig({
  testDir: './src/e2e-shakedown',

  // One run, no retries baked into the runner — retry semantics for transient platform
  // errors (ENV-02's single-replica edge dial-timeouts) are handled EXPLICITLY inside the
  // checks themselves, so the report can say "cleared on retry, environment-transient"
  // rather than Playwright silently re-running the whole test and reporting a bare pass.
  retries: 0,
  workers: 1,
  timeout: 60_000,

  use: {
    baseURL: process.env.SHAKEDOWN_BASE_URL || DEFAULT_STAGING_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    // A named UA so this is identifiable in Railway's http logs as the shakedown, not an
    // anonymous crawler — same courtesy this project already extends to Nominatim (ADL-49 §4.1).
    userAgent: 'TravelTrackerShakedown/1.0 (+https://github.com/ryanv11/travel-tracker)',
  },

  // No webServer block — deliberately. The whole point is testing something already
  // running elsewhere; starting a local server here would defeat it.

  reporter: [['list'], ['json', { outputFile: 'shakedown-results.json' }]],
  outputDir: 'shakedown-results/',
});
