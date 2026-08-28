/**
 * QUAL-19 — the CSP allowlist must cover what the frontend actually fetches.
 *
 * WHY THIS EXISTS. BUG-55 and BUG-68 were the same defect twice: the browser reached an
 * external origin that helmet's CSP did not allow, the fetch was blocked, and nothing in
 * the repo asserted the two lists agreed. Neither was caught before deploy, because the
 * only environment where the CSP is actually applied is the deployed one — the pre-merge
 * E2E suite serves the document from `vite preview` with no CSP header at all (QUAL-18).
 * This test closes that class STATICALLY instead: no network, no browser, milliseconds.
 * It is the cheap complement to the post-deploy shakedown's live console check (QUAL-54),
 * deliberately asserting from SOURCE what the shakedown can only observe from a browser.
 *
 * WHAT IT CANNOT SEE — stated plainly rather than left as a silent gap, because a
 * scanner's blind spots are exactly where the next instance of this defect will live:
 *
 *   1. THIRD-PARTY SDK EGRESS IS OUT OF SCOPE. BUG-68's blocked origin
 *      (clerk-telemetry.com) is requested by `clerk.browser.js` — a bundle we do not
 *      author and do not vendor. It appears nowhere in `src/frontend/**`, so a scan of
 *      our own source cannot see it, and no amount of improving this scanner would find
 *      it. Catching that class requires a real browser against a real CSP, which is the
 *      shakedown's job (`src/e2e-shakedown/shakedown.spec.ts`), not this test's.
 *      QUAL-19's tracker note calls for this scope decision to be stated explicitly —
 *      this comment is that statement.
 *   2. RUNTIME-DERIVED ORIGINS. Clerk's Frontend API origin is decoded at runtime from
 *      VITE_CLERK_PUBLISHABLE_KEY (src/frontend/main.tsx:23); it is never a literal in
 *      source. The backend models it symbolically as CLERK_ORIGIN. A literal scan cannot
 *      resolve it, so it is neither asserted nor assumed here.
 *   3. DYNAMICALLY ASSEMBLED URLs. An origin built by concatenation
 *      (`'https://' + host`) is invisible to a literal scan. The project has none today,
 *      and this test would not notice if one appeared.
 *
 * So: a PASS here means "no first-party literal origin is missing from the CSP". It does
 * not mean "the deployed CSP is complete". Those are different claims and the second one
 * needs a browser.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import app from '../server-test-app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const SERVER_TS = path.join(REPO_ROOT, 'src/backend/server.ts');
const SERVER_TEST_APP_TS = path.join(REPO_ROOT, 'src/backend/server-test-app.ts');
const FRONTEND_DIR = path.join(REPO_ROOT, 'src/frontend');

// ---------------------------------------------------------------------------
// Reading the CSP out of the two server files
// ---------------------------------------------------------------------------

/**
 * The two configs are read STATICALLY, from the TypeScript AST, rather than by importing
 * them. server.ts cannot be imported at all — it calls `startup()` at module scope, which
 * opens the database, seeds it and binds a port. Parsing is the only way to compare the
 * two on equal terms.
 *
 * Static parsing is normally fragile, so it is not taken on faith: the test
 * `parser agrees with the header server-test-app actually emits` below re-reads the same
 * directives from a live response through supertest and compares. If the parser ever
 * drifts from reality, that test fails rather than this file silently asserting nonsense.
 */

/** A CSP directive set, keyed by the kebab-case directive name used in the header. */
type Directives = Record<string, string[]>;

