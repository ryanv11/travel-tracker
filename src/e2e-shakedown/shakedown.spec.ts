/**
 * Post-deploy shakedown — Travel Tracker (QUAL-20 / OP-32)
 *
 * WHAT THIS FILE IS. The mechanical half of OP-32's "deployment shakedown before UAT" rule:
 * confirms the DEPLOYED build behaves like main, before a PO UAT round finds otherwise. It
 * runs against the real staging URL (playwright.shakedown.config.ts's baseURL), never a local
 * server. See jobs/qa/tech/20260804-post-deploy-shakedown.md for the full design, the
 * per-check "what this proves / does not prove" table (reproduced in each test's comment
 * below so it travels with the code), the trigger recommendation, and — the part that matters
 * most given why QUAL-20 exists — an explicit, honest list of what this suite does NOT cover
 * and why, rather than silently omitting it.
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT DO. It does not sign in. Staging runs with no
 * BYPASS_AUTH (src/backend/middleware/auth.ts's guard is fail-closed on a hosted
 * environment — there is no bypass to reach for), and this project has no accepted
 * mechanism to mint an automated Clerk session for CI (ADL-33 §4 declined Clerk API
 * access; no read-only or testing-token credential exists for it). So every check here is
 * necessarily on the ANONYMOUS surface — the sign-in page and its own asset/CSP/health
 * chain. The checks the QUAL-20 brief's evidence most wants (denver auto-fills its country,
 * springfield/newport narrow, plockton resolves, the map paints, admin regions return data)
 * all require an authenticated session and are NOT built here — see the tech doc's "What
 * this does not cover" section for the reasoning and what would unblock it.
 *
 * NEVER add BYPASS_AUTH, a hand-rolled auth cookie, or a mocked Clerk session to make an
 * authenticated check pass here. That would be indistinguishable from the QUAL-22 failure
 * mode this whole ADL-49/QUAL-20 thread exists to avoid — a check green for the wrong
 * reason, on an environment it never actually touched.
 */

import { type CDPSession, expect, type Page, test } from '@playwright/test';

/** A response is treated as a genuine 5xx signal only above this. 3xx/4xx are not this
 * check's concern (4xx on `/` would be a real product surprise, but this suite's job is the
 * environment/deployment layer — see the tech doc for why 4xx isn't gated here). */
const SERVER_ERROR_FLOOR = 500;

type CapturedResponse = { url: string; status: number };

/**
 * A CSP violation as the DOM reports it — the structured form, with the directive and the
 * blocked URI as FIELDS rather than buried in prose.
 *
 * WHY THIS TYPE EXISTS AT ALL (QUAL-54). The console check failed on every one of its six
 * runs between 2026-08-04 and 2026-08-26 and nobody could tell what it was complaining
 * about, because the only thing `page.on('console')` delivered was this, in full:
 *
 *     " Note that 'script-src' was not explicitly set, so 'default-src' is used as a fallback."
 *
 * A dangling subordinate clause with no subject. That is not truncation and it is not a
 * Playwright bug — for a blocked `eval()` Chromium genuinely never emits the first
 * sentence naming what was blocked. `msg.args()` cannot recover it either: Playwright
 * hardcodes an empty args array for this message class (`crPage.js:687`), so the tracker's
 * original "capture all args" prescription is inert. The DOM `securitypolicyviolation`
 * event is a different channel entirely and carries the facts as structured fields.
 */
type CspViolation = {
  violatedDirective: string;
  effectiveDirective: string;
  blockedURI: string;
  sourceFile: string;
  lineNumber: number;
  documentURI: string;
};

/** A raw Chromium log entry, read over CDP — see `attachCdpLogReader` for why. */
type RawLogEntry = { source: string; level: string; url: string; text: string };

/** Where a captured error came from, relative to the origin under test. */
type Attribution = 'ours' | 'third-party' | 'unattributable';

