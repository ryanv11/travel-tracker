/**
 * Unit tests for assertForeignKeysEnabled() (src/backend/services/startup.service.ts).
 *
 * QUAL-11 / ADL-41 §7.2.1 decision 9 — this is a READ of PRAGMA foreign_keys on
 * the real application connection, never a SET. Covers:
 *   - resolves silently when PRAGMA foreign_keys = 1 (the expected state)
 *   - throws loudly when PRAGMA foreign_keys is not 1 (driver default flipped)
 *   - is a no-op for DB_TYPE=postgres, which always enforces declared FKs
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDb } from '../../repositories/__tests__/test-db.js';

// ----------------------------------------------------------------
// Mock getDb — same pattern used by every repository/service test
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

const { assertForeignKeysEnabled } = await import('../startup.service.js');

describe('assertForeignKeysEnabled()', () => {
  const originalDbType = process.env.DB_TYPE;

  beforeEach(async () => {
    testDb = await createTestDb();
    process.env.DB_TYPE = 'sqlite';
  });

  afterEach(() => {
    process.env.DB_TYPE = originalDbType;
  });

  it('resolves without throwing when PRAGMA foreign_keys = 1', async () => {
    // createTestDb() already issues `PRAGMA foreign_keys = ON;` — the expected
    // production-equivalent state (ADL-41 §7.2: the @libsql/client default).
    await expect(assertForeignKeysEnabled()).resolves.toBeUndefined();
  });

  it('throws loudly when PRAGMA foreign_keys is not 1 (driver default flipped)', async () => {
    // Simulates the exact failure mode this assertion exists to catch: a
    // connection where FK enforcement is off. Real read of real per-connection
    // state, not a mocked return value.
    await testDb!.$client.execute('PRAGMA foreign_keys = OFF;');

    await expect(assertForeignKeysEnabled()).rejects.toThrow(/PRAGMA foreign_keys returned/);
    await expect(assertForeignKeysEnabled()).rejects.toThrow(/Refusing to start/);
  });

  it('is a no-op for DB_TYPE=postgres — declared FKs are always enforced there', async () => {
    process.env.DB_TYPE = 'postgres';
    // No testDb needed for this branch — getDb() must not even be called.
    testDb = null;

    await expect(assertForeignKeysEnabled()).resolves.toBeUndefined();
  });
});
