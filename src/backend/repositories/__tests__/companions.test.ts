/**
 * Unit tests for companionRepository (src/backend/repositories/companions.ts).
 *
 * ADL-28 (AD-08): companions are per-user. Covers:
 *   - findAll / findActive: scoped to userId, ordered by name
 *   - findById: null for wrong user or missing id
 *   - create: inserts scoped to userId
 *   - update: scoped write-guard (returns null for wrong user)
 *   - deactivate: soft-delete via isActive = 0
 *   - validateOwnership: the ADL-28 R4 cross-user guard
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createTestDb,
  OTHER_USER_ID,
  seedCompanion,
  seedTestUser,
  TEST_USER_ID,
  type TestDb,
} from './test-db.js';

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

const { companionRepository } = await import('../companions.js');

beforeEach(async () => {
  testDb = await createTestDb();
  await seedTestUser(testDb, TEST_USER_ID);
  await seedTestUser(testDb, OTHER_USER_ID, 'user_other');
});

afterEach(() => {
  testDb = null;
});

describe('companionRepository.findAll', () => {
  it('returns companions for the given user, ordered by name', async () => {
    const db = testDb!;
    await seedCompanion(db, { name: 'Zebra' });
    await seedCompanion(db, { name: 'Alpha' });

    const result = await companionRepository.findAll(TEST_USER_ID);
    expect(result.map((c) => c.name)).toEqual(['Alpha', 'Zebra']);
  });

  it('does not return another user’s companions', async () => {
    const db = testDb!;
    await seedCompanion(db, { userId: OTHER_USER_ID, name: 'Not Mine' });

    const result = await companionRepository.findAll(TEST_USER_ID);
    expect(result).toHaveLength(0);
  });

  it('includes inactive companions', async () => {
    const db = testDb!;
    await seedCompanion(db, { name: 'Inactive', isActive: 0 });

    const result = await companionRepository.findAll(TEST_USER_ID);
    expect(result).toHaveLength(1);
  });
});

describe('companionRepository.findActive', () => {
  it('excludes inactive companions', async () => {
    const db = testDb!;
    await seedCompanion(db, { name: 'Active', isActive: 1 });
    await seedCompanion(db, { name: 'Inactive', isActive: 0 });

    const result = await companionRepository.findActive(TEST_USER_ID);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Active');
  });
});

describe('companionRepository.findById', () => {
  it('returns the companion when owned by userId', async () => {
    const db = testDb!;
    const comp = await seedCompanion(db);

    const result = await companionRepository.findById(TEST_USER_ID, comp.id);
    expect(result?.id).toBe(comp.id);
  });

  it('returns null when owned by a different user', async () => {
    const db = testDb!;
    const comp = await seedCompanion(db, { userId: OTHER_USER_ID });

    const result = await companionRepository.findById(TEST_USER_ID, comp.id);
    expect(result).toBeNull();
  });

  it('returns null when the id does not exist', async () => {
    const result = await companionRepository.findById(TEST_USER_ID, 99999);
    expect(result).toBeNull();
  });
});

describe('companionRepository.create', () => {
  it('creates a companion scoped to userId', async () => {
    const created = await companionRepository.create(TEST_USER_ID, 'Partner');
    expect(created.userId).toBe(TEST_USER_ID);
    expect(created.name).toBe('Partner');
    expect(created.isActive).toBe(1);
  });

  it('allows the same name across two different users (BRD-AD08)', async () => {
    await companionRepository.create(TEST_USER_ID, 'Partner');
    const other = await companionRepository.create(OTHER_USER_ID, 'Partner');
    expect(other.name).toBe('Partner');

    const mine = await companionRepository.findAll(TEST_USER_ID);
    const theirs = await companionRepository.findAll(OTHER_USER_ID);
    expect(mine).toHaveLength(1);
    expect(theirs).toHaveLength(1);
  });
});

describe('companionRepository.update', () => {
  it('updates name for a companion owned by userId', async () => {
    const db = testDb!;
    const comp = await seedCompanion(db, { name: 'Old Name' });

    const updated = await companionRepository.update(TEST_USER_ID, comp.id, { name: 'New Name' });
    expect(updated?.name).toBe('New Name');
  });

  it('returns null (write-guard) when the companion belongs to a different user', async () => {
    const db = testDb!;
    const comp = await seedCompanion(db, { userId: OTHER_USER_ID, name: 'Theirs' });

    const updated = await companionRepository.update(TEST_USER_ID, comp.id, { name: 'Hijacked' });
    expect(updated).toBeNull();

    // Verify the other user's row was not touched
    const stillTheirs = await companionRepository.findById(OTHER_USER_ID, comp.id);
    expect(stillTheirs?.name).toBe('Theirs');
  });
});

describe('companionRepository.deactivate', () => {
  it('sets isActive to 0 for a companion owned by userId', async () => {
    const db = testDb!;
    const comp = await seedCompanion(db, { isActive: 1 });

    const result = await companionRepository.deactivate(TEST_USER_ID, comp.id);
    expect(result?.isActive).toBe(0);
  });

  it('returns null when the companion belongs to a different user', async () => {
    const db = testDb!;
    const comp = await seedCompanion(db, { userId: OTHER_USER_ID });

    const result = await companionRepository.deactivate(TEST_USER_ID, comp.id);
    expect(result).toBeNull();
  });
});

// ----------------------------------------------------------------
// validateOwnership — ADL-28 R4, the sole cross-user guard for
// trip_companions_map inserts (called from tripRepository.replaceAssociations)
// ----------------------------------------------------------------

describe('companionRepository.validateOwnership', () => {
  it('returns an empty array when all IDs belong to userId', async () => {
    const db = testDb!;
    const a = await seedCompanion(db, { name: 'A' });
    const b = await seedCompanion(db, { name: 'B' });

    const invalid = await companionRepository.validateOwnership(TEST_USER_ID, [a.id, b.id]);
    expect(invalid).toEqual([]);
  });

  it('returns the IDs that belong to a different user', async () => {
    const db = testDb!;
    const mine = await seedCompanion(db, { name: 'Mine' });
    const theirs = await seedCompanion(db, { userId: OTHER_USER_ID, name: 'Theirs' });

    const invalid = await companionRepository.validateOwnership(TEST_USER_ID, [mine.id, theirs.id]);
    expect(invalid).toEqual([theirs.id]);
  });

  it('returns IDs that do not exist at all', async () => {
    const invalid = await companionRepository.validateOwnership(TEST_USER_ID, [999999]);
    expect(invalid).toEqual([999999]);
  });

  it('returns an empty array for an empty input array', async () => {
    const invalid = await companionRepository.validateOwnership(TEST_USER_ID, []);
    expect(invalid).toEqual([]);
  });
});