/** camelCase helmet key (`scriptSrc`) to the header's directive name (`script-src`). */
function toDirectiveName(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

/**
 * Evaluates a directive's value node to its list of source expressions.
 *
 * Handles the three shapes the two configs actually use. Anything else throws loudly —
 * a new shape must be handled deliberately, never silently mis-parsed into a passing test.
 */
function evaluateDirectiveValue(node: ts.Node, file: string): string[] {
  // ["'self'", '*.maptiler.com']
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.map((el) => {
      if (ts.isStringLiteral(el) || ts.isNoSubstitutionTemplateLiteral(el)) return el.text;
      // A bare identifier is an env-derived origin (CLERK_ORIGIN). It has no literal
      // value at parse time, so it is carried symbolically — enough to compare the two
      // files with each other, and honest about not knowing the runtime value.
      if (ts.isIdentifier(el)) return `<${el.text}>`;
      throw new Error(
        `${path.basename(file)}: unsupported CSP array element ` +
          `'${el.getText()}' (${ts.SyntaxKind[el.kind]}). Teach evaluateDirectiveValue ` +
          'about this shape rather than letting it be skipped.',
      );
    });
  }

  // CLERK_ORIGIN ? ["'self'", CLERK_ORIGIN] : ["'self'"]
  //
  // The TRUTHY branch is the one modelled, deliberately: it is the deployed
  // configuration. CLERK_ISSUER is set on staging and production (Clerk authenticates
  // there), and the falsy branch exists only for BYPASS_AUTH/CI environments that never
  // load Clerk's JS at all. Asserting against the branch nobody deploys would be
  // asserting against a policy no browser ever receives.
  if (ts.isConditionalExpression(node)) {
    return evaluateDirectiveValue(node.whenTrue, file);
  }

  throw new Error(
    `${path.basename(file)}: unsupported CSP directive value ` +
      `'${node.getText()}' (${ts.SyntaxKind[node.kind]}).`,
  );
}

/**
 * Extracts `helmet({ contentSecurityPolicy: { directives: { ... } } })` from a source
 * file, returning the directives keyed by header name.
 *
 * Throws if the block cannot be found — silence would turn "the CSP moved somewhere this
 * test cannot see" into a pass, which is the failure mode this whole file exists to
 * prevent.
 */
function extractCspDirectives(file: string): Directives {
  const text = fs.readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);

  let directivesNode: ts.ObjectLiteralExpression | undefined;

  const visit = (node: ts.Node): void => {
    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'directives' &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      directivesNode = node.initializer;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  if (!directivesNode) {
    throw new Error(
      `Could not find a helmet CSP \`directives\` object in ${path.relative(REPO_ROOT, file)}. ` +
        'If the CSP was moved or restructured, update this test deliberately — do not ' +
        'delete the assertion.',
    );
  }

  const out: Directives = {};
  for (const prop of directivesNode.properties) {
    if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) {
      throw new Error(
        `${path.basename(file)}: unsupported CSP directive entry '${prop.getText()}'.`,
      );
    }
    out[toDirectiveName(prop.name.text)] = evaluateDirectiveValue(prop.initializer, file);
  }
  return out;
}

/** Parses a raw `Content-Security-Policy` header value into the same shape. */
function parseCspHeader(header: string): Directives {
  const out: Directives = {};
  for (const part of header.split(';')) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    const [name, ...values] = tokens;
    out[name] = values;
  }
  return out;
}

const PROD_CSP = extractCspDirectives(SERVER_TS);
const TEST_APP_CSP = extractCspDirectives(SERVER_TEST_APP_TS);

// ---------------------------------------------------------------------------
// Reading the origins the frontend references
// ---------------------------------------------------------------------------

/**
 * Absolute http(s) origins appearing as literals in first-party frontend source, with the
 * CSP directive each one is governed by.
 */
type FrontendOrigin = { origin: string; directive: string; where: string };

