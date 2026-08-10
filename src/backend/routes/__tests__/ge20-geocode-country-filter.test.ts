/**
 * GE-20 (BUG-87) — ATDD RED bar for the trip-country-scoped picker's
 * geocode-discovery half: GET /api/geocode?q=...&country_codes=...
 *
 * Design: jobs/architect/tech/ADL-54-trip-country-picker-filter.md (D1/D2/D3).
 * Fresh-eyes review: jobs/architect/tech/20260808-ADL54-fresh-eyes-review.md
 * (F1 — the empty-set footgun; P2 — Nominatim's real multi-code comma-list
 * behaviour is UNVERIFIED from this environment, see the mock-fidelity note
 * below).
 * BRD: GE-20 (approved v3.21).
 *
 * MOCK BOUNDARY: mocks `nominatimSearch` at the SERVICE boundary (matching
 * the existing, accepted pattern in geocode.test.ts / bug76-geocode-
 * contract.test.ts — NOT the `fetch` boundary; bug76-geocode-e2e.test.ts
 * already owns the real-fetch/real-parse path and this file has no reason
 * to duplicate it).
 *
 * MOCK-FIDELITY (QUAL-22, fresh-eyes-flagged): the geocode ROUTE (geocode.ts)
 * does no country filtering itself — it only forwards `countrycodes` to
 * nominatimSearch and returns whatever comes back. The pre-existing double in
 * geocode.test.ts (BUG-79) is a dumb capture-and-return stub: it records the
 * params it was called with but returns a FIXED candidate list regardless of
 * `countrycodes` — faithful enough for BUG-79 (which only asserts on
 * `limit`), but a double that ignores `countrycodes` here would make every
 * outcome-based assertion below (tests 3/4/6) pass VACUOUSLY: the response
 * would be "correct" only because the double never modelled filtering, not
 * because the route correctly wired the param through. So THIS file's double
 * is deliberately smarter: it holds a small candidate POOL (three countries'
 * worth of "Newport", one lone "Berlin") and applies `countrycodes` as an
 * allow-list filter against it, exactly mirroring Nominatim's documented
 * `countrycodes` narrowing behaviour (comma-separated ISO codes, case-
 * insensitive). It still captures the raw call params too, so test 3 can
 * assert on the CLIENT ARGS directly, not just the filtered outcome.
 *
 * HONEST LIMIT (carried from the fresh-eyes review's P2, non-blocking): this
 * models what Nominatim's docs say `countrycodes` does — it is NOT a live
 * probe of the real service (hermetic by design). The live multi-country
 * behaviour was verified by a COO probe 2026-08-08 (`countrycodes=gb,fr`
 * unions GB+FR and excludes the rest). It proves
 * the ROUTE wires `country_codes` -> `countrycodes` correctly and reacts
 * correctly to a filtered/unfiltered client response; it cannot prove
 * Nominatim itself honours a multi-code comma list. The fresh-eyes review's
 * recommendation (an early real multi-country geocode check against staging)
 * is carried forward in this thread's completion report, not answered here.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockUserId = 'ge20-geocode-user-0000-0000-000000000000';

let capturedParams: Record<string, string> | undefined;

/** A tiny fixture pool: three countries' "Newport" plus one lone "Berlin". */
const POOL: Array<{ name: string; countryCode: string }> = [
  { name: 'Newport', countryCode: 'GB' },
  { name: 'Newport', countryCode: 'FR' },
  { name: 'Newport', countryCode: 'US' },
  { name: 'Berlin', countryCode: 'DE' },
];

function toCandidate(p: { name: string; countryCode: string }) {
  return {
    displayName: `${p.name}, ${p.countryCode}`,
    name: p.name,
    latitude: 1,
    longitude: 1,
    countryCode: p.countryCode,
    regionIso: null,
  };
}

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (
    req: import('express').Request,
    _res: import('express').Response,
    next: import('express').NextFunction,
  ) => {
    (req as import('express').Request & { user?: unknown }).user = {
      id: mockUserId,
      clerkId: 'clerk_ge20_geocode',
      email: 'ge20-geocode@example.com',
      isOwner: 0,
    };
    next();
  },
}));