/**
 * Attributes a captured error to whoever's CODE INITIATED THE BLOCKED ACTION.
 *
 * THIS IS THE SCOPING DECISION AND IT DESERVES SCRUTINY — narrowing what a check fails on
 * is the same move as suppressing a scanner, and it can hide a real defect just as easily.
 * What is being drawn here is a line between "our first-party bundle did something the
 * deployed environment refuses" (a defect we own, must fail) and "a third-party SDK we
 * load did something the deployed environment refuses" (noise we cannot fix in this repo,
 * already tracked, must not fail the deployment gate forever).
 *
 * WHAT THIS DELIBERATELY LETS THROUGH — the honest cost, stated rather than buried:
 * a violation caused by third-party SDK code no longer fails this check. Concretely that
 * is the BUG-68 class (clerk.browser.js's telemetry beacon hitting our connect-src). Those
 * are still CAPTURED, PRINTED and ATTACHED as annotations on every run — they are demoted
 * from fatal to visible, not silenced. If one ever needs to be fatal, it is one line here.
 *
 * FAIL CLOSED ON DOUBT. Anything with no attributable source URL counts as OURS, because
 * an unidentifiable error is exactly the kind this check exists to surface — treating
 * "don't know" as "not our problem" is how a real defect gets filtered away.
 *
 * BLOB URLs ARE A KNOWN AMBIGUITY. A `blob:` worker inherits the creating page's origin,
 * so a worker spun up by a third-party SDK (Clerk does exactly this for token handling —
 * see server.ts's worker-src comment) reports as `blob:<our-origin>/…` and is therefore
 * attributed to US. That is the conservative direction: it can produce a failure that
 * needs a human to reclassify, never a silent pass.
 */
function attribute(rawUrl: string | undefined, ourOrigin: string): Attribution {
  if (!rawUrl) return 'unattributable';
  // blob:http://host/uuid — the inner URL carries the origin that created the blob.
  const url = rawUrl.startsWith('blob:') ? rawUrl.slice('blob:'.length) : rawUrl;
  try {
    return new URL(url).origin === ourOrigin ? 'ours' : 'third-party';
  } catch {
    return 'unattributable';
  }
}

/** True when an error must fail the check rather than merely be reported. */
function isFatal(attribution: Attribution): boolean {
  return attribution !== 'third-party';
}

/** Renders a violation as a single line with the directive and blocked URI as fields. */
function formatViolation(v: CspViolation): string {
  return (
    `CSP ${v.effectiveDirective || v.violatedDirective} blocked ${v.blockedURI || '<unnamed>'}` +
    ` — from ${v.sourceFile || '<no source file>'}:${v.lineNumber}`
  );
}

/**
 * Registers a document-level `securitypolicyviolation` listener before any page script
 * runs.
 *
 * `addInitScript` (rather than an `evaluate` after load) is load-bearing: the violations
 * worth catching happen while the page's own bundles are still executing, so a listener
 * attached after `goto` resolves would miss them entirely.
 *
 * The script is idempotent because `loadAndObserve` may be called more than once on the
 * same page (the 5xx check retries), and `addInitScript` accumulates — without the guard,
 * a second registration would double every recorded violation on the next navigation.
 */
async function attachCspViolationListener(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __cspViolations?: CspViolation[] };
    if (w.__cspViolations) return;
    w.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      w.__cspViolations?.push({
        violatedDirective: e.violatedDirective,
        effectiveDirective: e.effectiveDirective,
        blockedURI: e.blockedURI,
        sourceFile: e.sourceFile,
        lineNumber: e.lineNumber,
        documentURI: e.documentURI,
      });
    });
  });
}

/**
 * Opens a raw CDP `Log` stream — the ONLY channel that sees worker-sourced violations.
 *
 * Established by local reproduction, not assumed: a `blob:` worker that violates the
 * inherited policy produces entries on this stream and on NEITHER of the other two.
 * Playwright drops worker-sourced entries before they reach `page.on('console')`
 * (`crPage.js:681`), and the document's `securitypolicyviolation` listener never sees them
 * because a worker has no document. In a three-violation worker reproduction the counts
 * were: CDP 3, `page.on('console')` 0, DOM event 0.
 *
 * Chromium-only. Both Playwright suites in this repo are Chromium-only, so this is not a
 * portability compromise — but if the CDP session cannot be opened the caller records that
 * fact rather than quietly losing a channel.
 */
