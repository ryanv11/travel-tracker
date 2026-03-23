/**
 * Unit tests for tripRepository (src/backend/repositories/trips.ts).
 *
 * Uses an in-memory SQLite database (same pattern as route integration tests).
 * The getDb() singleton is replaced via vi.mock before any imports run.
 *
 * Covers:
 *   - findAll: returns trips for a user, respects status/category/activity/country filters
 *   - findById: returns trip for owner, null for wrong user
 *   - findByIdOrThrow: throws NotFoundError when not found
 *   - create: inserts a new trip and returns it
 *   - update: updates fields, returns null for wrong user
 *   - delete: removes trip, returns false for wrong user
 *   - getAssociations: returns categories/companions/activities
 *   - replaceAssociations: replace and clear collections
 *   - getPlaces: returns place rows with joined city data
 *   - getCountries / setCountries / addCountries / removeCountry
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../../db/schema.js';
import { NotFoundError } from '../../errors.js';
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
// Mock getDb — must be declared before any module that imports it.
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

const { tripRepository } = await import('../trips.js');

// ----------------------------------------------------------------
// Test setup
// ----------------------------------------------------------------

beforeEach(async () => {
  testDb = await createTestDb();
  await seedTestUser(testDb, TEST_USER_ID);
  await seedTestUser(testDb, OTHER_USER_ID, 'user_other');
});

afterEach(() => {
  testDb = null;
});

// ----------------------------------------------------------------
// findAll
// ----------------------------------------------------------------

describe('tripRepository.findAll', () => {
  it('returns all trips for a user ordered by startDate desc', async () => {
    const db = testDb!;
    await seedTrip(db, { name: 'Older Trip', startDate: '2025-01-01', endDate: '2025-01-10' });
    await seedTrip(db, { name: 'Newer Trip', startDate: '2026-06-01', endDate: '2026-06-10' });

    const result = await tripRepository.findAll(TEST_USER_ID);

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Newer Trip');
    expect(result[1].name).toBe('Older Trip');
  });

  it('returns empty array when user has no trips', async () => {
    const result = await tripRepository.findAll(TEST_USER_ID);
    expect(result).toHaveLength(0);
  });

  it('does not return trips owned by another user', async () => {
    const db = testDb!;
    await seedTrip(db, { userId: OTHER_USER_ID });

    const result = await tripRepository.findAll(TEST_USER_ID);
    expect(result).toHaveLength(0);
  });

  it('filters by status', async () => {
    const db = testDb!;
    await seedTrip(db, { name: 'Planning', status: 'planning' });
    await seedTrip(db, { name: 'Active', status: 'active' });

    const result = await tripRepository.findAll(TEST_USER_ID, { status: 'active' });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Active');
  });

  it('filters by category_id', async () => {
    const db = testDb!;
    const trip = await seedTrip(db, { name: 'Categorised Trip' });
    await seedTrip(db, { name: 'Uncategorised Trip' });

    const [cat] = await db
      .insert(schema.tripCategories)
      .values({ name: 'Adventure', isActive: 1 })
      .returning();
    await db.insert(schema.tripCategoriesMap).values({ tripId: trip.id, categoryId: cat.id });

    const result = await tripRepository.findAll(TEST_USER_ID, { category_id: cat.id });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(trip.id);
  });

  it('filters by country via trip_countries junction', async () => {
    const db = testDb!;
    await seedCountry(db, 'JP', 'Japan');
    const jpTrip = await seedTrip(db, { name: 'Japan Trip' });
    await seedTrip(db, { name: 'Other Trip' });
    await db.insert(schema.tripCountries).values({ tripId: jpTrip.id, countryCode: 'JP' });

    const result = await tripRepository.findAll(TEST_USER_ID, { country: 'JP' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(jpTrip.id);
  });
});

// ----------------------------------------------------------------
// findById
// ----------------------------------------------------------------

describe('tripRepository.findById', () => {
  it('returns the trip for the owning user', async () => {
    const db = testDb!;
    const trip = await seedTrip(db, { name: 'My Trip' });

    const result = await tripRepository.findById(TEST_USER_ID, trip.id);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(trip.id);
    expect(result!.name).toBe('My Trip');
  });

  it('returns null when trip does not exist', async () => {
    const result = await tripRepository.findById(TEST_USER_ID, 99999);
    expect(result).toBeNull();
  });

  it('returns null when trip belongs to another user', async () => {
    const db = testDb!;
    const trip = await seedTrip(db, { userId: OTHER_USER_ID });

    const result = await tripRepository.findById(TEST_USER_ID, trip.id);
    expect(result).toBeNull();
  });
});

// ----------------------------------------------------------------
// findByIdOrThrow
// ----------------------------------------------------------------

describe('tripRepository.findByIdOrThrow', () => {
  it('returns the trip when found', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);

    const result = await tripRepository.findByIdOrThrow(TEST_USER_ID, trip.id);
    expect(result.id).toBe(trip.id);
  });

  it('throws NotFoundError when trip does not exist', async () => {
    await expect(tripRepository.findByIdOrThrow(TEST_USER_ID, 99999)).rejects.toThrow(
      NotFoundError,
    );
  });

  it('throws NotFoundError when trip belongs to another user', async () => {
    const db = testDb!;
    const trip = await seedTrip(db, { userId: OTHER_USER_ID });

    await expect(tripRepository.findByIdOrThrow(TEST_USER_ID, trip.id)).rejects.toThrow(
      NotFoundError,
    );
  });
});

// ----------------------------------------------------------------
// create
// ----------------------------------------------------------------

describe('tripRepository.create', () => {
  it('creates a trip and returns the inserted row', async () => {
    const result = await tripRepository.create(TEST_USER_ID, {
      name: 'New Trip',
      startDate: '2026-07-01',
      endDate: '2026-07-15',
    });

    expect(result.id).toBeTypeOf('number');
    expect(result.name).toBe('New Trip');
    expect(result.startDate).toBe('2026-07-01');
    expect(result.endDate).toBe('2026-07-15');
    expect(result.userId).toBe(TEST_USER_ID);
    expect(result.status).toBe('planning');
  });

  it('stores a null photoAlbumRef when not provided', async () => {
    const result = await tripRepository.create(TEST_USER_ID, {
      name: 'No Album',
      startDate: '2026-01-01',
      endDate: '2026-01-07',
    });

    expect(result.photoAlbumRef).toBeNull();
  });

  it('stores a photoAlbumRef when provided', async () => {
    const result = await tripRepository.create(TEST_USER_ID, {
      name: 'Has Album',
      startDate: '2026-01-01',
      endDate: '2026-01-07',
      photoAlbumRef: 'https://photos.example.com/album1',
    });

    expect(result.photoAlbumRef).toBe('https://photos.example.com/album1');
  });

  it('is retrievable via findById after creation', async () => {
    const created = await tripRepository.create(TEST_USER_ID, {
      name: 'Retrievable',
      startDate: '2026-01-01',
      endDate: '2026-01-07',
    });

    const found = await tripRepository.findById(TEST_USER_ID, created.id);
    expect(found).not.toBeNull();
    expect(found!.name).toBe('Retrievable');
  });
});

// ----------------------------------------------------------------
// update
// ----------------------------------------------------------------

describe('tripRepository.update', () => {
  it('updates name and returns the updated trip', async () => {
    const db = testDb!;
    const trip = await seedTrip(db, { name: 'Old Name' });

    const result = await tripRepository.update(TEST_USER_ID, trip.id, { name: 'New Name' });

    expect(result).not.toBeNull();
    expect(result!.name).toBe('New Name');
  });

  it('updates status field', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);

    const result = await tripRepository.update(TEST_USER_ID, trip.id, { status: 'active' });

    expect(result!.status).toBe('active');
  });

  it('returns null when trip does not exist', async () => {
    const result = await tripRepository.update(TEST_USER_ID, 99999, { name: 'Ghost' });
    expect(result).toBeNull();
  });

  it('returns null when trip belongs to another user (write-guard)', async () => {
    const db = testDb!;
    const trip = await seedTrip(db, { userId: OTHER_USER_ID });

    const result = await tripRepository.update(TEST_USER_ID, trip.id, { name: 'Stolen' });
    expect(result).toBeNull();
  });

  it('updates startDate and endDate correctly', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);

    const result = await tripRepository.update(TEST_USER_ID, trip.id, {
      startDate: '2027-01-01',
      endDate: '2027-01-31',
    });

    expect(result!.startDate).toBe('2027-01-01');
    expect(result!.endDate).toBe('2027-01-31');
  });

  it('clears photoAlbumRef when null is passed', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);
    // Set a value first
    await tripRepository.update(TEST_USER_ID, trip.id, {
      photoAlbumRef: 'https://example.com/album',
    });

    const result = await tripRepository.update(TEST_USER_ID, trip.id, { photoAlbumRef: null });
    expect(result!.photoAlbumRef).toBeNull();
  });
});

// ----------------------------------------------------------------
// delete
// ----------------------------------------------------------------

describe('tripRepository.delete', () => {
  it('deletes the trip and returns true', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);

    const result = await tripRepository.delete(TEST_USER_ID, trip.id);

    expect(result).toBe(true);
    const found = await tripRepository.findById(TEST_USER_ID, trip.id);
    expect(found).toBeNull();
  });

  it('returns false when trip does not exist', async () => {
    const result = await tripRepository.delete(TEST_USER_ID, 99999);
    expect(result).toBe(false);
  });

  it('returns false when trip belongs to another user (write-guard)', async () => {
    const db = testDb!;
    const trip = await seedTrip(db, { userId: OTHER_USER_ID });

    const result = await tripRepository.delete(TEST_USER_ID, trip.id);

    expect(result).toBe(false);
    // Verify the other user's trip was NOT deleted
    const found = await tripRepository.findById(OTHER_USER_ID, trip.id);
    expect(found).not.toBeNull();
  });
});

// ----------------------------------------------------------------
// getAssociations
// ----------------------------------------------------------------

describe('tripRepository.getAssociations', () => {
  it('returns empty arrays when no associations exist', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);

    const result = await tripRepository.getAssociations(trip.id);

    expect(result.categories).toHaveLength(0);
    expect(result.companions).toHaveLength(0);
    expect(result.activities).toHaveLength(0);
  });

  it('returns the correct category', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);
    const [cat] = await db
      .insert(schema.tripCategories)
      .values({ name: 'Beach', isActive: 1 })
      .returning();
    await db.insert(schema.tripCategoriesMap).values({ tripId: trip.id, categoryId: cat.id });

    const result = await tripRepository.getAssociations(trip.id);

    expect(result.categories).toHaveLength(1);
    expect(result.categories[0].name).toBe('Beach');
  });

  it('returns the correct companion', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);
    const [comp] = await db
      .insert(schema.companions)
      .values({ name: 'Alice', isActive: 1 })
      .returning();
    await db.insert(schema.tripCompanionsMap).values({ tripId: trip.id, companionId: comp.id });

    const result = await tripRepository.getAssociations(trip.id);

    expect(result.companions).toHaveLength(1);
    expect(result.companions[0].name).toBe('Alice');
  });
});

// ----------------------------------------------------------------
// replaceAssociations
//
// replaceAssociations uses db.batch() internally (not db.transaction()),
// so it is safe to test with the :memory: libSQL client.
// ----------------------------------------------------------------

describe('tripRepository.replaceAssociations', () => {
  it('sets categories when provided', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);
    const [cat] = await db
      .insert(schema.tripCategories)
      .values({ name: 'Mountains', isActive: 1 })
      .returning();

    await tripRepository.replaceAssociations(trip.id, [cat.id]);

    const result = await tripRepository.getAssociations(trip.id);
    expect(result.categories).toHaveLength(1);
    expect(result.categories[0].id).toBe(cat.id);
  });

  it('clears categories when empty array is passed', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);
    const [cat] = await db
      .insert(schema.tripCategories)
      .values({ name: 'City', isActive: 1 })
      .returning();
    await db.insert(schema.tripCategoriesMap).values({ tripId: trip.id, categoryId: cat.id });

    await tripRepository.replaceAssociations(trip.id, []);

    const result = await tripRepository.getAssociations(trip.id);
    expect(result.categories).toHaveLength(0);
  });

  it('leaves existing associations unchanged when undefined is passed', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);
    const [cat] = await db
      .insert(schema.tripCategories)
      .values({ name: 'Desert', isActive: 1 })
      .returning();
    await db.insert(schema.tripCategoriesMap).values({ tripId: trip.id, categoryId: cat.id });

    // Pass undefined for categories — should leave them intact
    await tripRepository.replaceAssociations(trip.id, undefined, []);

    const result = await tripRepository.getAssociations(trip.id);
    expect(result.categories).toHaveLength(1);
  });
});

// ----------------------------------------------------------------
// getPlaces
// ----------------------------------------------------------------

describe('tripRepository.getPlaces', () => {
  it('returns empty array when trip has no places', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);

    const result = await tripRepository.getPlaces(trip.id);
    expect(result).toHaveLength(0);
  });

  it('returns place with joined city data', async () => {
    const db = testDb!;
    await seedCountry(db, 'IT', 'Italy');
    const city = await seedCity(db, 'IT', 'Rome');
    const trip = await seedTrip(db);
    await db.insert(schema.tripPlaces).values({ tripId: trip.id, cityId: city.id });

    const result = await tripRepository.getPlaces(trip.id);

    expect(result).toHaveLength(1);
    expect(result[0].cityId).toBe(city.id);
    expect(result[0].cityName).toBe('Rome');
    expect(result[0].cityCountryCode).toBe('IT');
    expect(result[0].cityCountryName).toBe('Italy');
  });
});

// ----------------------------------------------------------------
// getCountries / setCountries / addCountries / removeCountry
// ----------------------------------------------------------------

describe('tripRepository country management', () => {
  beforeEach(async () => {
    await seedCountry(testDb!, 'JP', 'Japan');
    await seedCountry(testDb!, 'FR', 'France');
    await seedCountry(testDb!, 'DE', 'Germany');
  });

  it('getCountries returns empty array when no countries set', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);

    const result = await tripRepository.getCountries(trip.id);
    expect(result).toHaveLength(0);
  });

  it('setCountries inserts country associations', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);

    await tripRepository.setCountries(trip.id, ['JP', 'FR']);

    const result = await tripRepository.getCountries(trip.id);
    const codes = result.map((r) => r.country_code);
    expect(codes).toContain('JP');
    expect(codes).toContain('FR');
    expect(codes).toHaveLength(2);
  });

  it('setCountries replaces existing countries', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);
    await db.insert(schema.tripCountries).values({ tripId: trip.id, countryCode: 'JP' });

    await tripRepository.setCountries(trip.id, ['DE']);

    const result = await tripRepository.getCountries(trip.id);
    const codes = result.map((r) => r.country_code);
    expect(codes).toContain('DE');
    expect(codes).not.toContain('JP');
    expect(codes).toHaveLength(1);
  });

  it('setCountries with empty array clears all countries', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);
    await db.insert(schema.tripCountries).values({ tripId: trip.id, countryCode: 'JP' });

    await tripRepository.setCountries(trip.id, []);

    const result = await tripRepository.getCountries(trip.id);
    expect(result).toHaveLength(0);
  });

  it('addCountries adds new country associations', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);
    await db.insert(schema.tripCountries).values({ tripId: trip.id, countryCode: 'JP' });

    await tripRepository.addCountries(trip.id, ['FR']);

    const result = await tripRepository.getCountries(trip.id);
    const codes = result.map((r) => r.country_code);
    expect(codes).toContain('JP');
    expect(codes).toContain('FR');
  });

  it('addCountries is idempotent (no error on duplicate)', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);
    await db.insert(schema.tripCountries).values({ tripId: trip.id, countryCode: 'JP' });

    await expect(tripRepository.addCountries(trip.id, ['JP'])).resolves.not.toThrow();

    const result = await tripRepository.getCountries(trip.id);
    expect(result.filter((r) => r.country_code === 'JP')).toHaveLength(1);
  });

  it('removeCountry removes the specified country and returns true', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);
    await db.insert(schema.tripCountries).values([
      { tripId: trip.id, countryCode: 'JP' },
      { tripId: trip.id, countryCode: 'FR' },
    ]);

    const result = await tripRepository.removeCountry(trip.id, 'JP');

    expect(result).toBe(true);
    const countries = await tripRepository.getCountries(trip.id);
    const codes = countries.map((r) => r.country_code);
    expect(codes).not.toContain('JP');
    expect(codes).toContain('FR');
  });

  it('removeCountry returns false when country is not on trip', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);

    const result = await tripRepository.removeCountry(trip.id, 'JP');
    expect(result).toBe(false);
  });

  it('getCountries returns country names along with codes', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);
    await db.insert(schema.tripCountries).values({ tripId: trip.id, countryCode: 'JP' });

    const result = await tripRepository.getCountries(trip.id);

    expect(result[0].name).toBe('Japan');
    expect(result[0].country_code).toBe('JP');
  });
});
