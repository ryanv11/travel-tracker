/**
 * Unit tests for src/backend/services/startup.service.ts.
 *
 * assertForeignKeysEnabled() — QUAL-11 / ADL-41 §7.2.1 decision 9. This is a READ of
 * PRAGMA foreign_keys on the real application connection, never a SET. Covers:
 *   - resolves silently when PRAGMA foreign_keys = 1 (the expected state)
 *   - throws loudly when PRAGMA foreign_keys is not 1 (driver default flipped)
 *   - is a no-op for DB_TYPE=postgres, which always enforces declared FKs
 *
 * seedRegions() — BUG-77 / ADL-48 S1. The subdivision seed is ADDITIVE and
 * content-hash gated. These tests exist because the failure mode is silent: a
 * DELETE+reload would re-issue AUTOINCREMENT ids and repoint every existing
 * cities.region_id at a different subdivision, and nothing in the app would say so.
 * They run against the real migrations with FK enforcement ON (see test-db.ts).
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../../db/schema.js';
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

const { assertForeignKeysEnabled, seedCountries, seedRegions } = await import(
  '../startup.service.js'
);

// ----------------------------------------------------------------
// Seed-file fixtures — read the REAL data/regions.json, never a copy.
// A hand-written fixture would let the shipped artifact drift while these
// tests stayed green, which is the whole class of failure they exist to catch.
// ----------------------------------------------------------------

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');

type SeedRow = { country_code: string; name: string; iso_3166_2: string };

const REGION_SEED: SeedRow[] = JSON.parse(
  readFileSync(join(REPO_ROOT, 'data/regions.json'), 'utf-8'),
);

/** The 4 countries that had subdivisions before BUG-77 — today's staging/production set. */
const PRE_BUG77_COUNTRIES = ['US', 'AU', 'CA', 'GB'];
const PRE_BUG77_ROWS = REGION_SEED.filter((r) => PRE_BUG77_COUNTRIES.includes(r.country_code));

const ENABLED_COUNTRY_CODES: string[] = (
  JSON.parse(readFileSync(join(REPO_ROOT, 'data/countries.json'), 'utf-8')) as Array<{
    country_code: string;
    region_tier_enabled: number;
  }>
)
  .filter((c) => c.region_tier_enabled === 1)
  .map((c) => c.country_code);

async function insertRows(db: TestDb, rows: SeedRow[]) {
  await db.insert(schema.regions).values(
    rows.map((r) => ({
      countryCode: r.country_code,
      name: r.name,
      iso3166_2: r.iso_3166_2,
    })),
  );
}

async function readRegions(db: TestDb) {
  return db
    .select({
      id: schema.regions.id,
      countryCode: schema.regions.countryCode,
      name: schema.regions.name,
      iso3166_2: schema.regions.iso3166_2,
    })
    .from(schema.regions);
}

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