async function attachCdpLogReader(
  page: Page,
  sink: RawLogEntry[],
): Promise<{ session: CDPSession } | { error: string }> {
  try {
    const session = await page.context().newCDPSession(page);
    await session.send('Log.enable');
    session.on('Log.entryAdded', ({ entry }) => {
      sink.push({
        source: entry.source ?? '',
        level: entry.level ?? '',
        url: entry.url ?? '',
        text: entry.text ?? '',
      });
    });
    return { session };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

/** Per-page instrumentation, attached once and reused across repeat navigations. */
type Instrumentation = { rawLogs: RawLogEntry[]; cdpError?: string };
const instrumented = new WeakMap<Page, Instrumentation>();

async function instrument(page: Page): Promise<Instrumentation> {
  const existing = instrumented.get(page);
  if (existing) return existing;

  const rawLogs: RawLogEntry[] = [];
  await attachCspViolationListener(page);
  const cdp = await attachCdpLogReader(page, rawLogs);
  const state: Instrumentation = {
    rawLogs,
    cdpError: 'error' in cdp ? cdp.error : undefined,
  };
  instrumented.set(page, state);
  return state;
}

/** Navigates to `path` and collects every console message, uncaught page error, CSP
 * violation, raw Chromium log entry, and response status seen during that single
 * navigation + a short settle window. Shared by every check below so "what counts as an
 * error" is defined exactly once. */
async function loadAndObserve(page: Page, path: string, ourOrigin: string) {
  const consoleErrors: { text: string; url: string; attribution: Attribution }[] = [];
  const pageErrors: string[] = [];
  const responses: CapturedResponse[] = [];

  const state = await instrument(page);
  // A fresh navigation must not inherit the previous attempt's worker logs (the 5xx check
  // navigates twice); the DOM violation array resets by itself since navigation replaces
  // `window`.
  state.rawLogs.length = 0;

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    // `msg.location()` is retained — for the dangling-clause message it is the ONLY thing
    // identifying the offending script (the text names nothing at all). `msg.args()` is
    // deliberately NOT read: Playwright hardcodes it empty for this class.
    const url = msg.location().url;
    consoleErrors.push({ text: msg.text(), url, attribution: attribute(url, ourOrigin) });
  });
  page.on('pageerror', (err) => {
    pageErrors.push(err.message);
  });
  page.on('response', (res) => {
    responses.push({ url: res.url(), status: res.status() });
  });

  const navResponse = await page.goto(path, { waitUntil: 'networkidle', timeout: 30_000 });

  // Give any deferred/lazy work (chunked JS, a font, a late Clerk SDK call) a moment to
  // finish and report — networkidle from Playwright fires on the request graph, not on
  // "everything the page will ever do", and a console error logged 200ms after networkidle
  // would otherwise be silently missed.
  await page.waitForTimeout(1500);

  // Read the structured violations the in-page listener collected. Wrapped because a
  // navigation that failed outright leaves the page on about:blank, where evaluate throws
  // — losing the whole check to an incidental error would be worse than an empty list,
  // and the navigation failure is reported by the load check regardless.
  let cspViolations: CspViolation[] = [];
  try {
    cspViolations = await page.evaluate(
      () => (window as unknown as { __cspViolations?: CspViolation[] }).__cspViolations ?? [],
    );
  } catch {
    cspViolations = [];
  }

  return {
    navResponse,
    consoleErrors,
    pageErrors,
    responses,
    cspViolations,
    rawLogs: [...state.rawLogs],
    cdpError: state.cdpError,
  };
}

