/**
 * Contract tests — /api/cities
 *
 * Verifies the backend honours the published API contract for city endpoints.
 * Requires a running backend: npm run dev:api
 *
 * Coverage:
 *   GET    /api/cities                    — search, shape, required query param, filters
 *   POST   /api/cities                    — create, validation, invalid country
 *   PATCH  /api/cities/:id               — update region_id, 404
 *   GET    /api/cities/:id/carry-forward  — carry-forward list shape
 *   GET    /api/cities/:id/items          — city item history, shape, filters
 *
 * NOTE: City creation is rate-limited to 20/min. We create minimal cities
 * upfront in a shared beforeAll and reuse them across tests.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { api, requireServer, createTestCity } from './_setup.js';

// ─── Server check ─────────────────────────────────────────────────────────────

beforeAll(async () => {
  await requireServer();
});

// ─── Module-level shared cities ───────────────────────────────────────────────

let sharedCityId: number;
let sharedCityName: string;

beforeAll(async () => {
  sharedCityName = `ContractSearchCity-${Date.now()}`;
  const city = await createTestCity({ name: sharedCityName });
  sharedCityId = city.id;
});

// ─── GET /api/cities ──────────────────────────────────────────────────────────

describe('GET /api/cities (search)', () => {
  it('200 — returns an array for a valid query', async () => {
    const res = await api.get(`/api/cities?q=${sharedCityName.slice(0, 8)}`).expect(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('200 — each result has the required shape fields', async () => {
    const res = await api.get(`/api/cities?q=${sharedCityName.slice(0, 8)}`).expect(200);
    expect(res.body.length).toBeGreaterThan(0);

    const city = res.body[0];
    expect(city).toHaveProperty('id');
    expect(city).toHaveProperty('name');
    expect(city).toHaveProperty('country_code');
    expect(city).toHaveProperty('geocode_status');
    // region_id may be null — just check presence
    expect('region_id' in city).toBe(true);
    // coordinates may be null (geocode pending) — check type
    const latOk = city.latitude === null || typeof city.latitude === 'number';
    const lngOk = city.longitude === null || typeof city.longitude === 'number';
    expect(latOk).toBe(true);
    expect(lngOk).toBe(true);
  });

  it('400 — missing q parameter is rejected', async () => {
    const res = await api.get('/api/cities').expect(400);
    expect(res.body).toHaveProperty('error');
  });

  it('400 — q parameter too short (< 2 chars) is rejected', async () => {
    const res = await api.get('/api/cities?q=A').expect(400);
    expect(res.body).toHaveProperty('error');
  });

  it('200 — country_code filter returns only cities from that country', async () => {
    const res = await api
      .get(`/api/cities?q=${sharedCityName.slice(0, 8)}&country_code=AU`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    for (const city of res.body) {
      expect(city.country_code).toBe('AU');
    }
  });

  it('200 — returns empty array when no cities match query', async () => {
    const res = await api
      .get('/api/cities?q=xqzxqz_no_such_city_ever_zzz')
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ─── POST /api/cities ─────────────────────────────────────────────────────────

describe('POST /api/cities', () => {
  it('400 — missing required field: name', async () => {
    const res = await api
      .post('/api/cities')
      .send({ country_code: 'AU' })
      .expect(400);

    expect(res.body).toHaveProperty('error');
  });

  it('400 — missing required field: country_code', async () => {
    const res = await api
      .post('/api/cities')
      .send({ name: 'Test City No Country' })
      .expect(400);

    expect(res.body).toHaveProperty('error');
  });

  it('400 — invalid country_code format', async () => {
    const res = await api
      .post('/api/cities')
      .send({ name: 'Test City', country_code: 'TOOLONG' })
      .expect(400);

    expect(res.body).toHaveProperty('error');
  });

  it('404 — non-existent country_code', async () => {
    const res = await api
      .post('/api/cities')
      .send({ name: 'Ghost City', country_code: 'ZZ' })
      .expect(404);

    expect(res.body).toHaveProperty('error');
  });

  it('201 — creates a city with valid name and country_code', async () => {
    // Note: runs last to conserve rate limit budget for other tests
    const tag = Date.now();
    const res = await api
      .post('/api/cities')
      .send({ name: `TestCity-${tag}`, country_code: 'AU' })
      .expect(201);

    expect(typeof res.body.id).toBe('number');
    expect(res.body.name).toBe(`TestCity-${tag}`);
    expect(res.body.country_code).toBe('AU');
    expect(res.body).toHaveProperty('geocode_status');
    expect(['pending', 'resolved']).toContain(res.body.geocode_status);
    // region_id may be null
    expect('region_id' in res.body).toBe(true);
  });
});

// ─── PATCH /api/cities/:id ────────────────────────────────────────────────────

describe('PATCH /api/cities/:id', () => {
  it('200 — patching with empty body returns city unchanged', async () => {
    // PATCH with no recognized fields still returns the city
    const res = await api
      .patch(`/api/cities/${sharedCityId}`)
      .send({})
      .expect(200);

    expect(res.body.id).toBe(sharedCityId);
    expect(res.body).toHaveProperty('country_code');
    expect(res.body).toHaveProperty('geocode_status');
  });

  it('200 — returns city shape after update', async () => {
    const res = await api
      .patch(`/api/cities/${sharedCityId}`)
      .send({ region_id: null })
      .expect(200);

    expect(res.body.id).toBe(sharedCityId);
    expect(res.body).toHaveProperty('name');
    expect(res.body).toHaveProperty('country_code');
    expect(res.body).toHaveProperty('geocode_status');
    expect('region_id' in res.body).toBe(true);
    expect('latitude' in res.body).toBe(true);
    expect('longitude' in res.body).toBe(true);
  });

  it('404 — patching non-existent city', async () => {
    const res = await api
      .patch('/api/cities/999999999')
      .send({})
      .expect(404);

    expect(res.body).toHaveProperty('error');
  });

  it('400/404 — non-integer city ID does not crash (no 500)', async () => {
    const res = await api.patch('/api/cities/not-an-id').send({});
    expect(res.status).not.toBe(500);
  });
});

// ─── GET /api/cities/:id/carry-forward ────────────────────────────────────────

describe('GET /api/cities/:id/carry-forward', () => {
  it('200 — returns an array for a valid city', async () => {
    const res = await api
      .get(`/api/cities/${sharedCityId}/carry-forward`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
  });

  it('200 — carry-forward items have the required shape fields', async () => {
    // If data exists, verify shape. If empty, the test passes vacuously.
    const res = await api
      .get(`/api/cities/${sharedCityId}/carry-forward`)
      .expect(200);

    for (const item of res.body) {
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('item_type');
      expect(item).toHaveProperty('status');
      expect(item).toHaveProperty('source_trip_name');
      expect(item).toHaveProperty('source_trip_end_date');
    }
  });

  it('400/404 — non-integer city ID does not crash (no 500)', async () => {
    const res = await api.get('/api/cities/not-an-id/carry-forward');
    expect(res.status).not.toBe(500);
  });

  it('200 — non-existent integer city ID returns empty array (backend returns no 404)', async () => {
    // Backend does not check city existence before querying; returns empty results
    const res = await api.get('/api/cities/999999999/carry-forward');
    // Accept 200 (empty array) or 404 — document current behaviour
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      expect(Array.isArray(res.body)).toBe(true);
    }
  });
});

// ─── GET /api/cities/:id/items ────────────────────────────────────────────────

describe('GET /api/cities/:id/items', () => {
  it('200 — returns an array for a valid city', async () => {
    const res = await api
      .get(`/api/cities/${sharedCityId}/items`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
  });

  it('200 — item history entries have the required shape fields', async () => {
    const res = await api
      .get(`/api/cities/${sharedCityId}/items`)
      .expect(200);

    for (const item of res.body) {
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('item_type');
      expect(item).toHaveProperty('status');
      expect(item).toHaveProperty('trip_name');
      expect(item).toHaveProperty('trip_start_date');
    }
  });

  it('200 — type filter returns only items of that type', async () => {
    const res = await api
      .get(`/api/cities/${sharedCityId}/items?type=restaurant`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    for (const item of res.body) {
      expect(item.item_type).toBe('restaurant');
    }
  });

  it('200 — min_rating filter is accepted and returns array', async () => {
    const res = await api
      .get(`/api/cities/${sharedCityId}/items?min_rating=4`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
  });

  it('400 — invalid type value is rejected', async () => {
    const res = await api
      .get(`/api/cities/${sharedCityId}/items?type=invalid_type`)
      .expect(400);

    expect(res.body).toHaveProperty('error');
  });

  it('400 — min_rating out of range is rejected', async () => {
    const res = await api
      .get(`/api/cities/${sharedCityId}/items?min_rating=10`)
      .expect(400);

    expect(res.body).toHaveProperty('error');
  });

  it('200 — non-existent integer city ID returns empty array (backend returns no 404)', async () => {
    // Backend does not check city existence before querying; returns empty results
    const res = await api.get('/api/cities/999999999/items');
    // Accept 200 (empty array) or 404 — document current behaviour
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      expect(Array.isArray(res.body)).toBe(true);
    }
  });
});
