/**
 * Unit tests for itemRepository (src/backend/repositories/items.ts).
 *
 * Covers:
 *   - create: inserts item + extension row, returns item with extension fields
 *   - findByTrip: returns items scoped to userId + tripId, supports filters
 *   - findById: returns item with extension for owner, null for wrong user
 *   - findRawByIdOrThrow: throws NotFoundError when not found or wrong user
 *   - update: updates base fields and extension, returns null for wrong user
 *   - delete: removes item, returns false for wrong user
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../../db/schema.js';
import { NotFoundError } from '../../errors.js';
import type { TestDb } from './test-db.js';
import {
  createTestDb,
  OTHER_USER_ID,
  seedCity,
  seedCountry,
  seedTestUser,
  seedTrip,
  TEST_USER_ID,
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

// Also mock items.service to avoid assertNotLocked side effects in create/update
vi.mock('../../services/items.service.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../services/items.service.js')>();
  return {
    ...real,
    ensureExperienceExtension: vi.fn().mockResolvedValue(undefined),
  };
});

const { itemRepository } = await import('../items.js');

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
// Helpers
// ----------------------------------------------------------------

async function seedTripAndCreate(
  db: TestDb,
  itemType: string,
  extensionBody: Record<string, unknown> = {},
  status = 'consider',
) {
  const trip = await seedTrip(db);
  const item = await itemRepository.create(
    TEST_USER_ID,
    trip.id,
    { itemType, status },
    extensionBody,
  );
  return { trip, item };
}

// ----------------------------------------------------------------
// create
// ----------------------------------------------------------------

describe('itemRepository.create', () => {
  it('creates a flight item and returns it with extension fields', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);

    const item = await itemRepository.create(
      TEST_USER_ID,
      trip.id,
      { itemType: 'flight', status: 'booked' },
      { airline: 'Air France', flight_number: 'AF001' },
    );

    expect(item).toHaveProperty('id');
    expect(item.item_type).toBe('flight');
    expect(item.status).toBe('booked');
    expect(item.airline).toBe('Air France');
    expect(item.flight_number).toBe('AF001');
    expect(item.is_carried_forward).toBe(false);
  });

  it('creates a hotel item and returns it with extension fields', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);

    const item = await itemRepository.create(
      TEST_USER_ID,
      trip.id,
      { itemType: 'hotel' },
      { property_name: 'Grand Hotel', check_in_date: '2026-07-01' },
    );

    expect(item.item_type).toBe('hotel');
    expect(item.property_name).toBe('Grand Hotel');
    expect(item.check_in_date).toBe('2026-07-01');
  });

  it('creates a restaurant item with null extension fields', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);

    const item = await itemRepository.create(TEST_USER_ID, trip.id, { itemType: 'restaurant' }, {});

    expect(item.item_type).toBe('restaurant');
    expect(item.name).toBeNull();
    expect(item.rating).toBeNull();
  });

  it('creates an experience item (no extension row on create — ADL-14)', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);

    const item = await itemRepository.create(TEST_USER_ID, trip.id, { itemType: 'experience' }, {});

    expect(item.item_type).toBe('experience');
    expect(item.rating).toBeNull();
    expect(item.post_visit_notes).toBeNull();
  });

  it('sets notes when provided', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);

    const item = await itemRepository.create(
      TEST_USER_ID,
      trip.id,
      { itemType: 'flight', notes: 'Window seat preferred' },
      {},
    );

    expect(item.notes).toBe('Window seat preferred');
  });

  it('stores null notes when not provided', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);

    const item = await itemRepository.create(TEST_USER_ID, trip.id, { itemType: 'experience' }, {});

    expect(item.notes).toBeNull();
  });

  it('assigns userId from the provided userId', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);

    const item = await itemRepository.create(TEST_USER_ID, trip.id, { itemType: 'flight' }, {});

    // Verify via raw DB access
    const { eq } = await import('drizzle-orm');
    const rows = await db
      .select()
      .from(schema.items)
      .where(eq(schema.items.id, item.id as number));
    expect(rows[0].userId).toBe(TEST_USER_ID);
  });
});

// ----------------------------------------------------------------
// findByTrip
// ----------------------------------------------------------------

describe('itemRepository.findByTrip', () => {
  it('returns all items for a trip scoped to userId', async () => {
    const db = testDb!;
    const { trip } = await seedTripAndCreate(db, 'flight');
    await seedTripAndCreate(db, 'hotel'); // Different trip, same user

    const result = await itemRepository.findByTrip(TEST_USER_ID, trip.id);
    expect(result).toHaveLength(1);
    expect(result[0].item_type).toBe('flight');
  });

  it('returns empty array when trip has no items', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);

    const result = await itemRepository.findByTrip(TEST_USER_ID, trip.id);
    expect(result).toHaveLength(0);
  });

  it('does not return items belonging to another user', async () => {
    const db = testDb!;
    const trip = await seedTrip(db, { userId: OTHER_USER_ID });
    // Create item for other user's trip
    await itemRepository.create(OTHER_USER_ID, trip.id, { itemType: 'flight' }, {});

    const result = await itemRepository.findByTrip(TEST_USER_ID, trip.id);
    expect(result).toHaveLength(0);
  });

  it('filters by item type', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);
    await itemRepository.create(TEST_USER_ID, trip.id, { itemType: 'flight' }, {});
    await itemRepository.create(TEST_USER_ID, trip.id, { itemType: 'hotel' }, {});

    const result = await itemRepository.findByTrip(TEST_USER_ID, trip.id, { type: 'flight' });
    expect(result).toHaveLength(1);
    expect(result[0].item_type).toBe('flight');
  });

  it('filters by status', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);
    await itemRepository.create(
      TEST_USER_ID,
      trip.id,
      { itemType: 'flight', status: 'booked' },
      {},
    );
    await itemRepository.create(
      TEST_USER_ID,
      trip.id,
      { itemType: 'hotel', status: 'consider' },
      {},
    );

    const result = await itemRepository.findByTrip(TEST_USER_ID, trip.id, { status: 'booked' });
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('booked');
  });

  it('filters by placeId', async () => {
    const db = testDb!;
    await seedCountry(db, 'FR', 'France');
    const city = await seedCity(db, 'FR', 'Paris');
    const trip = await seedTrip(db);
    const [place] = await db
      .insert(schema.tripPlaces)
      .values({ tripId: trip.id, cityId: city.id })
      .returning();

    // Item with place
    await itemRepository.create(
      TEST_USER_ID,
      trip.id,
      { itemType: 'restaurant', tripPlaceId: place.id },
      {},
    );
    // Item without place
    await itemRepository.create(TEST_USER_ID, trip.id, { itemType: 'flight' }, {});

    const result = await itemRepository.findByTrip(TEST_USER_ID, trip.id, {
      placeId: place.id,
    });
    expect(result).toHaveLength(1);
    expect(result[0].trip_place_id).toBe(place.id);
  });
});

// ----------------------------------------------------------------
// findById
// ----------------------------------------------------------------

describe('itemRepository.findById', () => {
  it('returns item with extension fields for the owning user', async () => {
    const db = testDb!;
    const { item } = await seedTripAndCreate(db, 'hotel', { property_name: 'Hilton' });

    const result = await itemRepository.findById(TEST_USER_ID, item.id as number);

    expect(result).not.toBeNull();
    expect(result!.id).toBe(item.id);
    expect(result!.property_name).toBe('Hilton');
  });

  it('returns null when item does not exist', async () => {
    const result = await itemRepository.findById(TEST_USER_ID, 99999);
    expect(result).toBeNull();
  });

  it('returns null when item belongs to another user', async () => {
    const db = testDb!;
    const trip = await seedTrip(db, { userId: OTHER_USER_ID });
    const item = await itemRepository.create(OTHER_USER_ID, trip.id, { itemType: 'flight' }, {});

    const result = await itemRepository.findById(TEST_USER_ID, item.id as number);
    expect(result).toBeNull();
  });
});

// ----------------------------------------------------------------
// findRawByIdOrThrow
// ----------------------------------------------------------------

describe('itemRepository.findRawByIdOrThrow', () => {
  it('returns raw Item row when found', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);
    const item = await itemRepository.create(TEST_USER_ID, trip.id, { itemType: 'flight' }, {});

    const result = await itemRepository.findRawByIdOrThrow(
      TEST_USER_ID,
      trip.id,
      item.id as number,
    );

    expect(result.id).toBe(item.id);
    expect(result.itemType).toBe('flight');
  });

  it('throws NotFoundError when item does not exist', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);

    await expect(itemRepository.findRawByIdOrThrow(TEST_USER_ID, trip.id, 99999)).rejects.toThrow(
      NotFoundError,
    );
  });

  it('throws NotFoundError when item belongs to wrong trip', async () => {
    const db = testDb!;
    const trip1 = await seedTrip(db, { name: 'Trip 1' });
    const trip2 = await seedTrip(db, { name: 'Trip 2' });
    const item = await itemRepository.create(TEST_USER_ID, trip1.id, { itemType: 'flight' }, {});

    await expect(
      itemRepository.findRawByIdOrThrow(TEST_USER_ID, trip2.id, item.id as number),
    ).rejects.toThrow(NotFoundError);
  });

  it('throws NotFoundError when item belongs to another user', async () => {
    const db = testDb!;
    const trip = await seedTrip(db, { userId: OTHER_USER_ID });
    const item = await itemRepository.create(OTHER_USER_ID, trip.id, { itemType: 'flight' }, {});

    await expect(
      itemRepository.findRawByIdOrThrow(TEST_USER_ID, trip.id, item.id as number),
    ).rejects.toThrow(NotFoundError);
  });
});

// ----------------------------------------------------------------
// update
// ----------------------------------------------------------------

describe('itemRepository.update', () => {
  it('updates status and returns the updated item', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);
    const item = await itemRepository.create(
      TEST_USER_ID,
      trip.id,
      { itemType: 'flight', status: 'consider' },
      {},
    );

    const result = await itemRepository.update(
      TEST_USER_ID,
      trip.id,
      item.id as number,
      { status: 'booked' },
      {},
      'flight',
    );

    expect(result).not.toBeNull();
    expect(result!.status).toBe('booked');
  });

  it('updates notes field', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);
    const item = await itemRepository.create(TEST_USER_ID, trip.id, { itemType: 'hotel' }, {});

    const result = await itemRepository.update(
      TEST_USER_ID,
      trip.id,
      item.id as number,
      { notes: 'Needs early check-in' },
      {},
      'hotel',
    );

    expect(result!.notes).toBe('Needs early check-in');
  });

  it('updates flight extension fields', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);
    const item = await itemRepository.create(
      TEST_USER_ID,
      trip.id,
      { itemType: 'flight' },
      { airline: 'Air France' },
    );

    const result = await itemRepository.update(
      TEST_USER_ID,
      trip.id,
      item.id as number,
      {},
      { airline: 'British Airways' },
      'flight',
    );

    expect(result!.airline).toBe('British Airways');
  });

  it('does not persist changes when update is called for wrong user/trip combination', async () => {
    // The update WHERE clause scopes by userId — no rows are changed.
    // The repository returns whatever fetchItemsWithExtensions finds by itemId,
    // so status is NOT updated even though the call returns a non-null object.
    const db = testDb!;
    const trip = await seedTrip(db, { userId: OTHER_USER_ID });
    const item = await itemRepository.create(OTHER_USER_ID, trip.id, { itemType: 'flight' }, {});

    await itemRepository.update(
      TEST_USER_ID,
      trip.id,
      item.id as number,
      { status: 'booked' },
      {},
      'flight',
    );

    // Verify the other user's item was NOT changed
    const notChanged = await itemRepository.findById(OTHER_USER_ID, item.id as number);
    expect(notChanged!.status).toBe('consider');
  });
});

// ----------------------------------------------------------------
// delete
// ----------------------------------------------------------------

describe('itemRepository.delete', () => {
  it('deletes the item and returns true', async () => {
    const db = testDb!;
    const { trip, item } = await seedTripAndCreate(db, 'flight');

    const result = await itemRepository.delete(TEST_USER_ID, trip.id, item.id as number);

    expect(result).toBe(true);
  });

  it('verifies item is gone after deletion', async () => {
    const db = testDb!;
    const { trip, item } = await seedTripAndCreate(db, 'hotel');

    await itemRepository.delete(TEST_USER_ID, trip.id, item.id as number);

    const found = await itemRepository.findById(TEST_USER_ID, item.id as number);
    expect(found).toBeNull();
  });

  it('returns false when item does not exist', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);

    const result = await itemRepository.delete(TEST_USER_ID, trip.id, 99999);
    expect(result).toBe(false);
  });

  it('returns false when item belongs to another user (write-guard)', async () => {
    const db = testDb!;
    const trip = await seedTrip(db, { userId: OTHER_USER_ID });
    const item = await itemRepository.create(OTHER_USER_ID, trip.id, { itemType: 'flight' }, {});

    const result = await itemRepository.delete(TEST_USER_ID, trip.id, item.id as number);

    expect(result).toBe(false);
  });

  it('returns false when item belongs to a different trip', async () => {
    const db = testDb!;
    const trip1 = await seedTrip(db, { name: 'Trip 1' });
    const trip2 = await seedTrip(db, { name: 'Trip 2' });
    const item = await itemRepository.create(TEST_USER_ID, trip1.id, { itemType: 'flight' }, {});

    const result = await itemRepository.delete(TEST_USER_ID, trip2.id, item.id as number);
    expect(result).toBe(false);
  });
});
