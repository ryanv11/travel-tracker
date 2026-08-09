/**
 * Route integration tests for GET /api/geocode — BUG-79 (GitHub #379).
 *
 * PO UAT finding: typing "springfield" (no country context yet — the
 * "discovery" lookup AddPlaceFlow.tsx runs before country/region are known)
 * resolved to Virginia with no ambiguity signal, unlike "newport" in a UK
 * context, which already narrows to England/Wales with a "multiple matches"
 * hint. Root cause (confirmed by reading the code, not inherited from the
 * brief without re-checking): the discovery call requested a fixed limit=10
 * from Nominatim with no country constraint, so a globally-ambiguous name's
 * 10 slots could be spread across countries other than the one meant,
 * collapsing the same-country region set to a false single survivor —
 * indistinguishable from a genuinely unambiguous city (Denver).
 *
 * This file covers the two mechanism changes made in geocode.ts and
 * nominatim-client.ts:
 *   1. The discovery call (no country_code) now requests a higher limit than
 *      a country-constrained call — more same-country candidates for the
 *      frontend's existing D14 narrowing (AddPlaceFlow.tsx, unchanged here)
 *      to find.
 *   2. A `truncated` flag is now threaded through from the raw (pre-filter)
 *      Nominatim response count, so the frontend can tell "one region" from
 *      "one region we can see" instead of the two being permanently
 *      indistinguishable once `.filter()` discarded the raw count.
 *
 * What this file does NOT and cannot prove (see the brief/completion report):
 * whether Nominatim's real response for "springfield" actually contains
 * multiple US regions within the raised limit — these tests are hermetic by
 * design (they assert the request/response plumbing this fix controls, not
 * live Nominatim output).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockUserId = 'geocode-user-0000-0000-0000-000000000000';
let capturedParams: Record<string, string> | undefined;
let nextResult: unknown = { status: 'ok', candidates: [], truncated: false };

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (
    req: import('express').Request,
    _res: import('express').Response,
    next: import('express').NextFunction,
  ) => {
    (req as import('express').Request & { user?: unknown }).user = {
      id: mockUserId,
      clerkId: 'clerk_geocode',
      email: 'geocode@example.com',
      isOwner: 0,
    };
    next();
  },
}));

vi.mock('../../services/nominatim-client.js', () => ({
  nominatimSearch: vi.fn(async (params: Record<string, string>) => {
    capturedParams = params;
    return nextResult;
  }),
}));

const { default: app } = await import('../../server-test-app.js');
const supertest = (await import('supertest')).default;

function candidate(overrides: {
  name?: string;
  countryCode?: string | null;
  regionIso?: string | null;
}) {
  return {
    displayName: overrides.name ?? 'Testville',
    name: overrides.name ?? 'Testville',
    latitude: 1,
    longitude: 1,
    countryCode: overrides.countryCode ?? 'US',
    regionIso: overrides.regionIso ?? null,
  };
}

describe('GET /api/geocode — BUG-79 discovery limit + truncation signal', () => {
  beforeEach(() => {
    capturedParams = undefined;
    nextResult = { status: 'ok', candidates: [], truncated: false };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('requests a HIGHER limit for the unconstrained discovery call (no country_code) than before', async () => {
    await supertest(app).get('/api/geocode?q=springfield').expect(200);

    expect(capturedParams).toBeDefined();
    expect(capturedParams?.countrycodes).toBeUndefined();
    // Was a fixed '10' before this fix — must now be strictly greater, not a
    // specific hardcoded number, since the exact value chosen is an
    // implementation detail (see geocode.ts's doc comment for the rationale
    // and the chosen value).
    expect(Number(capturedParams?.limit)).toBeGreaterThan(10);
  });

  it('keeps the original, narrower limit for a country-constrained call (unaffected by this fix)', async () => {
    await supertest(app).get('/api/geocode?q=newport&country_code=gb').expect(200);

    expect(capturedParams?.countrycodes).toBe('gb');
    expect(capturedParams?.limit).toBe('10');
  });

  it('marks the response truncated:true when nominatimSearch reports truncated:true (Springfield-shaped: raw response hit the requested limit)', async () => {
    nextResult = {
      status: 'ok',
      candidates: [
        candidate({ name: 'Springfield', countryCode: 'US', regionIso: 'US-IL' }),
        candidate({ name: 'Springfield', countryCode: 'US', regionIso: 'US-MO' }),
      ],
      truncated: true,
    };

    const res = await supertest(app).get('/api/geocode?q=springfield').expect(200);

    expect(res.body.truncated).toBe(true);
    // The ambiguity signal itself is untouched by truncation — both regions
    // still come through for the frontend's existing D14 narrowing.
    expect(res.body.candidates).toHaveLength(2);
  });

  it('marks the response truncated:false when nominatimSearch reports truncated:false (Newport-shaped: complete result set)', async () => {
    nextResult = {
      status: 'ok',
      candidates: [
        candidate({ name: 'Newport', countryCode: 'GB', regionIso: 'GB-ENG' }),
        candidate({ name: 'Newport', countryCode: 'GB', regionIso: 'GB-WLS' }),
      ],
      truncated: false,
    };

    const res = await supertest(app).get('/api/geocode?q=newport&country_code=gb').expect(200);

    expect(res.body.truncated).toBe(false);
  });

  it('defaults truncated to false when the chokepoint result omits the field entirely (backward compatibility with the pre-BUG-79 shape)', async () => {
    nextResult = { status: 'ok', candidates: [candidate({ name: 'Denver', regionIso: 'US-CO' })] };

    const res = await supertest(app).get('/api/geocode?q=denver').expect(200);

    expect(res.body.truncated).toBe(false);
  });

  it('reports truncated:false on a non-ok chokepoint result (error/disabled) — nothing to be truncated, no candidates either', async () => {
    nextResult = { status: 'error' };

    const res = await supertest(app).get('/api/geocode?q=anything').expect(200);

    expect(res.body.truncated).toBe(false);
    expect(res.body.candidates).toEqual([]);
  });
});
