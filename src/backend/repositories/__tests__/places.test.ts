/**
 * Unit tests for placeRepository (src/backend/repositories/places.ts).
 *
 * Covers:
 *   - assertWritable: NotFoundError for non-existent/wrong-user trips, LockError for locked trips
 *   - findByTrip: returns places with city data, throws NotFoundError for wrong user
 *   - findById: returns raw TripPlace for owner, null for wrong user
 *   - create: inserts new place, enforces write-guard (lock/not-found), duplicate check
 *   - delete: removes place, returns false for wrong place, enforces write-guard
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../../db/schema.js';
import { ConflictError, LockError, NotFoundError } from '../../errors.js';
import {
  createTestDb,
  OTHER_USER_ID,
  seedCity,
  seedCountry,
  seedTestUser,
  seedTrip,
  TEST_USER_ID,
  type TestDb,
} from './test-db.js';

// ----------------------------------------------------------------
// Mock getDb
// ----------------------------------------------------------------

let testDb: TestDb | null = null;

vi.mock('../../db/index.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../db/index.js')>();
  return {
    ...real,
    getDb: () => {
      if (!testDb) throw new Error('[TEST] testDb not initialised');
      return testDb;
    },
  };
});

const { placeRepository } = await import('../places.js');

// ----------------------------------------------------------------
// Test setup
// ----------------------------------------------------------------

beforeEach(async () => {
  testDb = await createTestDb();
  await seedTestUser(testDb, TEST_USER_ID);
  await seedTestUser(testDb, OTHER_USER_ID, 'user_other');
  await seedCountry(testDb, 'FR', 'France');
  await seedCountry(testDb, 'DE', 'Germany');
});

afterEach(() => {
  testDb = null;
});

// ----------------------------------------------------------------
// assertWritable
// ----------------------------------------------------------------

describe('placeRepository.assertWritable', () => {
  it('resolves when trip is owned by user and not locked', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);

    await expect(placeRepository.assertWritable(TEST_USER_ID, trip.id)).resolves.not.toThrow();
  });

  it('throws NotFoundError when trip does not exist', async () => {
    await expect(placeRepository.assertWritable(TEST_USER_ID, 99999)).rejects.toThrow(
      NotFoundError,
    );
  });

  it('throws NotFoundError when trip belongs to another user', async () => {
    const db = testDb!;
    const trip = await seedTrip(db, { userId: OTHER_USER_ID });

    await expect(placeRepository.assertWritable(TEST_USER_ID, trip.id)).rejects.toThrow(
      NotFoundError,
    );
  });

  it('throws LockError when trip is locked', async () => {
    const db = testDb!;
    const trip = await seedTrip(db, { status: 'locked' });

    await expect(placeRepository.assertWritable(TEST_USER_ID, trip.id)).rejects.toThrow(LockError);
  });
});

// ----------------------------------------------------------------
// findByTrip
// ----------------------------------------------------------------

describe('placeRepository.findByTrip', () => {
  it('returns empty array when trip has no places', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);

    const result = await placeRepository.findByTrip(TEST_USER_ID, trip.id);
    expect(result).toHaveLength(0);
  });

  it('returns places with city data', async () => {
    const db = testDb!;
    const city = await seedCity(db, 'FR', 'Paris');
    const trip = await seedTrip(db);
    await db
      .insert(schema.tripPlaces)
      .values({ tripId: trip.id, cityId: city.id, userId: TEST_USER_ID });

    const result = await placeRepository.findByTrip(TEST_USER_ID, trip.id);

    expect(result).toHaveLength(1);
    expect(result[0].cityId).toBe(city.id);
    expect(result[0].city.name).toBe('Paris');
    expect(result[0].city.country_code).toBe('FR');
    expect(result[0].activities).toHaveLength(0);
  });

  it('returns multiple places when multiple cities added', async () => {
    const db = testDb!;
    const city1 = await seedCity(db, 'FR', 'Paris');
    const city2 = await seedCity(db, 'DE', 'Berlin');
    const trip = await seedTrip(db);
    await db.insert(schema.tripPlaces).values([
      { tripId: trip.id, cityId: city1.id, userId: TEST_USER_ID },
      { tripId: trip.id, cityId: city2.id, userId: TEST_USER_ID },
    ]);

    const result = await placeRepository.findByTrip(TEST_USER_ID, trip.id);
    expect(result).toHaveLength(2);
  });

  it('throws NotFoundError when trip does not exist', async () => {
    await expect(placeRepository.findByTrip(TEST_USER_ID, 99999)).rejects.toThrow(NotFoundError);
  });

  it('throws NotFoundError when trip belongs to another user', async () => {
    const db = testDb!;
    const trip = await seedTrip(db, { userId: OTHER_USER_ID });

    await expect(placeRepository.findByTrip(TEST_USER_ID, trip.id)).rejects.toThrow(NotFoundError);
  });
});

// ----------------------------------------------------------------
// findById
// ----------------------------------------------------------------

describe('placeRepository.findById', () => {
  it('returns raw TripPlace when found for owning user', async () => {
    const db = testDb!;
    const city = await seedCity(db, 'FR', 'Lyon');
    const trip = await seedTrip(db);
    const [place] = await db
      .insert(schema.tripPlaces)
      .values({ tripId: trip.id, cityId: city.id, userId: TEST_USER_ID })
      .returning();

    const result = await placeRepository.findById(TEST_USER_ID, place.id);

    expect(result).not.toBeNull();
    expect(result!.id).toBe(place.id);
    expect(result!.cityId).toBe(city.id);
  });

  it('returns null when place does not exist', async () => {
    const result = await placeRepository.findById(TEST_USER_ID, 99999);
    expect(result).toBeNull();
  });

  it('returns null when place belongs to a trip of another user', async () => {
    const db = testDb!;
    const city = await seedCity(db, 'FR', 'Nice');
    const trip = await seedTrip(db, { userId: OTHER_USER_ID });
    const [place] = await db
      .insert(schema.tripPlaces)
      .values({ tripId: trip.id, cityId: city.id, userId: OTHER_USER_ID })
      .returning();

    const result = await placeRepository.findById(TEST_USER_ID, place.id);
    expect(result).toBeNull();
  });
});

// ----------------------------------------------------------------
// create
// ----------------------------------------------------------------

describe('placeRepository.create', () => {
  it('creates a place and returns the inserted row', async () => {
    const db = testDb!;
    const city = await seedCity(db, 'FR', 'Bordeaux');
    const trip = await seedTrip(db);

    const result = await placeRepository.create(TEST_USER_ID, trip.id, city.id);

    expect(result.id).toBeTypeOf('number');
    expect(result.tripId).toBe(trip.id);
    expect(result.cityId).toBe(city.id);
  });

  it('stores arrived_on and departed_on when provided', async () => {
    const db = testDb!;
    const city = await seedCity(db, 'FR', 'Clermont-Ferrand');
    const trip = await seedTrip(db);

    const result = await placeRepository.create(
      TEST_USER_ID,
      trip.id,
      city.id,
      '2026-06-01',
      '2026-06-05',
    );

    expect(result.arrivedOn).toBe('2026-06-01');
    expect(result.departedOn).toBe('2026-06-05');
  });

  it('stores null dates when not provided', async () => {
    const db = testDb!;
    const city = await seedCity(db, 'FR', 'Limoges');
    const trip = await seedTrip(db);

    const result = await placeRepository.create(TEST_USER_ID, trip.id, city.id);

    expect(result.arrivedOn).toBeNull();
    expect(result.departedOn).toBeNull();
  });

  it('is retrievable via findByTrip after creation', async () => {
    const db = testDb!;
    const city = await seedCity(db, 'FR', 'Marseille');
    const trip = await seedTrip(db);
    await placeRepository.create(TEST_USER_ID, trip.id, city.id);

    const places = await placeRepository.findByTrip(TEST_USER_ID, trip.id);
    expect(places).toHaveLength(1);
  });

  it('throws NotFoundError when trip does not exist', async () => {
    const db = testDb!;
    const city = await seedCity(db, 'FR', 'Nantes');

    await expect(placeRepository.create(TEST_USER_ID, 99999, city.id)).rejects.toThrow(
      NotFoundError,
    );
  });

  it('throws NotFoundError when trip belongs to another user (write-guard)', async () => {
    const db = testDb!;
    const city = await seedCity(db, 'FR', 'Strasbourg');
    const trip = await seedTrip(db, { userId: OTHER_USER_ID });

    await expect(placeRepository.create(TEST_USER_ID, trip.id, city.id)).rejects.toThrow(
      NotFoundError,
    );
  });

  it('throws LockError when trip is locked (write-guard)', async () => {
    const db = testDb!;
    const city = await seedCity(db, 'FR', 'Rennes');
    const trip = await seedTrip(db, { status: 'locked' });

    await expect(placeRepository.create(TEST_USER_ID, trip.id, city.id)).rejects.toThrow(LockError);
  });

  it('throws ConflictError when city is already on the trip', async () => {
    const db = testDb!;
    const city = await seedCity(db, 'FR', 'Dijon');
    const trip = await seedTrip(db);
    await placeRepository.create(TEST_USER_ID, trip.id, city.id);

    await expect(placeRepository.create(TEST_USER_ID, trip.id, city.id)).rejects.toThrow(
      ConflictError,
    );
  });
});

// ----------------------------------------------------------------
// delete
// ----------------------------------------------------------------

describe('placeRepository.delete', () => {
  it('deletes the place and returns true', async () => {
    const db = testDb!;
    const city = await seedCity(db, 'FR', 'Caen');
    const trip = await seedTrip(db);
    const place = await placeRepository.create(TEST_USER_ID, trip.id, city.id);

    const result = await placeRepository.delete(TEST_USER_ID, trip.id, place.id);

    expect(result).toBe(true);
  });

  it('place is gone after deletion', async () => {
    const db = testDb!;
    const city = await seedCity(db, 'FR', 'Caen');
    const trip = await seedTrip(db);
    const place = await placeRepository.create(TEST_USER_ID, trip.id, city.id);

    await placeRepository.delete(TEST_USER_ID, trip.id, place.id);

    const places = await placeRepository.findByTrip(TEST_USER_ID, trip.id);
    expect(places).toHaveLength(0);
  });

  it('returns false when place does not exist', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);

    const result = await placeRepository.delete(TEST_USER_ID, trip.id, 99999);
    expect(result).toBe(false);
  });

  it('returns false when place belongs to a different trip', async () => {
    const db = testDb!;
    const city = await seedCity(db, 'FR', 'Rouen');
    const trip1 = await seedTrip(db, { name: 'Trip 1' });
    const trip2 = await seedTrip(db, { name: 'Trip 2' });
    const place = await placeRepository.create(TEST_USER_ID, trip1.id, city.id);

    const result = await placeRepository.delete(TEST_USER_ID, trip2.id, place.id);
    expect(result).toBe(false);
  });

  it('throws NotFoundError when trip does not exist', async () => {
    await expect(placeRepository.delete(TEST_USER_ID, 99999, 1)).rejects.toThrow(NotFoundError);
  });

  it('throws LockError when trip is locked (write-guard)', async () => {
    const db = testDb!;
    const city = await seedCity(db, 'DE', 'Hamburg');
    const trip = await seedTrip(db);
    const place = await placeRepository.create(TEST_USER_ID, trip.id, city.id);

    // Lock the trip
    const { eq } = await import('drizzle-orm');
    await db.update(schema.trips).set({ status: 'locked' }).where(eq(schema.trips.id, trip.id));

    await expect(placeRepository.delete(TEST_USER_ID, trip.id, place.id)).rejects.toThrow(
      LockError,
    );
  });
});

// ----------------------------------------------------------------
// updateDates
// ----------------------------------------------------------------

describe('placeRepository.updateDates', () => {
  it('updates arrived_on and departed_on on an existing place', async () => {
    const db = testDb!;
    const city = await seedCity(db, 'FR', 'Tours');
    const trip = await seedTrip(db);
    const place = await placeRepository.create(TEST_USER_ID, trip.id, city.id);

    const result = await placeRepository.updateDates(
      TEST_USER_ID,
      trip.id,
      place.id,
      '2026-07-10',
      '2026-07-15',
    );

    expect(result.id).toBe(place.id);
    expect(result.arrivedOn).toBe('2026-07-10');
    expect(result.departedOn).toBe('2026-07-15');
  });

  it('clears dates when null is passed', async () => {
    const db = testDb!;
    const city = await seedCity(db, 'FR', 'Angers');
    const trip = await seedTrip(db);
    const place = await placeRepository.create(
      TEST_USER_ID,
      trip.id,
      city.id,
      '2026-07-10',
      '2026-07-15',
    );

    const result = await placeRepository.updateDates(TEST_USER_ID, trip.id, place.id, null, null);

    expect(result.arrivedOn).toBeNull();
    expect(result.departedOn).toBeNull();
  });

  it('throws NotFoundError when place does not exist', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);

    await expect(
      placeRepository.updateDates(TEST_USER_ID, trip.id, 99999, '2026-07-10', null),
    ).rejects.toThrow(NotFoundError);
  });

  it('throws NotFoundError when trip does not exist', async () => {
    await expect(
      placeRepository.updateDates(TEST_USER_ID, 99999, 1, '2026-07-10', null),
    ).rejects.toThrow(NotFoundError);
  });

  it('throws LockError when trip is locked', async () => {
    const db = testDb!;
    const city = await seedCity(db, 'FR', 'Reims');
    const trip = await seedTrip(db);
    const place = await placeRepository.create(TEST_USER_ID, trip.id, city.id);

    const { eq } = await import('drizzle-orm');
    await db.update(schema.trips).set({ status: 'locked' }).where(eq(schema.trips.id, trip.id));

    await expect(
      placeRepository.updateDates(TEST_USER_ID, trip.id, place.id, '2026-07-10', null),
    ).rejects.toThrow(LockError);
  });
});
