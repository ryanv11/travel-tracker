/**
 * Contract tests — /api/trips
 *
 * Verifies the backend honours the published API contract for trip endpoints.
 * Requires a running backend: npm run dev:api
 *
 * Coverage:
 *   POST   /api/trips                     — create, validation
 *   GET    /api/trips                     — list, shape, filtering
 *   GET    /api/trips/:id                 — single trip, 404
 *   PATCH  /api/trips/:id                 — update, locked rejection
 *   PATCH  /api/trips/:id/status          — transitions, invalid transition
 *   PATCH  /api/trips/:id/lock            — lock shortcut
 *   PATCH  /api/trips/:id/unlock          — unlock shortcut
 *   GET    /api/trips/:id/summary         — 404 (endpoint never implemented; see BUG-01 note)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { api, requireServer, createTestTrip, lockTrip } from './_setup.js';

// ─── Server check ─────────────────────────────────────────────────────────────

beforeAll(async () => {
  await requireServer();
});

// ─── POST /api/trips ──────────────────────────────────────────────────────────

describe('POST /api/trips', () => {
  it('201 — creates a trip with valid body', async () => {
    const res = await api
      .post('/api/trips')
      .send({ name: '[TEST] Paris Trip', start_date: '2026-06-01', end_date: '2026-06-15' })
      .expect(201);

    expect(res.body).toMatchObject({
      name: '[TEST] Paris Trip',
      start_date: '2026-06-01',
      end_date: '2026-06-15',
      status: 'planning',
    });
    expect(typeof res.body.id).toBe('number');
    expect(Array.isArray(res.body.categories)).toBe(true);
    expect(Array.isArray(res.body.companions)).toBe(true);
    expect(Array.isArray(res.body.activities)).toBe(true);
  });

  it('400 — missing required field: name', async () => {
    const res = await api
      .post('/api/trips')
      .send({ start_date: '2026-06-01', end_date: '2026-06-15' })
      .expect(400);

    expect(res.body).toHaveProperty('error');
    expect(res.body).toHaveProperty('details');
    expect(Array.isArray(res.body.details)).toBe(true);
  });

  it('400 — missing required field: start_date', async () => {
    const res = await api
      .post('/api/trips')
      .send({ name: '[TEST] Trip', end_date: '2026-06-15' })
      .expect(400);

    expect(res.body).toHaveProperty('details');
  });

  it('400 — end_date before start_date', async () => {
    const res = await api
      .post('/api/trips')
      .send({ name: '[TEST] Trip', start_date: '2026-06-15', end_date: '2026-06-01' })
      .expect(400);

    expect(res.body).toHaveProperty('details');
  });

  it('400 — invalid date format', async () => {
    const res = await api
      .post('/api/trips')
      .send({ name: '[TEST] Trip', start_date: 'not-a-date', end_date: '2026-06-15' })
      .expect(400);

    expect(res.body).toHaveProperty('error');
  });

  it('BUG-10 — 201 when name is exactly 75 chars (boundary accepted)', async () => {
    // BRD TR-01 and API reference specify max 75 chars (corrected 2026-07-20) — 75 is valid.
    const name = 'x'.repeat(75);
    const res = await api
      .post('/api/trips')
      .send({ name, start_date: '2026-06-01', end_date: '2026-06-15' })
      .expect(201);

    expect(res.body.name).toBe(name);
  });

  it('BUG-10 — 400 when name exceeds 75 chars', async () => {
    const res = await api
      .post('/api/trips')
      .send({ name: 'x'.repeat(76), start_date: '2026-06-01', end_date: '2026-06-15' })
      .expect(400);

    expect(res.body).toHaveProperty('error');
    expect(res.body).toHaveProperty('details');
  });
});

// ─── GET /api/trips ───────────────────────────────────────────────────────────

describe('GET /api/trips', () => {
  it('200 — returns an array', async () => {
    const res = await api.get('/api/trips').expect(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('200 — each trip has the required shape fields', async () => {
    // Ensure at least one trip exists
    await createTestTrip();
    const res = await api.get('/api/trips').expect(200);
    expect(res.body.length).toBeGreaterThan(0);

    const trip = res.body[0];
    expect(trip).toHaveProperty('id');
    expect(trip).toHaveProperty('name');
    expect(trip).toHaveProperty('status');
    expect(trip).toHaveProperty('start_date');
    expect(trip).toHaveProperty('end_date');
    expect(trip).toHaveProperty('created_at');
    expect(trip).toHaveProperty('updated_at');
    expect(Array.isArray(trip.categories)).toBe(true);
    expect(Array.isArray(trip.companions)).toBe(true);
    expect(Array.isArray(trip.activities)).toBe(true);
  });

  it('200 — status filter returns only trips with that status', async () => {
    const res = await api.get('/api/trips?status=planning').expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    for (const trip of res.body) {
      expect(trip.status).toBe('planning');
    }
  });

  it('400 — invalid status value in query param is rejected (strict enum validation)', async () => {
    // ListTripsQuerySchema validates status as a strict enum (zTripStatus).
    // Passing an unknown value returns 400 — this is intentional strict validation behaviour.
    const res = await api.get('/api/trips?status=nonexistent').expect(400);
    expect(res.body).toHaveProperty('error');
  });
});

// ─── GET /api/trips/:id ───────────────────────────────────────────────────────

describe('GET /api/trips/:id', () => {
  let tripId: number;

  beforeAll(async () => {
    const trip = await createTestTrip({ name: '[TEST] GET single trip' });
    tripId = trip.id;
  });

  it('200 — returns trip with full nested shape', async () => {
    const res = await api.get(`/api/trips/${tripId}`).expect(200);
    expect(res.body.id).toBe(tripId);
    expect(res.body).toHaveProperty('places');
    expect(Array.isArray(res.body.places)).toBe(true);
  });

  it('404 — non-existent trip ID', async () => {
    const res = await api.get('/api/trips/999999999').expect(404);
    expect(res.body).toHaveProperty('error');
  });

  it('404 — non-integer trip ID', async () => {
    // Route parses the id with parseInt and treats NaN as "Trip not found"
    // (src/backend/routes/trips.ts GET /:id) — a non-integer id is a 404, never a 500.
    const res = await api.get('/api/trips/not-an-id').expect(404);
    expect(res.body).toHaveProperty('error');
  });
});

// ─── PATCH /api/trips/:id ─────────────────────────────────────────────────────

describe('PATCH /api/trips/:id', () => {
  let tripId: number;

  beforeAll(async () => {
    const trip = await createTestTrip({ name: '[TEST] PATCH trip' });
    tripId = trip.id;
  });

  it('200 — updates trip name', async () => {
    const res = await api
      .patch(`/api/trips/${tripId}`)
      .send({ name: '[TEST] PATCH trip — updated' })
      .expect(200);

    expect(res.body.name).toBe('[TEST] PATCH trip — updated');
    expect(res.body.id).toBe(tripId);
  });

  it('BUG-10 — 200 when updated name is exactly 75 chars (boundary accepted)', async () => {
    const name = 'y'.repeat(75);
    const res = await api.patch(`/api/trips/${tripId}`).send({ name }).expect(200);
    expect(res.body.name).toBe(name);
  });

  it('BUG-10 — 400 when updated name exceeds 75 chars', async () => {
    const res = await api
      .patch(`/api/trips/${tripId}`)
      .send({ name: 'y'.repeat(76) })
      .expect(400);

    expect(res.body).toHaveProperty('error');
  });

  it('400 — invalid date range on update', async () => {
    const res = await api
      .patch(`/api/trips/${tripId}`)
      .send({ start_date: '2026-12-01', end_date: '2026-06-01' })
      .expect(400);

    expect(res.body).toHaveProperty('error');
  });

  it('404 — patching non-existent trip', async () => {
    const res = await api
      .patch('/api/trips/999999999')
      .send({ name: 'Ghost trip' })
      .expect(404);

    expect(res.body).toHaveProperty('error');
  });

  it('403 — PATCH is rejected when trip is locked', async () => {
    // NOTE: API reference says 403; COO spec mentioned 423. Actual code uses 403.
    // Flagged to COO as a discrepancy — tests written to match code behaviour.
    const lockedTrip = await createTestTrip({ name: '[TEST] Trip to lock for PATCH test' });
    await lockTrip(lockedTrip.id);

    const res = await api
      .patch(`/api/trips/${lockedTrip.id}`)
      .send({ name: 'Should be rejected' })
      .expect(403);

    expect(res.body).toHaveProperty('error');
  });
});

// ─── PATCH /api/trips/:id/status ─────────────────────────────────────────────

describe('PATCH /api/trips/:id/status', () => {
  let tripId: number;

  beforeAll(async () => {
    const trip = await createTestTrip({ name: '[TEST] Status transition trip' });
    tripId = trip.id;
  });

  it('200 — planning → active transition', async () => {
    const res = await api
      .patch(`/api/trips/${tripId}/status`)
      .send({ status: 'active' })
      .expect(200);

    expect(res.body.status).toBe('active');
  });

  it('200 — active → review_pending transition', async () => {
    const res = await api
      .patch(`/api/trips/${tripId}/status`)
      .send({ status: 'review_pending' })
      .expect(200);

    expect(res.body.status).toBe('review_pending');
  });

  it('200 — review_pending → planning transition (soft lock cancel)', async () => {
    // BUG-04 regression: this transition must be possible (NR-05)
    const res = await api
      .patch(`/api/trips/${tripId}/status`)
      .send({ status: 'planning' })
      .expect(200);

    expect(res.body.status).toBe('planning');
  });

  it('400 — invalid status value', async () => {
    const res = await api
      .patch(`/api/trips/${tripId}/status`)
      .send({ status: 'not_a_real_status' })
      .expect(400);

    expect(res.body).toHaveProperty('error');
  });

  it('400 — invalid transition (planning → locked)', async () => {
    // planning → locked is not an allowed transition
    const res = await api
      .patch(`/api/trips/${tripId}/status`)
      .send({ status: 'locked' })
      .expect(400);

    expect(res.body).toHaveProperty('error');
  });
});

// ─── PATCH /api/trips/:id/lock + unlock ───────────────────────────────────────

describe('PATCH /api/trips/:id/lock and /unlock', () => {
  let tripId: number;

  beforeAll(async () => {
    const trip = await createTestTrip({ name: '[TEST] Lock/unlock trip' });
    // Advance to review_pending so lock is valid
    await api
      .patch(`/api/trips/${trip.id}/status`)
      .send({ status: 'review_pending' })
      .expect(200);
    tripId = trip.id;
  });

  it('200 — lock shortcut moves trip to locked', async () => {
    const res = await api.patch(`/api/trips/${tripId}/lock`).expect(200);
    expect(res.body.status).toBe('locked');
  });

  it('200 — unlock moves trip back to review_pending', async () => {
    const res = await api.patch(`/api/trips/${tripId}/unlock`).expect(200);
    expect(res.body.status).toBe('review_pending');
  });

  it('400 — lock fails when trip is not in review_pending', async () => {
    // Put it back to locked, then try to lock again
    await api.patch(`/api/trips/${tripId}/lock`).expect(200);
    const res = await api.patch(`/api/trips/${tripId}/lock`).expect(400);
    expect(res.body).toHaveProperty('error');
  });
});

// ─── GET /api/trips/:id/summary — BUG-01 REGRESSION ──────────────────────────

describe('GET /api/trips/:id/summary (BUG-01 history)', () => {
  let tripId: number;

  beforeAll(async () => {
    const trip = await createTestTrip({ name: '[TEST] Summary shape trip' });
    tripId = trip.id;
  });

  it('404 — no /summary endpoint exists; places data lives on GET /api/trips/:id', async () => {
    // BUG-10 audit follow-up (2026-07): the old tests here accepted either 200 or 404
    // ("expected to FAIL until BC-01 is deployed") and so could never fail. Reality:
    // the /summary endpoint was never implemented — BUG-01's places data is served
    // by GET /api/trips/:id instead (its places array is asserted above in this file).
    // This test pins the actual contract: /summary is not a route. If a summary
    // endpoint is ever added, replace this test with real TripSummary shape assertions
    // (id, name, status, places[] with city_id/latitude/longitude).
    await api.get(`/api/trips/${tripId}/summary`).expect(404);
  });
});