/**
 * CHECK — App loads and returns a real document.
 *
 * PROVES: DNS/TLS/Railway-edge/Express chain is intact end to end for an anonymous GET of
 * the SPA document — the same request class BUG-59's CORS misconfiguration and the
 * BRD-NF09 shakedown's five sequential blockers all broke in different ways.
 *
 * DOES NOT PROVE: that the app is usable. This is the sign-in screen, not the product —
 * reaching product surfaces needs auth this suite does not have (see file header).
 */
test('the app loads and returns a document', async ({ page, baseURL }) => {
  const { navResponse } = await loadAndObserve(page, '/', new URL(baseURL ?? '/').origin);
  expect(
    navResponse,
    'navigation produced no response at all (DNS/TLS/connection failure)',
  ).not.toBeNull();
  expect(navResponse?.status(), `document request returned ${navResponse?.status()}`).toBeLessThan(
    400,
  );
  await expect(page).toHaveTitle(/.+/);
});

/**
 * CHECK — Browser console is clean on the anonymous landing surface.
 *
 * PROVES: no CSP violation, no uncaught JS exception, no failed-resource console error is
 * reported by a REAL browser hitting the REAL deployed origin with helmet's CSP actually
 * applied. This is precisely the observation QUAL-18 documents as structurally impossible
 * in the pre-merge E2E suite (vite preview serves the document with no CSP header at all)
 * — this check is the reason this file exists as a separate topology rather than a fourth
 * project bolted onto playwright.config.ts.
 *
 * DOES NOT PROVE: the console stays clean past sign-in. BUG-55's connect-src violation and
 * BUG-68's clerk-telemetry.com violation both fired from authenticated, in-product actions
 * (adding a place) that this suite cannot reach. QUAL-19's static allowlist test is the
 * complementary check for that class of defect from source instead of from a browser.
 *
 * QUAL-54 — WHAT CHANGED HERE AND WHY. This check failed on all six of its runs and never
 * once said what was wrong; its entire output was a subjectless clause about a fallback
 * directive. Two things were wrong with it. It read only ONE of the three channels a
 * Chromium CSP violation is reported on, and that channel is the one that carries the
 * least information. And it failed on ANY console error from ANY origin, so a third-party
 * SDK's own noise held the deployment gate red permanently — which is how a check stops
 * being read at all. It now reads all three channels, reports the directive and blocked
 * URI as structured fields, and fails only on errors attributable to our own code (see
 * `attribute` for exactly what that lets through, and what it costs).
 */
