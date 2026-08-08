/**
 * BUG-81 (P2) — structured state/country/county NAMES on GET /api/geocode
 * candidates, end-to-end. BRD GE-16.
 *
 * Backend-only scope: this proves the response CONTRACT carries the names
 * Nominatim's `address` object supplies (`address.state`, `address.country`,
 * `address.county`) so the frontend can render "City, State, Country" rows
 * without parsing `display_name`. Label composition, the same-state
 * collision-county rule, and the picker scroll cap are a FRONTEND follow-up
 * — not exercised here.
 *
 * MOCK-FIDELITY (QUAL-22): follows the same pattern as
 * bug76-geocode-e2e.test.ts — only `global.fetch` is stubbed, with the exact
 * captured `format=json&addressdetails=1` fixture bodies committed at
 * src/backend/services/__tests__/fixtures/nominatim/bug76/*.json. The route,
 * the real nominatimSearch, and the real parseCandidate all run unmocked, so
 * a broken field mapping anywhere in that chain fails this test — a
 * service-boundary mock (vi.mock('.../nominatim-client.js')) could pass
 * vacuously by handing the route pre-shaped candidates that were never
 * actually produced from raw Nominatim JSON.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetChokepointForTests } from '../../services/nominatim-client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, '../../services/__tests__/fixtures/nominatim/bug76');

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(path.join(FIXTURE_DIR, name), 'utf-8'));
}

const mockUserId = 'geocode-bug81-user-0000-0000-000000000000';

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (
    req: import('express').Request,
    _res: import('express').Response,
    next: import('express').NextFunction,
  ) => {
    (req as import('express').Request & { user?: unknown }).user = {
      id: mockUserId,
      clerkId: 'clerk_geocode_bug81',
      email: 'geocode-bug81@example.com',
      isOwner: 0,
    };
    next();
  },
}));

const { default: app } = await import('../../server-test-app.js');
const supertest = (await import('supertest')).default;

function stubFetch(body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => body,
    }),
  );
}

describe('GET /api/geocode — BUG-81 structured state/country/county names', () => {
  beforeEach(() => {
    __resetChokepointForTests();
    vi.stubEnv('GEOCODING_ENABLED', 'true');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('Denver CO candidate carries state="Colorado", country="United States"', async () => {
    stubFetch(loadFixture('denver_us.json'));

    const res = await supertest(app).get('/api/geocode?q=denver').expect(200);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(res.body.candidates.length).toBeGreaterThan(0);
    const denverCo = res.body.candidates.find(
      (c: { state?: string | null }) => c.state === 'Colorado',
    );
    expect(denverCo).toBeDefined();
    expect(denverCo.country).toBe('United States');
    // Denver, CO's own address block carries no `county` key (consolidated
    // city-county) — confirms the field is real fixture data, not a
    // hardcoded stand-in.
    expect(denverCo.county).toBeNull();
  });

  it('a same-state-name duplicate (Denver, Iowa) carries county for disambiguation', async () => {
    stubFetch(loadFixture('denver_us.json'));

    const res = await supertest(app).get('/api/geocode?q=denver').expect(200);

    const denverIa = res.body.candidates.find((c: { state?: string | null }) => c.state === 'Iowa');
    expect(denverIa).toBeDefined();
    expect(denverIa.country).toBe('United States');
    expect(denverIa.county).toBe('Bremer County');
  });

  it('Springfield, Illinois candidate carries state/country/county names', async () => {
    stubFetch(loadFixture('springfield_us.json'));

    const res = await supertest(app).get('/api/geocode?q=springfield&country_code=us').expect(200);

    expect(res.body.candidates.length).toBeGreaterThan(0);
    const springfieldIl = res.body.candidates.find(
      (c: { state?: string | null }) => c.state === 'Illinois',
    );
    expect(springfieldIl).toBeDefined();
    expect(springfieldIl.country).toBe('United States');
    expect(springfieldIl.county).toBe('Sangamon County');
  });

  it('existing fields (name/display_name/country_code/region_iso) are untouched by the additive names', async () => {
    stubFetch(loadFixture('denver_us.json'));

    const res = await supertest(app).get('/api/geocode?q=denver').expect(200);

    const denverCo = res.body.candidates.find(
      (c: { state?: string | null }) => c.state === 'Colorado',
    );
    expect(denverCo.name).toBe('Denver');
    expect(denverCo.display_name).toBe('Denver, Colorado, United States');
    expect(denverCo.country_code).toBe('US');
    expect(denverCo.region_iso).toBe('US-CO');
  });
});
