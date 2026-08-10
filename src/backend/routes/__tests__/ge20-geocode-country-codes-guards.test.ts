/**
 * GE-20 (BUG-87) — implementation guards for GET /api/geocode?country_codes=...
 * that QA's ATDD bar (ge20-geocode-country-filter.test.ts) deliberately did
 * NOT red-test (see jobs/qa/tech/20260808-ge20-atdd-red-tests.md, "Not
 * added" section): malformed-code rejection and the ~10-code cap are
 * ADL-54 §4 IMPLEMENTATION DETAILS, not enumerated in QA's 7-item dispatch
 * list. Backend owns these tests per the dispatch brief.
 *
 * Also covers the D2 limit-tier decision: a single-country set keeps
 * CONSTRAINED_LIMIT, a multi-country set (>=2) uses DISCOVERY_LIMIT —
 * asserted via the client call args, same pattern as the existing
 * geocode.test.ts BUG-79 limit-tier tests.
 *
 * This is a NEW, backend-owned sibling file — QA's
 * ge20-geocode-country-filter.test.ts is a frozen ATDD suite and is not
 * touched here.
 *
 * Design: jobs/architect/tech/ADL-54-trip-country-picker-filter.md (D1/D2).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockUserId = 'ge20-geocode-guards-user-0000-0000-000000000000';

let capturedParams: Record<string, string> | undefined;

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (
    req: import('express').Request,
    _res: import('express').Response,
    next: import('express').NextFunction,
  ) => {
    (req as import('express').Request & { user?: unknown }).user = {
      id: mockUserId,
      clerkId: 'clerk_ge20_geocode_guards',
      email: 'ge20-geocode-guards@example.com',
      isOwner: 0,
    };
    next();
  },
}));

vi.mock('../../services/nominatim-client.js', () => ({
  nominatimSearch: vi.fn(async (params: Record<string, string>) => {
    capturedParams = params;
    return {
      status: 'ok',
      candidates: [
        {
          displayName: 'Newport, GB',
          name: 'Newport',
          latitude: 1,
          longitude: 1,
          countryCode: 'GB',
          regionIso: null,
        },
      ],
      truncated: false,
    };
  }),
}));

const { default: app } = await import('../../server-test-app.js');
const supertest = (await import('supertest')).default;

describe('GE-20 — GET /api/geocode country_codes: malformed-code and cap guards (ADL-54 §4, not in QA red bar)', () => {
  beforeEach(() => {
    capturedParams = undefined;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('rejects a 3-letter code with 400 (not ISO alpha-2 shape)', async () => {
    const res = await supertest(app)
      .get('/api/geocode')
      .query({ q: 'Newport', country_codes: 'GBR' });
    expect(res.status).toBe(400);
  });

  it('rejects a numeric code with 400', async () => {
    const res = await supertest(app)
      .get('/api/geocode')
      .query({ q: 'Newport', country_codes: '12' });
    expect(res.status).toBe(400);
  });

  it('rejects one malformed code even alongside otherwise-valid ones', async () => {
    const res = await supertest(app)
      .get('/api/geocode')
      .query({ q: 'Newport', country_codes: 'GB,XYZ' });
    expect(res.status).toBe(400);
  });

  it('ADL-54 D2: rejects a set of 11 distinct codes (over the ~10 cap) with 400', async () => {
    const codes = ['AA', 'BB', 'CC', 'DD', 'EE', 'FF', 'GG', 'HH', 'II', 'JJ', 'KK'].join(',');
    const res = await supertest(app)
      .get('/api/geocode')
      .query({ q: 'Newport', country_codes: codes });
    expect(res.status).toBe(400);
  });

  it('ADL-54 D2: accepts a set of exactly 10 distinct codes (at the cap) and forwards all 10', async () => {
    const codes = ['GB', 'BB', 'CC', 'DD', 'EE', 'FF', 'GG', 'HH', 'II', 'JJ'];
    const res = await supertest(app)
      .get('/api/geocode')
      .query({ q: 'Newport', country_codes: codes.join(',') });
    expect(res.status).toBe(200);
    expect(capturedParams?.countrycodes).toBe(codes.map((c) => c.toLowerCase()).join(','));
  });

  // ----------------------------------------------------------------
  // D2 limit tier — single-country set keeps CONSTRAINED_LIMIT (10);
  // multi-country set (>=2) uses DISCOVERY_LIMIT (40).
  // ----------------------------------------------------------------
  it('D2: a single-country country_codes set uses CONSTRAINED_LIMIT (10), same as the existing single country_code path', async () => {
    const res = await supertest(app)
      .get('/api/geocode')
      .query({ q: 'Newport', country_codes: 'GB' });
    expect(res.status).toBe(200);
    expect(capturedParams?.limit).toBe('10');
    expect(capturedParams?.countrycodes).toBe('gb');
  });

  it('D2: a multi-country country_codes set uses DISCOVERY_LIMIT (40)', async () => {
    const res = await supertest(app)
      .get('/api/geocode')
      .query({ q: 'Newport', country_codes: 'GB,FR' });
    expect(res.status).toBe(200);
    expect(capturedParams?.limit).toBe('40');
    expect(capturedParams?.countrycodes).toBe('gb,fr');
  });

  // ----------------------------------------------------------------
  // Precedence when both country_code (singular) and country_codes
  // (plural) are present — the ADL states this contract for /api/geocode
  // (D1: single wins).
  // ----------------------------------------------------------------
  it('precedence — the single country_code wins over country_codes when both are present', async () => {
    const res = await supertest(app)
      .get('/api/geocode')
      .query({ q: 'Newport', country_code: 'gb', country_codes: 'FR,US' });
    expect(res.status).toBe(200);
    expect(capturedParams?.countrycodes).toBe('gb');
    expect(capturedParams?.limit).toBe('10');
  });
});