test('browser console is free of errors on load', async ({ page, baseURL }, testInfo) => {
  const ourOrigin = new URL(baseURL ?? '/').origin;
  const { consoleErrors, pageErrors, cspViolations, rawLogs, cdpError } = await loadAndObserve(
    page,
    '/',
    ourOrigin,
  );

  // ---- Channel 1: console errors, attributed by the script that logged them ----
  const fatalConsole = consoleErrors.filter((e) => isFatal(e.attribution));
  const noisyConsole = consoleErrors.filter((e) => !isFatal(e.attribution));

  // ---- Channel 2: DOM securitypolicyviolation — the channel that NAMES the fault ----
  const violations = cspViolations.map((v) => ({
    v,
    attribution: attribute(v.sourceFile, ourOrigin),
  }));
  const fatalViolations = violations.filter((x) => isFatal(x.attribution));
  const noisyViolations = violations.filter((x) => !isFatal(x.attribution));

  // ---- Channel 3: raw CDP log — worker-sourced entries, invisible to channels 1 and 2 ----
  // Only `worker` entries are taken from this stream. Everything else it carries is
  // already delivered by channel 1, and double-counting would make the failure output
  // harder to read for no added detection.
  const workerLogs = rawLogs.filter((r) => r.source === 'worker' && r.level === 'error');
  const fatalWorker = workerLogs.filter((r) => isFatal(attribute(r.url, ourOrigin)));
  const noisyWorker = workerLogs.filter((r) => !isFatal(attribute(r.url, ourOrigin)));

  // Third-party noise is demoted to an annotation, never dropped silently — the whole
  // reason this check went unread is that its output stopped being informative.
  const noise = [
    ...noisyConsole.map((e) => `console (${e.url}): ${e.text}`),
    ...noisyViolations.map((x) => `csp: ${formatViolation(x.v)}`),
    ...noisyWorker.map((r) => `worker (${r.url}): ${r.text}`),
  ];
  if (noise.length > 0) {
    const summary = `Third-party console noise (NOT failing this check, recorded for visibility):\n${noise.join('\n')}`;
    console.info(`[shakedown] ${summary}`);
    testInfo.annotations.push({ type: 'third-party-noise', description: summary });
  }

  // A lost channel is reported rather than silently absent: if the CDP session could not
  // be opened, worker-sourced violations are unobservable for this run and a green result
  // means less than it appears to.
  if (cdpError) {
    testInfo.annotations.push({
      type: 'reduced-coverage',
      description:
        `CDP Log channel unavailable (${cdpError}) — worker-sourced CSP violations were ` +
        'NOT observable on this run. A pass here does not cover that class.',
    });
  }

  const failures = [
    ...fatalConsole.map(
      (e) => `console error (from ${e.url || 'unattributable source'}): ${e.text}`,
    ),
    ...fatalViolations.map((x) => formatViolation(x.v)),
    ...fatalWorker.map((r) => `worker error (from ${r.url || 'unattributable source'}): ${r.text}`),
    ...pageErrors.map((m) => `uncaught page error: ${m}`),
  ];

  expect(
    failures,
    `${failures.length} error(s) attributable to ${ourOrigin} on the anonymous landing surface:\n` +
      `${failures.map((f) => `  - ${f}`).join('\n')}\n\n` +
      'Each CSP line names the violated directive and the blocked URI as fields — if one ' +
      'says `blocked eval`, a script is calling eval() under a policy without ' +
      "'unsafe-eval'; if it names a URL, that origin is missing from the directive shown " +
      "(fix it in helmet's config in src/backend/server.ts, and note QUAL-19's unit test " +
      'should have caught it pre-deploy if the origin is referenced in first-party source).',
  ).toEqual([]);
});

/**
 * CHECK — Nothing in the page's network lifecycle 5xxs, with one environment-aware retry.
 *
 * PROVES: the static asset pipeline and Express aren't 500ing (or worse) for an anonymous
 * request, either on the first attempt or on a same-minute retry.
 *
 * DOES NOT PROVE: absence of 5xx on authenticated-only routes (/api/geocode, /api/cities,
 * /api/admin/*) — unreachable without a session (see file header).
 *
 * WHY THE RETRY, AND WHY IT IS NOT A SILENT PASS: ENV-02 recorded Railway edge "connection
 * dial timeout" 502s against this exact single-replica staging service, self-resolving on
 * refresh, with app-side causes (crash, OOM, CPU) ruled out by direct log/metric evidence.
 * A shakedown that fails outright on that signature would be manufacturing a false product
 * bug — exactly what OP-32 exists to prevent. So: a 5xx on the first load is retried once
 * after a short delay; if it clears, the check PASSES but is annotated as
 * ENVIRONMENT-TRANSIENT (ENV-02 class) rather than reported as a silent, unqualified green.
 * If it persists across the retry, that is no longer consistent with ENV-02's own evidence
 * (a per-connection edge timeout, not a sustained condition) and the check FAILS as a
 * probable product/deployment defect.
 */
