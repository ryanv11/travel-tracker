/**
 * Unit tests for shadingConfigRepository (src/backend/repositories/shadingConfig.ts).
 *
 * ADL-28 (AD-07): map shading config is per-user, lazily seeded on first
 * access. Covers:
 *   - findAll: lazy-seeds 6 default rows on first access, scoped to userId
 *   - findByStateKey: lazy-seeds + retries, scoped to userId
 *   - update: scoped write-guard (returns null for wrong stateKey/userId)
 *   - seedDefaults: idempotent (INSERT OR IGNORE)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAP_SHADING_CONFIG } from '../../db/seed-data.js';
import { createTestDb, OTHER_USER_ID, seedTestUser, TEST_USER_ID, type TestDb } from './test-db.js';

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

const { shadingConfigRepository } = await import('../shadingConfig.js');

beforeEach(async () => {
  testDb = await createTestDb();
  await seedTestUser(testDb, TEST_USER_ID);
  await seedTestUser(testDb, OTHER_USER_ID, 'user_other');
});

afterEach(() => {
  testDb = null;
});

describe('shadingConfigRepository.findAll', () => {
  it('lazily seeds and returns all 6 default rows on first access', async () => {
    const rows = await shadingConfigRepository.findAll(TEST_USER_ID);
    expect(rows).toHaveLength(MAP_SHADING_CONFIG.length);
    const stateKeys = rows.map((r) => r.stateKey).sort();
    expect(stateKeys).toEqual([...MAP_SHADING_CONFIG.map((c) => c.stateKey)].sort());
  });

  it('scopes rows to userId — two users each get their own 6 rows', async () => {
    await shadingConfigRepository.findAll(TEST_USER_ID);
    await shadingConfigRepository.findAll(OTHER_USER_ID);

    const mine = await shadingConfigRepository.findAll(TEST_USER_ID);
    const theirs = await shadingConfigRepository.findAll(OTHER_USER_ID);
    expect(mine).toHaveLength(6);
    expect(theirs).toHaveLength(6);
    expect(mine.every((r) => r.userId === TEST_USER_ID)).toBe(true);
    expect(theirs.every((r) => r.userId === OTHER_USER_ID)).toBe(true);
  });

  it('does not reseed (or duplicate) on a second call', async () => {
    await shadingConfigRepository.findAll(TEST_USER_ID);
    const rows = await shadingConfigRepository.findAll(TEST_USER_ID);
    expect(rows).toHaveLength(6);
  });

  it('a config change for one user is not visible in another user’s rows', async () => {
    await shadingConfigRepository.findAll(TEST_USER_ID);
    await shadingConfigRepository.update(TEST_USER_ID, 'active', { colorHex: '#000000' });

    const theirs = await shadingConfigRepository.findAll(OTHER_USER_ID);
    const theirActive = theirs.find((r) => r.stateKey === 'active');
    expect(theirActive?.colorHex).not.toBe('#000000');
  });
});

describe('shadingConfigRepository.findByStateKey', () => {
  it('lazily seeds defaults and returns the requested row', async () => {
    const row = await shadingConfigRepository.findByStateKey(TEST_USER_ID, 'planned');
    expect(row).not.toBeNull();
    expect(row!.stateKey).toBe('planned');
    expect(row!.userId).toBe(TEST_USER_ID);
  });

  it('returns null for an unknown stateKey even after seeding', async () => {
    const row = await shadingConfigRepository.findByStateKey(TEST_USER_ID, 'not_a_real_state');
    expect(row).toBeNull();
  });
});

describe('shadingConfigRepository.update', () => {
  it('updates displayName and colorHex for the caller’s row', async () => {
    await shadingConfigRepository.findAll(TEST_USER_ID); // seed first
    const updated = await shadingConfigRepository.update(TEST_USER_ID, 'active', {
      displayName: 'Currently travelling',
      colorHex: '#123456',
    });
    expect(updated?.displayName).toBe('Currently travelling');
    expect(updated?.colorHex).toBe('#123456');
  });

  it('returns null (write-guard) for a stateKey the user has no row for', async () => {
    // No findAll() call first — user has zero rows, so no row to update.
    const updated = await shadingConfigRepository.update(TEST_USER_ID, 'active', {
      colorHex: '#123456',
    });
    expect(updated).toBeNull();
  });

  it('does not affect another user’s row for the same stateKey', async () => {
    await shadingConfigRepository.findAll(TEST_USER_ID);
    await shadingConfigRepository.findAll(OTHER_USER_ID);

    await shadingConfigRepository.update(TEST_USER_ID, 'active', { colorHex: '#111111' });

    const theirs = await shadingConfigRepository.findByStateKey(OTHER_USER_ID, 'active');
    expect(theirs?.colorHex).not.toBe('#111111');
  });
});

describe('shadingConfigRepository.seedDefaults', () => {
  it('is idempotent — calling twice does not duplicate rows', async () => {
    await shadingConfigRepository.seedDefaults(TEST_USER_ID);
    await shadingConfigRepository.seedDefaults(TEST_USER_ID);

    const rows = await shadingConfigRepository.findAll(TEST_USER_ID);
    expect(rows).toHaveLength(6);
  });

  it('does not overwrite a value already customised by the user', async () => {
    await shadingConfigRepository.seedDefaults(TEST_USER_ID);
    await shadingConfigRepository.update(TEST_USER_ID, 'active', { colorHex: '#abcdef' });

    // Re-seeding (INSERT OR IGNORE) must not clobber the customised row
    await shadingConfigRepository.seedDefaults(TEST_USER_ID);

    const row = await shadingConfigRepository.findByStateKey(TEST_USER_ID, 'active');
    expect(row?.colorHex).toBe('#abcdef');
  });
});
