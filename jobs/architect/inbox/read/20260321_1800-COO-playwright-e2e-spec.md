TO: ARCHITECT
FROM: COO
DATE: 2026-03-21 18:00
RE: ADL required — Playwright E2E testing infrastructure

---

## Context

QA currently has no automated frontend testing capability. The only live frontend
testing is PO manual UAT, which is a bottleneck. We want to add Playwright E2E tests
so QA can run a headless browser suite autonomously as a pre-UAT gate.

QA already has a 48-step UAT script (jobs/qa/history/qa-report-2026-03-20.md,
Part 6) that maps almost 1:1 to Playwright scenarios.

---

## Decisions already made (COO + PO)

- **Execution model:** On-demand only (`npm run test:e2e`). Not in CI for now.
- **Data strategy:** Tests create their own data. No reliance on dev.db state.
  Each test (or suite) seeds what it needs and cleans up after itself.
- **Auth:** BYPASS_AUTH=true for E2E test execution.
- **Phasing:** QA writes critical-path flows first to iron out the process,
  then expands to full 48-step coverage.
- **Ownership:** QA agent owns and maintains the test suite.

---

## What we need from Architect

### 1. ADL — Playwright adoption decision

Write an ADL entry covering:
- Playwright vs alternatives (brief — Playwright is the clear choice, but document it)
- Which browser: Chromium only for now (headless, not cross-browser)
- Container compatibility approach (see constraint below — this is the main question)
- Database strategy for E2E

### 2. Container constraint — this is the critical blocker

The devcontainer has an iptables firewall (`init-firewall.sh`) that restricts
outbound traffic to GitHub, npm registry, and Anthropic API only.

Playwright's `npx playwright install chromium` downloads browser binaries from
`playwright.azureedge.net` (Microsoft CDN) at runtime. This will be blocked by
the firewall.

**Possible approaches — Architect to evaluate and recommend one:**

A. **System Chromium via apt** — install `chromium` in the Dockerfile at build
   time (before firewall runs). Configure Playwright via
   `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` and point to system binary.
   Pros: no CDN dependency, clean. Cons: version mismatch risk between system
   Chromium and Playwright's expected version.

B. **Bake Playwright browsers into Dockerfile** — run `npx playwright install
   --with-deps chromium` during the Docker image build (before firewall).
   Pros: exact version match, reproducible. Cons: larger image, requires
   rebuilding container when Playwright version bumps.

C. **Add Playwright CDN to firewall allowlist** — add `playwright.azureedge.net`
   (and any other required domains) to `init-firewall.sh`.
   Pros: no Dockerfile changes, normal `npm ci` + `playwright install` flow.
   Cons: opens an additional outbound domain; download happens at runtime.

D. **Other approach** if Architect identifies a better option.

Architect: please also check what system libraries Playwright needs
(it typically requires several Chromium deps like `libatk`, `libgbm`, etc.)
and whether the current Debian-based `node:22` image has them or needs
`--with-deps` to install them.

### 3. Database strategy

Specify how E2E tests should manage database state:
- Separate SQLite file (e.g. `file:./e2e.db`) via a dedicated env var
  (e.g. `SQLITE_PATH_E2E`)?
- Or reset/reseed dev.db before each run?
- How should the backend be started in E2E mode (which env vars, which DB file)?
- Seed script approach: SQL file, Drizzle seed script, or API calls from tests?

**Cleanup policy (decided by COO + PO):**
Tests create their own data during the run. Cleanup must NOT be automatic at run
end. Data should persist after a run so failures can be traced and reproduced
before fixing. A separate explicit cleanup command (e.g. `npm run test:e2e:clean`
or a Playwright global teardown script triggered manually) is the right pattern.
The Architect should specify how this cleanup is invoked and what it does
(drop and recreate e2e.db, or delete only test-created records via a known prefix/tag).

### 4. playwright.config.ts skeleton

Provide a recommended `playwright.config.ts` covering:
- `webServer` config to auto-start backend (port 3001) and frontend (port 5173)
  before tests run, with proper startup detection
- BYPASS_AUTH=true + correct SQLITE_PATH in the webServer env
- Headless Chromium
- Test directory structure recommendation (`src/e2e/` or `tests/e2e/`)
- Any timeout / retry settings appropriate for a local dev E2E suite

### 5. npm script

Specify the `test:e2e` npm script. Should it:
- Just run `playwright test`?
- Include a DB reset/seed step first?
- Handle graceful server teardown?

### 6. Future CI consideration (non-blocking)

Note in the ADL how a CI job would be added later if we decide to run E2E on
main pushes. Don't implement it now — just document the path.

---

## Reference files

- `.devcontainer/Dockerfile` — current image (node:22 per ADL-21)
- `.devcontainer/devcontainer.json` — postCreateCommand: `npm ci`
- `.devcontainer/init-firewall.sh` — firewall rules (GitHub + npm + Anthropic only)
- `jobs/qa/history/qa-report-2026-03-20.md` Part 6 — the 48-step UAT script QA
  will convert into Playwright tests (provides scope context)
- `.env.local` — current env vars including SQLITE_PATH and BYPASS_AUTH

---

## Expected output

1. ADL entry appended to `jobs/architect/tech/20260307-architecture-decisions-log.md`
2. Recommended `playwright.config.ts` (can be a draft/skeleton for QA to build on)
3. Specified Dockerfile and/or devcontainer changes
4. Database strategy decision
5. Completion report to `jobs/COO/inbox/`

Once the ADL is approved by COO, QA will be dispatched to implement the test suite.