test('no 5xx in the page network lifecycle (ENV-02-aware)', async ({ page, baseURL }, testInfo) => {
  const ourOrigin = new URL(baseURL ?? '/').origin;
  const attempt = async () => {
    const { responses } = await loadAndObserve(page, '/', ourOrigin);
    return responses.filter((r) => r.status >= SERVER_ERROR_FLOOR);
  };

  const first = await attempt();
  if (first.length === 0) return;

  testInfo.annotations.push({
    type: 'note',
    description: `5xx on first attempt (${first.map((r) => `${r.status} ${r.url}`).join(', ')}) — retrying once per ENV-02's known transient-edge-timeout signature before treating as a failure.`,
  });
  await page.waitForTimeout(5_000);
  const second = await attempt();

  if (second.length === 0) {
    testInfo.annotations.push({
      type: 'note',
      description:
        'PASSED ON RETRY — classify as ENVIRONMENT-TRANSIENT (ENV-02 class: Railway edge dial-timeout against a single-replica service), not a product defect. Re-run if this repeats across consecutive shakedowns; a persistent pattern is evidence ENV-02 needs the replica-count fix, not a new investigation.',
    });
    return;
  }

  throw new Error(
    `5xx persisted across a retry — NOT the ENV-02 transient signature (that clears on refresh). ` +
      `Treat as a probable product/deployment defect, not a platform blip: ${second
        .map((r) => `${r.status} ${r.url}`)
        .join(', ')}`,
  );
});

/**
 * CHECK — The deployed document is actually served with a Content-Security-Policy header.
 *
 * PROVES: this deployed process is running the production code path (NODE_ENV=production,
 * helmet's CSP middleware mounted) — i.e. the topology QUAL-18 says the pre-merge E2E suite
 * can never observe (vite preview, no CSP header, two origins) is genuinely different from
 * what's live. A missing header here would mean either the build isn't what we think it is,
 * or helmet's gate condition (server.ts:233's NODE_ENV/dist check) isn't true in production
 * the way it's assumed to be.
 *
 * DOES NOT PROVE: that the CSP allowlist is CORRECT or complete — only that one exists.
 * Whether every origin the frontend fetches is actually in it is QUAL-19's job (a static
 * source-level test), deliberately not duplicated here so the two checks don't drift apart
 * pretending to test the same thing two different ways.
 */
test('the deployed document carries a Content-Security-Policy header', async ({
  request,
  baseURL,
}) => {
  const res = await request.get(baseURL ?? '/');
  const csp = res.headers()['content-security-policy'];
  expect(
    csp,
    'no content-security-policy header on the deployed document — see comment above',
  ).toBeTruthy();
});

/** Shape of /health's body since QUAL-26 — liveness plus the identity of the running build. */
type HealthBody = {
  status?: unknown;
  commit?: unknown;
  commitFull?: unknown;
  builtAt?: unknown;
};

/**
 * The commit this run expects the deployed app to be serving, or null when the run makes no
 * claim about it.
 *
 * Set by the workflow to `github.sha` — but only when the run targets the default staging
 * URL. A `base_url` override points somewhere whose build has nothing to do with the ref
 * this workflow was dispatched from, so asserting there would manufacture a false failure.
 * A local `npm run shakedown:staging` also leaves it unset: the operator's checkout is not
 * evidence of what is deployed.
 */
const EXPECTED_SHA = (process.env.SHAKEDOWN_EXPECTED_SHA ?? '').trim().toLowerCase() || null;

/**
 * CHECK — /health answers AND names the build it is serving, with backoff.
 *
 * PROVES: the Express process is up and answering its own liveness endpoint — and, since
 * QUAL-26, WHICH BUILD is answering. When the run knows the commit it expects
 * (SHAKEDOWN_EXPECTED_SHA, set by the workflow to the dispatched ref's SHA), the retry
 * window is spent waiting for the deployed SHA to MATCH rather than merely waiting for a
 * 200 — so this check now distinguishes "the new build is live" from "the previous build is
 * still serving traffic", which is exactly what it previously could not do.
 *
 * WHY THAT MATTERS MORE THAN IT SOUNDS. On 2026-08-04 Railway SKIPPED five consecutive
 * staging deploys. Nothing went red — a skipped deploy is not a failed one — and staging
 * served a build five commits stale while every PR showed green. The only thing that caught
 * it was the PO noticing a merged fix still didn't work. A SHA mismatch here is a direct,
 * mechanical detector for that entire class.
 *
 * The SHA is recorded unconditionally — logged to the run output and attached as a test
 * annotation (so it lands in shakedown-results.json and the uploaded artifact) — even when
 * there is nothing to compare it against. A shakedown that cannot say which build it tested
 * is evidence of very little, which was QUAL-20's own stated residual gap.
 *
 * DOES NOT PROVE: anything about builds when SHAKEDOWN_EXPECTED_SHA is unset (a base_url
 * override or a local run) — in that mode the SHA is reported, not verified. Nor does it
 * prove the deployed frontend ASSETS match: /health is the backend's answer, and while this
 * single-service deployment builds both from one commit, that is a property of the topology
 * rather than something this check observes.
 */