describe('seedRegions() — BUG-77 / ADL-48 S1', () => {
  let infoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    testDb = await createTestDb();
    // regions.country_code is a NOT NULL FK to countries, and FK enforcement is ON,
    // so countries must exist first — the real boot order (server.ts).
    await seedCountries();
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    infoSpy.mockRestore();
  });

  // ----------------------------------------------------------------
  // The seed file itself
  // ----------------------------------------------------------------

  it('ships 714 subdivisions with no duplicate iso_3166_2', () => {
    expect(REGION_SEED).toHaveLength(714);
    expect(new Set(REGION_SEED.map((r) => r.iso_3166_2)).size).toBe(714);
  });

  it('ships no empty or malformed ISO codes (F4 — "ID-" / "PH-" garbage)', () => {
    // Two upstream subdivisions carry an empty `iso` field and would seed as the
    // non-null, permanently-unmatchable codes "ID-" and "PH-". 196 such rows exist
    // across all 234 countries, so this filter must stay general as GE-07 enables more.
    for (const r of REGION_SEED) {
      expect(r.iso_3166_2).toMatch(/^[A-Z]{2}-.+$/);
      expect(r.country_code).toBe(r.iso_3166_2.slice(0, 2));
    }
  });

  it('covers every region_tier_enabled country — none left with an empty selector', () => {
    expect(ENABLED_COUNTRY_CODES).toHaveLength(26);
    const seeded = new Set(REGION_SEED.map((r) => r.country_code));
    expect([...ENABLED_COUNTRY_CODES].filter((cc) => !seeded.has(cc))).toEqual([]);
  });

  it('preserves all 76 pre-BUG-77 subdivisions (US/AU/CA/GB)', () => {
    expect(PRE_BUG77_ROWS).toHaveLength(76);
  });

  // ----------------------------------------------------------------
  // Fresh install
  // ----------------------------------------------------------------

  it('seeds all 714 rows into an empty table', async () => {
    await seedRegions();

    const rows = await readRegions(testDb!);
    expect(rows).toHaveLength(714);
    expect(new Set(rows.map((r) => r.countryCode)).size).toBe(26);
  });

  // ----------------------------------------------------------------
  // Already-seeded install — the migration-risk case
  // ----------------------------------------------------------------

  it('converges an already-seeded 76-row install to 714 without disturbing the 76', async () => {
    // Reproduces staging and production exactly: 76 regions, the old row-count gate
    // would have returned early here and shipped 638 subdivisions that never applied.
    await insertRows(testDb!, PRE_BUG77_ROWS);
    const before = await readRegions(testDb!);
    expect(before).toHaveLength(76);

    await seedRegions();

    const after = await readRegions(testDb!);
    expect(after).toHaveLength(714);

    // Every pre-existing row must be byte-identical AND keep its original id —
    // that identity is what cities.region_id points at.
    const afterById = new Map(after.map((r) => [r.id, r]));
    for (const original of before) {
      expect(afterById.get(original.id)).toEqual(original);
    }
  });

  it('leaves cities.region_id pointing at the same subdivision it did before', async () => {
    await insertRows(testDb!, PRE_BUG77_ROWS);
    const [scotland] = await testDb!
      .select()
      .from(schema.regions)
      .where(eq(schema.regions.iso3166_2, 'GB-SCT'));

    const [city] = await testDb!
      .insert(schema.cities)
      .values({ name: 'Edinburgh', countryCode: 'GB', regionId: scotland.id })
      .returning();

    await seedRegions();

    const [cityAfter] = await testDb!
      .select()
      .from(schema.cities)
      .where(eq(schema.cities.id, city.id));
    expect(cityAfter.regionId).toBe(scotland.id);

    const [regionAfter] = await testDb!
      .select()
      .from(schema.regions)
      .where(eq(schema.regions.id, scotland.id));
    expect(regionAfter.iso3166_2).toBe('GB-SCT');
    expect(regionAfter.name).toBe('Scotland');
  });

  // ----------------------------------------------------------------
  // Steady state — the gate
  // ----------------------------------------------------------------

  it('skips on the second run: gate matches, no writes', async () => {
    await seedRegions();
    const afterFirst = await readRegions(testDb!);

    infoSpy.mockClear();
    await seedRegions();

    expect(infoSpy.mock.calls.flat().join(' ')).toContain('Regions up to date');
    expect(await readRegions(testDb!)).toEqual(afterFirst);
  });

  it('is idempotent across repeated boots', async () => {
    await seedRegions();
    await seedRegions();
    await seedRegions();

    expect(await readRegions(testDb!)).toHaveLength(714);
  });

  // ----------------------------------------------------------------
  // Drift
  // ----------------------------------------------------------------

  it('corrects a drifted subdivision name in place, keeping its id', async () => {
    await seedRegions();
    const [before] = await testDb!
      .select()
      .from(schema.regions)
      .where(eq(schema.regions.iso3166_2, 'DE-BY'));

    await testDb!
      .update(schema.regions)
      .set({ name: 'WRONG NAME' })
      .where(eq(schema.regions.iso3166_2, 'DE-BY'));

    await seedRegions();

    const [after] = await testDb!
      .select()
      .from(schema.regions)
      .where(eq(schema.regions.iso3166_2, 'DE-BY'));
    expect(after.id).toBe(before.id);
    expect(after.name).toBe(before.name);
  });

  it('never deletes a row that is absent from the seed file', async () => {
    // Additive-only. A row here could already be referenced by a city, and there is
    // no safe way for a seed to know it is not.
    await seedRegions();
    await testDb!
      .insert(schema.regions)
      .values({ countryCode: 'GB', name: 'Hand-added', iso3166_2: 'GB-ZZZ' });

    await seedRegions();

    const rows = await readRegions(testDb!);
    expect(rows).toHaveLength(715);
    expect(rows.some((r) => r.iso3166_2 === 'GB-ZZZ')).toBe(true);
  });
});
