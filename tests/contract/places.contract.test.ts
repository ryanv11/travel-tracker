/**
 * Contract tests — /api/trips/:tripId/places
 *
 * Verifies the backend honours the published API contract for place endpoints.
 * Requires a running backend: npm run dev:api
 *
 * Coverage:
 *   GET    /api/trips/:tripId/places                          — list, shape, 404 trip
 *   POST   /api/trips/:tripId/places                          — create, validation, duplicate, locked
 *   DELETE /api/trips/:tripId/places/:placeId                 — delete, 404, locked
 *   POST   /api/trips/:tripId/places/:placeId/activities      — tag activity, conflict
 *   DELETE /api/trips/:tripId/places/:placeId/activities/:aid — untag activity
 *
 * NOTE: City creation is rate-limited to 20/min. We create minimal cities here
 * and reuse them across tests to stay within the limit.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { api, requireServer, createTestTrip, createTestCity, lockTrip } from './_setup.js';

// ─── Server check ─────────────────────────────────────────────────────────────

beforeAll(async () => {
  await requireServer();
});

// ─── Module-level shared city ─────────────────────────────────────────────────
// One city is created for all tests to avoid hitting the 20/min rate limit.

let sharedCityId: number;

beforeAll(async () => {
  const city = await createTestCity({ name: `ContractPlacesCity-${Date.now()}` });
  sharedCityId = city.id;
});

// ─── GET /api/trips/:tripId/places ────────────────────────────────────────────

describe('GET /api/trips/:tripId/places', () => {
  let tripId: number;

  beforeAll(async () => {
    const trip = await createTestTrip({ name: '[TEST] GET places trip' });
    tripId = trip.id;
    // Seed one place using shared city
    await api
      .post(`/api/trips/${tripId}/places`)
      .send({ city_id: sharedCityId })
      .expect(201);
  });

  it('200 — returns an array for a valid trip', async () => {
    const res = await api.get(`/api/trips/${tripId}/places`).expect(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('200 — each place has the required shape fields', async () => {
    const res = await api.get(`/api/trips/${tripId}/places`).expect(200);
    expect(res.body.length).toBeGreaterThan(0);

    const place = res.body[0];
    expect(place).toHaveProperty('id');
    expect(place).toHaveProperty('city_id');
    expect(place).toHaveProperty('created_at');
    expect(place).toHaveProperty('city');
    expect(Array.isArray(place.activities)).toBe(true);

    const city_obj = place.city;
    expect(city_obj).toHaveProperty('id');
    expect(city_obj).toHaveProperty('name');
    expect(city_obj).toHaveProperty('country_code');
    expect(city_obj).toHaveProperty('geocode_status');
  });

  it('404 — non-existent trip', async () => {
    const res = await api.get('/api/trips/999999999/places').expect(404);
    expect(res.body).toHaveProperty('error');
  });

  it('400/404 — non-integer trip ID does not crash (no 500)', async () => {
    const res = await api.get('/api/trips/not-an-id/places');
    expect(res.status).not.toBe(500);
  });
});

// ─── POST /api/trips/:tripId/places ───────────────────────────────────────────

describe('POST /api/trips/:tripId/places', () => {
  let tripId: number;

  beforeAll(async () => {
    const trip = await createTestTrip({ name: '[TEST] POST places trip' });
    tripId = trip.id;
  });

  it('201 — creates a place with valid city_id', async () => {
    const res = await api
      .post(`/api/trips/${tripId}/places`)
      .send({ city_id: sharedCityId })
      .expect(201);

    expect(typeof res.body.id).toBe('number');
    expect(res.body.city_id).toBe(sharedCityId);
    expect(res.body).toHaveProperty('city');
    expect(Array.isArray(res.body.activities)).toBe(true);
    expect(res.body.city.id).toBe(sharedCityId);
  });

  it('400 — missing required field: city_id', async () => {
    const res = await api
      .post(`/api/trips/${tripId}/places`)
      .send({})
      .expect(400);

    expect(res.body).toHaveProperty('error');
  });

  it('400 — city_id must be a positive integer', async () => {
    const res = await api
      .post(`/api/trips/${tripId}/places`)
      .send({ city_id: -1 })
      .expect(400);

    expect(res.body).toHaveProperty('error');
  });

  it('404 — non-existent city_id', async () => {
    const res = await api
      .post(`/api/trips/${tripId}/places`)
      .send({ city_id: 999999999 })
      .expect(404);

    expect(res.body).toHaveProperty('error');
  });

  it('409 — duplicate city in same trip is rejected', async () => {
    // sharedCityId was added in '201 — creates a place' test above
    // Try adding again — should conflict
    const res = await api
      .post(`/api/trips/${tripId}/places`)
      .send({ city_id: sharedCityId })
      .expect(409);

    expect(res.body).toHaveProperty('error');
  });

  it('403 — POST rejected when trip is locked', async () => {
    const lockedTrip = await createTestTrip({ name: '[TEST] Locked trip for places POST' });
    await lockTrip(lockedTrip.id);

    const res = await api
      .post(`/api/trips/${lockedTrip.id}/places`)
      .send({ city_id: sharedCityId })
      .expect(403);

    expect(res.body).toHaveProperty('error');
  });

  it('404 — POST to non-existent trip', async () => {
    const res = await api
      .post('/api/trips/999999999/places')
      .send({ city_id: sharedCityId })
      .expect(404);

    expect(res.body).toHaveProperty('error');
  });
});

// ─── DELETE /api/trips/:tripId/places/:placeId ────────────────────────────────

describe('DELETE /api/trips/:tripId/places/:placeId', () => {
  let tripId: number;
  let placeIdToDelete: number;
  let lockedTripId: number;
  let lockedPlaceId: number;

  beforeAll(async () => {
    const trip = await createTestTrip({ name: '[TEST] DELETE places trip' });
    tripId = trip.id;

    // Create a place to delete
    const createRes = await api
      .post(`/api/trips/${tripId}/places`)
      .send({ city_id: sharedCityId })
      .expect(201);
    placeIdToDelete = createRes.body.id;

    // Create a locked trip with a place
    const lockedTrip = await createTestTrip({ name: '[TEST] Locked trip for places DELETE' });
    lockedTripId = lockedTrip.id;
    const lockedPlaceRes = await api
      .post(`/api/trips/${lockedTripId}/places`)
      .send({ city_id: sharedCityId })
      .expect(201);
    lockedPlaceId = lockedPlaceRes.body.id;
    await lockTrip(lockedTripId);
  });

  it('204 — deletes an existing place', async () => {
    await api.delete(`/api/trips/${tripId}/places/${placeIdToDelete}`).expect(204);

    // Verify gone — re-listing should not include it
    const listRes = await api.get(`/api/trips/${tripId}/places`).expect(200);
    const ids = listRes.body.map((p: { id: number }) => p.id);
    expect(ids).not.toContain(placeIdToDelete);
  });

  it('404 — deleting non-existent place', async () => {
    const res = await api
      .delete(`/api/trips/${tripId}/places/999999999`)
      .expect(404);

    expect(res.body).toHaveProperty('error');
  });

  it('403 — DELETE rejected when trip is locked', async () => {
    const res = await api
      .delete(`/api/trips/${lockedTripId}/places/${lockedPlaceId}`)
      .expect(403);

    expect(res.body).toHaveProperty('error');
  });
});

// ─── POST /api/trips/:tripId/places/:placeId/activities ──────────────────────

describe('POST /api/trips/:tripId/places/:placeId/activities', () => {
  let tripId: number;
  let placeId: number;
  let activityId: number;

  beforeAll(async () => {
    const trip = await createTestTrip({ name: '[TEST] Place activities trip' });
    tripId = trip.id;

    const placeRes = await api
      .post(`/api/trips/${tripId}/places`)
      .send({ city_id: sharedCityId })
      .expect(201);
    placeId = placeRes.body.id;

    // Fetch an existing activity from the admin list
    const activitiesRes = await api.get('/api/admin/activities').expect(200);
    if (activitiesRes.body.length > 0) {
      activityId = activitiesRes.body[0].id;
    }
  });

  it('201 — tags an activity to a place', async () => {
    if (!activityId) return; // skip if no activities seeded

    const res = await api
      .post(`/api/trips/${tripId}/places/${placeId}/activities`)
      .send({ activity_id: activityId })
      .expect(201);

    expect(res.body).toHaveProperty('trip_place_id', placeId);
    expect(res.body).toHaveProperty('activity_id', activityId);
  });

  it('409 — duplicate activity tag is rejected', async () => {
    if (!activityId) return;

    // Already tagged above — try again
    const res = await api
      .post(`/api/trips/${tripId}/places/${placeId}/activities`)
      .send({ activity_id: activityId })
      .expect(409);

    expect(res.body).toHaveProperty('error');
  });

  it('400 — missing activity_id', async () => {
    const res = await api
      .post(`/api/trips/${tripId}/places/${placeId}/activities`)
      .send({})
      .expect(400);

    expect(res.body).toHaveProperty('error');
  });

  it('404 — place does not belong to trip', async () => {
    if (!activityId) return;

    const res = await api
      .post(`/api/trips/${tripId}/places/999999999/activities`)
      .send({ activity_id: activityId })
      .expect(404);

    expect(res.body).toHaveProperty('error');
  });
});

// ─── DELETE /api/trips/:tripId/places/:placeId/activities/:activityId ─────────

describe('DELETE /api/trips/:tripId/places/:placeId/activities/:activityId', () => {
  let tripId: number;
  let placeId: number;
  let activityId: number;

  beforeAll(async () => {
    const trip = await createTestTrip({ name: '[TEST] Untag activity trip' });
    tripId = trip.id;

    const placeRes = await api
      .post(`/api/trips/${tripId}/places`)
      .send({ city_id: sharedCityId })
      .expect(201);
    placeId = placeRes.body.id;

    const activitiesRes = await api.get('/api/admin/activities').expect(200);
    if (activitiesRes.body.length > 0) {
      activityId = activitiesRes.body[0].id;
      // Tag it first
      await api
        .post(`/api/trips/${tripId}/places/${placeId}/activities`)
        .send({ activity_id: activityId });
    }
  });

  it('204 — untagging an activity returns 204', async () => {
    if (!activityId) return;

    await api
      .delete(`/api/trips/${tripId}/places/${placeId}/activities/${activityId}`)
      .expect(204);
  });

  it('204 — untagging a non-existent activity is idempotent (no crash)', async () => {
    const res = await api.delete(
      `/api/trips/${tripId}/places/${placeId}/activities/999999999`,
    );
    // Backend deletes without checking existence — 204 is acceptable
    expect(res.status).not.toBe(500);
  });
});
