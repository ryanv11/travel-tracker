/**
 * BUG-76 (P1) — AC-2: end-to-end route test for the exact PO symptom.
 * Design doc: jobs/architect/tech/20260807-BUG76-accept-rule-design.md §7.1.
 *
 * "Through GET /api/geocode?q=denver, the response country_code==='US' and
 * region_iso==='US-CO' — country+state auto-populate."
 *
 * Deliberately does NOT `vi.mock('../../services/nominatim-client.js')` —
 * unlike bug76-geocode-contract.test.ts (BUG-74 contract) and the
 * pre-existing geocode.test.ts (BUG-79), which both stub the service
 * boundary. Here the REAL nominatimSearch, REAL accept-rule filter, and REAL
 * parseCandidate run; only `global.fetch` is stubbed, returning the exact
 * captured `denver_us.json` fixture body. This is what makes the test
 * genuinely end-to-end rather than re-mocking the exact seam the fix lives
 * behind — a route-level test that mocked nominatimSearch's return value
 * could not tell a correctly-wired route from one wired to a broken
 * accept-rule, since the candidates would already be pre-filtered by the
 * mock.
 *
 * No fake timers needed: `__resetChokepointForTests()` in `beforeEach` zeros
 * `lastRequestAt`, so the chokepoint's first request in each test never hits
 * the 1100ms inter-request delay (`Date.now() - 0` always exceeds
 * REQUEST_DELAY_MS) — real timers, no risk of interaction between fake
 * timers and supertest's real socket I/O (untested combination in this
 * codebase; avoided rather than risked).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetChokepointForTests } from '../../services/nominatim-client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DENVER_FIXTURE = path.join(
  __dirname,
  '../../services/__tests__/fixtures/nominatim/bug76/denver_us.json',
);

const mockUserId = 'geocode-e2e-user-0000-0000-0000-000000000000';

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (
    req: import('express').Request,
    _res: import('express').Response,
    next: import('express').NextFunction,
  ) => {
    (req as import('express').Request & { user?: unknown }).user = {
      id: mockUserId,
      clerkId: 'clerk_geocode_e2e',
      email: 'geocode-e2e@example.com',
      isOwner: 0,
    };
    next();
  },
}));

const { default: app } = await import('../../server-test-app.js');
const supertest = (await import('supertest')).default;

describe('GET /api/geocode?q=denver — AC-2 end-to-end (route + real accept-rule)', () => {
  beforeEach(() => {
    __resetChokepointForTests();
    vi.stubEnv('GEOCODING_ENABLED', 'true');

    const denverBody = JSON.parse(readFileSync(DENVER_FIXTURE, 'utf-8'));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => denverBody,
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('AC-2 — auto-populates country_code=US, region_iso=US-CO (today: both null, real Nominatim query returns 0 admitted candidates)', async () => {
    const res = await supertest(app).get('/api/geocode?q=denver').expect(200);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(res.body.country_code).toBe('US');
    expect(res.body.region_iso).toBe('US-CO');
    expect(res.body.candidates.length).toBeGreaterThan(0);
  });
});
