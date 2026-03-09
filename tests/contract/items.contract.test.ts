/**
 * Contract tests — /api/trips/:tripId/items
 *
 * Verifies the backend honours the published API contract for item endpoints.
 * Requires a running backend: npm run dev:api
 *
 * Coverage:
 *   GET    /api/trips/:tripId/items            — list, shape, query filters
 *   POST   /api/trips/:tripId/items            — create (note, restaurant, hotel, flight), validation, locked
 *   PATCH  /api/trips/:tripId/items/:itemId    — update status/notes/extension fields, locked
 *   DELETE /api/trips/:tripId/items/:itemId    — delete, 404, locked
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { api, requireServer, createTestTrip, lockTrip } from './_setup.js';

// ─── Server check ─────────────────────────────────────────────────────────────

beforeAll(async () => {
  await requireServer();
});

// ─── GET /api/trips/:tripId/items ─────────────────────────────────────────────

describe('GET /api/trips/:tripId/items', () => {
  let tripId: number;

  beforeAll(async () => {
    const trip = await createTestTrip({ name: '[TEST] GET items trip' });
    tripId = trip.id;
    // Seed one item
    await api
      .post(`/api/trips/${tripId}/items`)
      .send({ item_type: 'note', notes: 'Contract test seed note' })
      .expect(201);
  });

  it('200 — returns an array', async () => {
    const res = await api.get(`/api/trips/${tripId}/items`).expect(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('200 — each item has the required base shape fields', async () => {
    const res = await api.get(`/api/trips/${tripId}/items`).expect(200);
    expect(res.body.length).toBeGreaterThan(0);

    const item = res.body[0];
    expect(item).toHaveProperty('id');
    expect(item).toHaveProperty('item_type');
    expect(item).toHaveProperty('status');
    expect(item).toHaveProperty('created_at');
    expect(item).toHaveProperty('updated_at');
  });

  it('200 — type filter returns only items of that type', async () => {
    const res = await api
      .get(`/api/trips/${tripId}/items?type=note`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    for (const item of res.body) {
      expect(item.item_type).toBe('note');
    }
  });

  it('200 — status filter returns only items with that status', async () => {
    const res = await api
      .get(`/api/trips/${tripId}/items?status=consider`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    for (const item of res.body) {
      expect(item.status).toBe('consider');
    }
  });

  it('400 — invalid type value is rejected', async () => {
    const res = await api
      .get(`/api/trips/${tripId}/items?type=invalid_type`)
      .expect(400);

    expect(res.body).toHaveProperty('error');
  });

  it('400 — invalid status value is rejected', async () => {
    const res = await api
      .get(`/api/trips/${tripId}/items?status=not_a_status`)
      .expect(400);

    expect(res.body).toHaveProperty('error');
  });
});

// ─── POST /api/trips/:tripId/items ────────────────────────────────────────────

describe('POST /api/trips/:tripId/items — note type', () => {
  let tripId: number;

  beforeAll(async () => {
    const trip = await createTestTrip({ name: '[TEST] POST note items trip' });
    tripId = trip.id;
  });

  it('201 — creates a note item', async () => {
    const res = await api
      .post(`/api/trips/${tripId}/items`)
      .send({ item_type: 'note', notes: 'Contract test note' })
      .expect(201);

    expect(typeof res.body.id).toBe('number');
    expect(res.body.item_type).toBe('note');
    expect(res.body.status).toBe('consider');
    expect(res.body.notes).toBe('Contract test note');
  });

  it('201 — status defaults to consider when not provided', async () => {
    const res = await api
      .post(`/api/trips/${tripId}/items`)
      .send({ item_type: 'note' })
      .expect(201);

    expect(res.body.status).toBe('consider');
  });

  it('201 — explicit status is honoured', async () => {
    const res = await api
      .post(`/api/trips/${tripId}/items`)
      .send({ item_type: 'note', status: 'confirmed' })
      .expect(201);

    expect(res.body.status).toBe('confirmed');
  });

  it('400 — missing required field: item_type', async () => {
    const res = await api
      .post(`/api/trips/${tripId}/items`)
      .send({ notes: 'No type provided' })
      .expect(400);

    expect(res.body).toHaveProperty('error');
  });

  it('400 — invalid item_type value', async () => {
    const res = await api
      .post(`/api/trips/${tripId}/items`)
      .send({ item_type: 'invalid_type' })
      .expect(400);

    expect(res.body).toHaveProperty('error');
  });

  it('400 — invalid status value', async () => {
    const res = await api
      .post(`/api/trips/${tripId}/items`)
      .send({ item_type: 'note', status: 'not_valid' })
      .expect(400);

    expect(res.body).toHaveProperty('error');
  });

  it('403 — POST rejected when trip is locked', async () => {
    const lockedTrip = await createTestTrip({ name: '[TEST] Locked trip for items POST' });
    await lockTrip(lockedTrip.id);

    const res = await api
      .post(`/api/trips/${lockedTrip.id}/items`)
      .send({ item_type: 'note' })
      .expect(403);

    expect(res.body).toHaveProperty('error');
  });
});

describe('POST /api/trips/:tripId/items — restaurant type', () => {
  let tripId: number;

  beforeAll(async () => {
    const trip = await createTestTrip({ name: '[TEST] POST restaurant items trip' });
    tripId = trip.id;
  });

  it('201 — creates a restaurant item with extension fields', async () => {
    const res = await api
      .post(`/api/trips/${tripId}/items`)
      .send({
        item_type: 'restaurant',
        name: 'The Test Bistro',
        cuisine_type: 'French',
        source: 'Guidebook',
      })
      .expect(201);

    expect(res.body.item_type).toBe('restaurant');
    // Restaurant extension fields are returned flat (not prefixed with restaurant_)
    expect(res.body).toHaveProperty('name');
    expect(res.body.name).toBe('The Test Bistro');
    expect(res.body).toHaveProperty('cuisine_type');
    expect(res.body).toHaveProperty('rating');
    expect(res.body).toHaveProperty('post_visit_notes');
  });

  it('201 — creates a restaurant item with minimal data', async () => {
    const res = await api
      .post(`/api/trips/${tripId}/items`)
      .send({ item_type: 'restaurant' })
      .expect(201);

    expect(res.body.item_type).toBe('restaurant');
  });
});

describe('POST /api/trips/:tripId/items — hotel type', () => {
  let tripId: number;

  beforeAll(async () => {
    const trip = await createTestTrip({ name: '[TEST] POST hotel items trip' });
    tripId = trip.id;
  });

  it('201 — creates a hotel item with extension fields', async () => {
    const res = await api
      .post(`/api/trips/${tripId}/items`)
      .send({
        item_type: 'hotel',
        property_name: 'Test Grand Hotel',
        check_in_date: '2026-06-01',
        check_out_date: '2026-06-05',
      })
      .expect(201);

    expect(res.body.item_type).toBe('hotel');
    // Hotel extension fields are returned flat (not prefixed with hotel_)
    expect(res.body).toHaveProperty('property_name');
    expect(res.body.property_name).toBe('Test Grand Hotel');
    expect(res.body).toHaveProperty('check_in_date');
    expect(res.body).toHaveProperty('check_out_date');
    expect(res.body).toHaveProperty('rating');
    expect(res.body).toHaveProperty('post_visit_notes');
  });
});

describe('POST /api/trips/:tripId/items — flight type', () => {
  let tripId: number;

  beforeAll(async () => {
    const trip = await createTestTrip({ name: '[TEST] POST flight items trip' });
    tripId = trip.id;
  });

  it('201 — creates a flight item with extension fields', async () => {
    const res = await api
      .post(`/api/trips/${tripId}/items`)
      .send({
        item_type: 'flight',
        airline: 'Test Air',
        flight_number: 'TA001',
        departure_airport: 'SYD',
        arrival_airport: 'LHR',
      })
      .expect(201);

    expect(res.body.item_type).toBe('flight');
    expect(res.body).toHaveProperty('airline');
    expect(res.body.airline).toBe('Test Air');
  });
});

// ─── PATCH /api/trips/:tripId/items/:itemId ───────────────────────────────────

describe('PATCH /api/trips/:tripId/items/:itemId', () => {
  let tripId: number;
  let itemId: number;

  beforeAll(async () => {
    const trip = await createTestTrip({ name: '[TEST] PATCH items trip' });
    tripId = trip.id;

    const createRes = await api
      .post(`/api/trips/${tripId}/items`)
      .send({ item_type: 'note', notes: 'Original note' })
      .expect(201);
    itemId = createRes.body.id;
  });

  it('200 — updates item status', async () => {
    const res = await api
      .patch(`/api/trips/${tripId}/items/${itemId}`)
      .send({ status: 'confirmed' })
      .expect(200);

    expect(res.body.status).toBe('confirmed');
    expect(res.body.id).toBe(itemId);
  });

  it('200 — updates item notes', async () => {
    const res = await api
      .patch(`/api/trips/${tripId}/items/${itemId}`)
      .send({ notes: 'Updated note text' })
      .expect(200);

    expect(res.body.notes).toBe('Updated note text');
  });

  it('400 — invalid status value on update', async () => {
    const res = await api
      .patch(`/api/trips/${tripId}/items/${itemId}`)
      .send({ status: 'not_valid_status' })
      .expect(400);

    expect(res.body).toHaveProperty('error');
  });

  it('404 — patching non-existent item', async () => {
    const res = await api
      .patch(`/api/trips/${tripId}/items/999999999`)
      .send({ status: 'confirmed' })
      .expect(404);

    expect(res.body).toHaveProperty('error');
  });

  it('403 — PATCH rejected when trip is locked', async () => {
    const lockedTrip = await createTestTrip({ name: '[TEST] Locked trip for items PATCH' });
    const createRes = await api
      .post(`/api/trips/${lockedTrip.id}/items`)
      .send({ item_type: 'note' })
      .expect(201);
    const lockedItemId = createRes.body.id;

    await lockTrip(lockedTrip.id);

    const res = await api
      .patch(`/api/trips/${lockedTrip.id}/items/${lockedItemId}`)
      .send({ notes: 'Should be rejected' })
      .expect(403);

    expect(res.body).toHaveProperty('error');
  });
});

describe('PATCH /api/trips/:tripId/items/:itemId — restaurant extension fields', () => {
  let tripId: number;
  let itemId: number;

  beforeAll(async () => {
    const trip = await createTestTrip({ name: '[TEST] PATCH restaurant ext trip' });
    tripId = trip.id;

    const createRes = await api
      .post(`/api/trips/${tripId}/items`)
      .send({ item_type: 'restaurant', name: 'Original Restaurant' })
      .expect(201);
    itemId = createRes.body.id;
  });

  it('200 — updates restaurant extension fields', async () => {
    const res = await api
      .patch(`/api/trips/${tripId}/items/${itemId}`)
      .send({ name: 'Updated Restaurant Name', rating: 4 })
      .expect(200);

    // Restaurant extension fields are returned flat (not prefixed with restaurant_)
    expect(res.body.name).toBe('Updated Restaurant Name');
    expect(res.body.rating).toBe(4);
  });
});

// ─── DELETE /api/trips/:tripId/items/:itemId ──────────────────────────────────

describe('DELETE /api/trips/:tripId/items/:itemId', () => {
  let tripId: number;

  beforeAll(async () => {
    const trip = await createTestTrip({ name: '[TEST] DELETE items trip' });
    tripId = trip.id;
  });

  it('204 — deletes an existing item', async () => {
    const createRes = await api
      .post(`/api/trips/${tripId}/items`)
      .send({ item_type: 'note', notes: 'To be deleted' })
      .expect(201);

    const itemId = createRes.body.id;
    await api.delete(`/api/trips/${tripId}/items/${itemId}`).expect(204);
  });

  it('404 — deleting non-existent item', async () => {
    const res = await api
      .delete(`/api/trips/${tripId}/items/999999999`)
      .expect(404);

    expect(res.body).toHaveProperty('error');
  });

  it('403 — DELETE rejected when trip is locked', async () => {
    const lockedTrip = await createTestTrip({ name: '[TEST] Locked trip for items DELETE' });
    const createRes = await api
      .post(`/api/trips/${lockedTrip.id}/items`)
      .send({ item_type: 'note' })
      .expect(201);
    const lockedItemId = createRes.body.id;

    await lockTrip(lockedTrip.id);

    const res = await api
      .delete(`/api/trips/${lockedTrip.id}/items/${lockedItemId}`)
      .expect(403);

    expect(res.body).toHaveProperty('error');
  });
});