/** Source files worth scanning. Test files are excluded — their URLs are fixtures. */
function collectFrontendFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      out.push(...collectFrontendFiles(full));
    } else if (/\.(ts|tsx|css)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Hosts that are reserved for documentation by RFC 2606 and can never be real egress.
 * Excluding them is safe by definition, not a judgement call.
 */
const RESERVED_DOC_HOSTS = /(^|\.)(example\.(com|org|net)|invalid|test|localhost)$/;

/**
 * Decides which CSP directive governs a literal, from how the line uses it.
 *
 * The classifier is deliberately small and its default is the STRICTEST USEFUL one:
 * anything not obviously an image or a script tag is treated as `connect-src`, because
 * that is the directive both real instances of this defect (BUG-55, BUG-68) violated. A
 * misclassification therefore over-asserts rather than under-asserts — it can produce a
 * failure that needs a human to reclassify, but it cannot produce a silent pass.
 */
function classifyDirective(line: string, file: string): string {
  if (file.endsWith('.css')) return 'img-src';
  if (/<script[^>]*\bsrc=/.test(line)) return 'script-src';
  if (/\b(?:src|srcSet)\s*=\s*[{"']/.test(line)) return 'img-src';
  return 'connect-src';
}

function collectFrontendOrigins(): FrontendOrigin[] {
  const found: FrontendOrigin[] = [];
  const files = [...collectFrontendFiles(FRONTEND_DIR), path.join(REPO_ROOT, 'index.html')];

  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      // A URL inside a `placeholder` attribute is example text shown to the user in an
      // empty input (TripForm's "https://…", ItemForm's "https://maps.google.com/…").
      // The app never requests it. Narrow, deliberate exclusion — not a general
      // "ignore things that look noisy" filter.
      if (/\bplaceholder\s*=/.test(line)) return;

      for (const match of line.matchAll(/https?:\/\/([a-zA-Z0-9.-]+[a-zA-Z0-9])/g)) {
        const host = match[1];
        if (RESERVED_DOC_HOSTS.test(host)) continue;
        found.push({
          origin: host,
          directive: classifyDirective(line, file),
          where: `${path.relative(REPO_ROOT, file)}:${i + 1}`,
        });
      }
    });
  }
  return found;
}

/**
 * Does a CSP source list allow `host`?
 *
 * Understands the two forms the config uses: an exact host and a single leading-label
 * wildcard (`*.maptiler.com` allows `api.maptiler.com` but not `maptiler.com`, matching
 * the CSP spec). Scheme prefixes on a source (`https://clerk.foo.dev`) are stripped
 * before comparison so the comparison is host-to-host.
 */
function cspAllows(sources: string[] | undefined, host: string): boolean {
  if (!sources) return false;
  return sources.some((raw) => {
    const source = raw.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (source.startsWith('*.')) return host.endsWith(source.slice(1)) && host !== source.slice(2);
    return source === host;
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('QUAL-19 — CSP allowlist covers first-party frontend egress', () => {
  it('parser agrees with the header server-test-app actually emits', async () => {
    // Guards the static parse above against drifting from reality. server-test-app.ts is
    // the only one of the two that can be booted in-process, so it is the only one whose
    // parsed form can be checked against a real response — but both files are parsed by
    // the same function, so validating it here validates it for server.ts too.
    //
    // NOTE FOR WHOEVER FIXES BUG-101 (verified by mutation, not predicted): this
    // comparison holds only while server-test-app.ts's directives are unconditional. If
    // the consolidation gives it server.ts's `CLERK_ORIGIN ? ... : ...` ternaries, the
    // parser will model the TRUTHY branch while this process — which has no CLERK_ISSUER
    // set — emits the FALSY one, and this test fails for a reason that has nothing to do
    // with the CSP being wrong. Either set CLERK_ISSUER for this test or compare against
    // the branch the environment actually selects. Do not delete the assertion.
    const res = await request(app).get('/health');
    const header = res.headers['content-security-policy'];
    expect(header, 'server-test-app emitted no CSP header').toBeTruthy();

    const emitted = parseCspHeader(header);
    for (const [directive, values] of Object.entries(TEST_APP_CSP)) {
      expect(
        emitted[directive],
        `parsed '${directive}' from source but the emitted header has no such directive`,
      ).toBeDefined();
      expect(
        emitted[directive],
        `parsed values for '${directive}' disagree with the header`,
      ).toEqual(values);
    }
  });

  it('every external origin the frontend references is allowed by the directive governing it', () => {
    const origins = collectFrontendOrigins();

    const violations = origins
      .filter(({ origin, directive }) => {
        // A directive with no explicit entry falls back to default-src per the CSP spec,
        // so the fallback is checked too rather than reporting a false miss.
        const explicit = PROD_CSP[directive];
        return !cspAllows(explicit ?? PROD_CSP['default-src'], origin);
      })
      .map(
        ({ origin, directive, where }) =>
          `  ${origin}\n    referenced at: ${where}\n    missing from: ${directive} ` +
          `(currently ${JSON.stringify(PROD_CSP[directive] ?? PROD_CSP['default-src'])})`,
      );

    expect(
      violations,
      `The frontend references ${violations.length} external origin(s) that helmet's CSP in ` +
        'src/backend/server.ts does not allow. In the deployed environment the browser will ' +
        'BLOCK these requests — and, as BUG-55 showed, the failure can be completely silent ' +
        `in the UI:\n${violations.join('\n')}\n` +
        'Fix by adding the origin to the named directive, or — preferred where the call is ' +
        'server-reachable — by proxying it through the backend so the browser never needs ' +
        'the allowlist entry at all (ADL-46).',
    ).toEqual([]);
  });

  it('scans a non-empty set of frontend files', () => {
    // A scanner that silently matches nothing passes every assertion above forever. This
    // is the fence against the whole test file quietly becoming a no-op if the frontend
    // moves or the glob breaks.
    expect(collectFrontendFiles(FRONTEND_DIR).length).toBeGreaterThan(20);
  });
});

describe('BUG-101 — the two CSP configs must agree', () => {
  /**
   * src/backend/server.ts and src/backend/server-test-app.ts each hand-maintain their own
   * copy of the helmet CSP. server-test-app.ts's comment claims it "re-uses the same
   * middleware and route registrations as server.ts, ensuring tests exercise exactly the
   * same request pipeline as production" — for the CSP that is not true, and every
   * backend test asserting anything about the policy is asserting about a policy no
   * browser ever receives.
   *
   * THE TEST BELOW IS THE RED BAR FOR BUG-101 and it is deliberately NOT `describe.skip`.
   * A skipped test is invisible on a green board — it reports as "passed" in every
   * summary anyone actually reads, which is how a known defect stops being known.
   * `it.fails` keeps it LIVE and named in the test output, asserts the real desired
   * condition, and inverts automatically: the moment the backend consolidation lands and
   * the two configs agree, this test goes RED and whoever fixed it must come here and
   * remove `.fails`. That is the intended handshake, not an accident.
   */
  it.fails('server.ts and server-test-app.ts emit the same CSP [BUG-101 — EXPECTED TO FAIL until consolidated]', () => {
    expect(TEST_APP_CSP).toEqual(PROD_CSP);
  });

  /**
   * The tripwire the `it.fails` above cannot be: `it.fails` only distinguishes "differs"
   * from "identical", so any NEW divergence between the two configs still passes it. This
   * pins the divergence to exactly what BUG-101 documents, so drifting further apart
   * fails immediately rather than being absorbed into an already-known failure.
   */
  it('diverges in exactly the directives BUG-101 recorded, and no others', () => {
    const names = [...new Set([...Object.keys(PROD_CSP), ...Object.keys(TEST_APP_CSP)])];
    const differing = names
      .filter((n) => JSON.stringify(PROD_CSP[n]) !== JSON.stringify(TEST_APP_CSP[n]))
      .sort();

    expect(
      differing,
      'The divergence between the two CSP configs changed. If a directive was ADDED to ' +
        'this list, the two files drifted further apart — fix that rather than updating ' +
        'this expectation. If one was REMOVED, BUG-101 is partly fixed and this list ' +
        `should be narrowed deliberately.\n  server.ts:          ${JSON.stringify(PROD_CSP)}\n` +
        `  server-test-app.ts: ${JSON.stringify(TEST_APP_CSP)}`,
    ).toEqual(['connect-src', 'img-src', 'script-src', 'worker-src']);
  });
});
