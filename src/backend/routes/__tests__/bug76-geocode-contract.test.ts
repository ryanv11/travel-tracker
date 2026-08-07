/**
 * BUG-74 (P2, ride-along) — /api/geocode response `status` contract ATDD
 * suite (OP-35). Design doc: jobs/architect/tech/20260807-BUG76-accept-rule-design.md
 * §6, §7.5 (AC-11/AC-12/AC-13).
 *
 * RED-FIRST, PRE-IMPLEMENTATION: `geocode.ts:86` today collapses the
 * discriminated `NominatimSearchResult` union to a bare array
 * (`result.status === 'ok' ? result.candidates : []`) and never serializes
 * `status` onto the response body — `res.body.status` is `undefined` for
 * every case today. Every assertion below fails on main for that reason.
 *
 * MOCK BOUNDARY: this file mocks `nominatimSearch` at the SERVICE boundary
 * (not `fetch`), matching the existing, already-accepted pattern in
 * geocode.test.ts (BUG-79). That is deliberate, not a mock-fidelity
 * shortcut: this suite tests the ROUTE's handling of an already-typed
 * `NominatimSearchResult` discriminated union (ok/error/disabled) — it is
 * not re-testing whether raw Nominatim JSON parses into candidates (that is
 * bug76-accept-rule.test.ts's job, which DOES mock at the `fetch` boundary
 * with real captured fixtures). Stubbing the service return value here
 * cannot pass vacuously the way a hand-authored Nominatim JSON stub could:
 * the values asserted on (`status`, `candidates`) are exactly the values the
 * mock returns, and the route's serialization logic is what's under test.
 *
 * The end-to-end AC-2 (route -> real nominatimSearch -> real accept-rule ->
 * Denver auto-populate) lives in bug76-geocode-e2e.test.ts, which does NOT
 * mock nominatim-client.js, specifically so the real fetch-boundary fixture
 * flows through unmodified.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockUserId = 'geocode-bug74-user-0000-0000-000000000000';
let nextResult: unknown = { status: 'ok', candidates: [], truncated: false };

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (
    req: import('express').Request,
    _res: import('express').Response,
    next: import('express').NextFunction,
  ) => {
    (req as import('express').Request & { user?: unknown }).user = {
      id: mockUserId,
      clerkId: 'clerk_geocode_bug74',
      email: 'geocode-bug74@example.com',
      isOwner: 0,
    };
    next();
  },
}));

vi.mock('../../services/nominatim-client.js', () => ({
  nominatimSearch: vi.fn(async () => nextResult),
}));

const { default: app } = await import('../../server-test-app.js');
const supertest = (await import('supertest')).default;

describe('GET /api/geocode — BUG-74 status contract (AC-11/AC-12/AC-13)', () => {
  beforeEach(() => {
    nextResult = { status: 'ok', candidates: [], truncated: false };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // --------------------------------------------------------------
  // AC-11 — error distinct from genuine empty. Both are HTTP 200 with
  // candidates:[] today (indistinguishable) — this is the exact mechanism
  // that made BUG-76 invisible (design doc §6.1).
  // --------------------------------------------------------------
  it('AC-11a — upstream status:error is HTTP 200 with body status:"error", candidates:[]', async () => {
    nextResult = { status: 'error' };

    const res = await supertest(app).get('/api/geocode?q=denver').expect(200);

    expect(res.body.status).toBe('error');
    expect(res.body.candidates).toEqual([]);
  });

  it('AC-11b — genuine no-match is HTTP 200 with body status:"ok", candidates:[] — distinguishable from AC-11a by status ONLY', async () => {
    nextResult = { status: 'ok', candidates: [], truncated: false };

    const res = await supertest(app).get('/api/geocode?q=zzzznomatch').expect(200);

    expect(res.body.status).toBe('ok');
    expect(res.body.candidates).toEqual([]);
  });

  // --------------------------------------------------------------
  // AC-12 — disabled distinct from both ok-empty and error.
  // --------------------------------------------------------------
  it('AC-12 — GEOCODING_ENABLED=false path (status:disabled from the chokepoint) surfaces status:"disabled", not "ok"', async () => {
    nextResult = { status: 'disabled' };

    const res = await supertest(app).get('/api/geocode?q=denver').expect(200);

    expect(res.body.status).toBe('disabled');
    expect(res.body.status).not.toBe('ok');
    expect(res.body.candidates).toEqual([]);
  });

  // --------------------------------------------------------------
  // AC-13 — additive / back-compat. Not independently expressible as its
  // own red assertion pre-fix (there is no `status` field yet to be
  // backward-INcompatible with) — flagged per the brief. Operationalized two
  // ways instead: (a) the pre-existing geocode.test.ts (BUG-79) suite is
  // left completely unmodified by this brief and must keep passing, proving
  // existing consumers/fixtures that never read `status` are unaffected;
  // (b) this smoke assertion pins that the pre-existing fields survive
  // unchanged alongside the new field once it exists.
  // --------------------------------------------------------------
  it('AC-13 (smoke) — existing candidates/country_code/region_iso/truncated fields are untouched by the status addition', async () => {
    nextResult = {
      status: 'ok',
      candidates: [
        {
          displayName: 'Denver, Colorado, United States',
          name: 'Denver',
          latitude: 39.7392364,
          longitude: -104.984862,
          countryCode: 'US',
          regionIso: 'US-CO',
          osmType: 'relation',
          osmId: 1411339,
        },
      ],
      truncated: false,
    };

    const res = await supertest(app).get('/api/geocode?q=denver').expect(200);

    expect(res.body.country_code).toBe('US');
    expect(res.body.region_iso).toBe('US-CO');
    expect(res.body.truncated).toBe(false);
    expect(res.body.candidates).toHaveLength(1);
    expect(res.body.candidates[0].name).toBe('Denver');
    // The field this AC is actually about — currently absent on main.
    expect(res.body.status).toBe('ok');
  });
});