// Fidelity-extended double (see file header) — applies `countrycodes` as a
// real allow-list filter against POOL, matching Nominatim's documented
// behaviour, instead of ignoring the param the way the BUG-79 double does.
vi.mock('../../services/nominatim-client.js', () => ({
  nominatimSearch: vi.fn(async (params: Record<string, string>) => {
    capturedParams = params;
    const q = (params.q ?? '').toLowerCase();
    let matches = POOL.filter((c) => c.name.toLowerCase().includes(q));
    if (params.countrycodes) {
      const allowed = new Set(
        params.countrycodes
          .split(',')
          .map((c) => c.trim().toLowerCase())
          .filter(Boolean),
      );
      matches = matches.filter((c) => allowed.has(c.countryCode.toLowerCase()));
    }
    return { status: 'ok', candidates: matches.map(toCandidate), truncated: false };
  }),
}));

const { default: app } = await import('../../server-test-app.js');
const supertest = (await import('supertest')).default;

describe('GE-20 — GET /api/geocode country_codes hard filter (discovery lookup)', () => {
  beforeEach(() => {
    capturedParams = undefined;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // --------------------------------------------------------------
  // Test 3 — the nominatim-client receives countrycodes=gb,fr, asserted on
  // the CLIENT ARGS (not just the response). Also proves the multi-country
  // UNION at the geocode endpoint (GE-20 criterion #2 applies to BOTH
  // lookups, not just the DB search) — GB+FR come back, US does not.
  // RED on main: geocode.ts today never reads req.query.country_codes, so
  // capturedParams.countrycodes stays undefined and all 3 Newports return.
  // --------------------------------------------------------------
  it('country_codes=GB,FR is forwarded to nominatimSearch as countrycodes=gb,fr, and the response is the GB+FR union (no US)', async () => {
    const res = await supertest(app)
      .get('/api/geocode')
      .query({ q: 'Newport', country_codes: 'GB,FR' });

    expect(res.status).toBe(200);
    expect(capturedParams).toBeDefined();
    expect(capturedParams?.countrycodes).toBe('gb,fr');

    expect(res.body.candidates).toHaveLength(2);
    const countries = res.body.candidates
      .map((c: { country_code: string }) => c.country_code)
      .sort();
    expect(countries).toEqual(['FR', 'GB']);
  });

  // --------------------------------------------------------------
  // Test 4 (geocode half) — F1: present-but-EMPTY country_codes must SHOW
  // ALL (no countrycodes forwarded at all), NOT an empty/degenerate
  // request. Distinct from the absent-param case (test 5).
  //
  // NOT RED on main — passes today vacuously (geocode.ts never reads
  // country_codes at all yet, so capturedParams.countrycodes is undefined
  // regardless of what's sent). Kept for the same reason as its cities-
  // file twin: it is the one case that catches an implementer who
  // forwards `countrycodes = country_codes` unconditionally instead of
  // branching on a non-empty set — that naive version would forward
  // `countrycodes=` (empty string) to nominatimSearch, which this double
  // (and real Nominatim) would treat as "match no country", silently
  // inverting the SHOW-ALL ruling with tests 3/5/6 unaffected.
  // --------------------------------------------------------------
  it('GUARD (passes today, vacuously) — country_codes="" (present, empty) forwards NO countrycodes param and returns every Newport unfiltered; pins the F1 footgun on the geocode path', async () => {
    const res = await supertest(app).get('/api/geocode?q=Newport&country_codes=');

    expect(res.status).toBe(200);
    expect(capturedParams?.countrycodes).toBeUndefined();
    expect(res.body.candidates).toHaveLength(3);
  });

  // --------------------------------------------------------------
  // Test 5 (geocode half) — absent country_codes: unconstrained DISCOVERY
  // path unchanged. REGRESSION GUARD — already true on main.
  // --------------------------------------------------------------
  it('REGRESSION GUARD — no country_codes param at all leaves the discovery lookup unconstrained (already true on main)', async () => {
    const res = await supertest(app).get('/api/geocode').query({ q: 'Newport' });

    expect(res.status).toBe(200);
    expect(capturedParams?.countrycodes).toBeUndefined();
    expect(res.body.candidates).toHaveLength(3);
  });

  // --------------------------------------------------------------
  // Test 6 (geocode half) — off-country: a name whose only real match
  // (Berlin, DE) is outside the declared set (GB) returns an empty
  // candidate list from the API. RED on main: today's unfiltered call
  // returns the DE candidate regardless of country_codes.
  // --------------------------------------------------------------
  it('a name whose only match is outside the declared set returns candidates:[] (RED on main: unfiltered today returns the DE Berlin candidate)', async () => {
    const res = await supertest(app)
      .get('/api/geocode')
      .query({ q: 'Berlin', country_codes: 'GB' });

    expect(res.status).toBe(200);
    expect(res.body.candidates).toEqual([]);
  });
});