test('/health answers and reports the build SHA within the deploy-propagation window', async ({
  request,
  baseURL,
}, testInfo) => {
  const url = `${baseURL}/health`;
  const maxAttempts = 10;
  const delayMs = 6_000;
  let lastStatus: number | undefined;
  let lastBody: string | undefined;
  let lastSeenSha: string | null = null;

  /** Records the SHA in both the human-readable log and the machine-readable report. */
  const record = (message: string) => {
    console.info(`[shakedown] ${message}`);
    testInfo.annotations.push({ type: 'build', description: message });
  };

  for (let i = 0; i < maxAttempts; i++) {
    const res = await request.get(url, { failOnStatusCode: false });
    lastStatus = res.status();
    lastBody = await res.text();

    if (res.ok()) {
      let parsed: HealthBody | undefined;
      try {
        parsed = JSON.parse(lastBody) as HealthBody;
      } catch {
        parsed = undefined;
      }
      expect(parsed, `/health returned 200 but an unexpected body: ${lastBody}`).toMatchObject({
        status: 'ok',
      });

      const commitFull = typeof parsed?.commitFull === 'string' ? parsed.commitFull : null;
      const commitShort = typeof parsed?.commit === 'string' ? parsed.commit : 'unknown';
      const builtAt = typeof parsed?.builtAt === 'string' ? parsed.builtAt : 'unknown';
      lastSeenSha = commitFull;

      // No expectation to check against — report the build and stop. This is the local /
      // base_url-override mode.
      if (!EXPECTED_SHA) {
        record(
          `deployed build: ${commitShort} (full: ${commitFull ?? 'unknown'}, built: ${builtAt}) ` +
            '— NOT VERIFIED against an expected commit (SHAKEDOWN_EXPECTED_SHA unset).',
        );
        return;
      }

      if (commitFull === EXPECTED_SHA) {
        record(
          `deployed build ${commitShort} MATCHES the expected commit ` +
            `${EXPECTED_SHA.slice(0, 7)} (built: ${builtAt}).`,
        );
        return;
      }

      // Mismatch. Keep retrying — a rollout genuinely in flight will flip to the new SHA
      // inside this window, and failing on the first poll would just re-manufacture the
      // false-failure problem the original backoff existed to avoid.
      record(
        `attempt ${i + 1}/${maxAttempts}: deployed build is ${commitShort}, expected ` +
          `${EXPECTED_SHA.slice(0, 7)} — waiting for the rollout.`,
      );
    }

    if (i < maxAttempts - 1) await new Promise((r) => setTimeout(r, delayMs));
  }

  const windowSeconds = (maxAttempts * delayMs) / 1000;

  if (lastStatus !== undefined && lastStatus >= 200 && lastStatus < 300) {
    throw new Error(
      `/health is healthy but is serving the WRONG BUILD after ~${windowSeconds}s: ` +
        `deployed ${lastSeenSha ?? 'unknown'}, expected ${EXPECTED_SHA}. ` +
        'This is the QUAL-26 signal: the app is up, so this is not a rollout still in ' +
        'flight — the expected commit was most likely never deployed at all. Check ' +
        'Railway for a SKIPPED deployment (a skipped deploy never goes red, which is why ' +
        'five of them went unnoticed on 2026-08-04) before treating anything here as a ' +
        'product defect.',
    );
  }

  throw new Error(
    `/health never returned 200 after ${maxAttempts} attempts over ~${windowSeconds}s ` +
      `(last: ${lastStatus} ${lastBody})`,
  );
});
