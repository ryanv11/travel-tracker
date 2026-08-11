/**
 * GE-19 / BUG-85 — ATDD RED BAR for the geocode status-lifecycle model.
 * Acceptance criteria 6 and 7 from ADL-55 §7 (identity-service level,
 * findOrUpgradeCity).
 *
 * Criterion 7 (§7.7 — the F1 in-place re-open the fresh-eyes review caught) is
 * RED on current main: findRegionlessUpgradeCandidate's whitelist
 * (['pending','unresolvable'], cities.ts:253) excludes 'needs_attention', so a
 * region-less stuck row is never adopted; and even if it were, the upgrade
 * UPDATE (cityIdentityService.ts:96-100) does not reset status/cause and the
 * re-fire guard (:106) only fires for a 'pending' row. It is committed
 * `describe.skip` with the RED-BAR marker; the Backend brief un-skips it.
 *
 * Criterion 6 (§7.6 — re-adding a needs_attention city reuses the row, asserting
 * §8 status-blindness) is GREEN on main: findByIdentityKey (cities.ts:206) is
 * already status-blind, so a re-add finds the existing row before any insert.
 * It is therefore LEFT UN-SKIPPED as a regression guard — the status-blindness
 * it protects is a PREMISE the needs_attention transition relies on (a
 * needs_attention row leaves the pending partial index, so if step 1 were not
 * status-blind a re-add could mint a duplicate). It must survive the build.
 *
 * MOCK FIDELITY (QUAL-22): real libSQL (:memory:) with the real migrations —
 * real partial unique indexes, real CHECK constraints. resolveCity /
 * resolveByOsmId are mocked to no-op spies so (a) the re-fired resolution does
 * not mutate the row out from under the reset assertions, and (b) criterion 7
 * can assert the re-fire was TRIGGERED without a network.
 */

import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../../db/schema.js';
import { createTestDb, type TestDb } from '../../repositories/__tests__/test-db.js';

const USER_A = 'user-a-00000000-0000-0000-0000-000000000000';

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

// Spy on the geocoder so the fire-and-forget re-resolve cannot race the reset
// assertions, and so the re-fire itself is observable.
const { resolveCitySpy, resolveByOsmIdSpy } = vi.hoisted(() => ({
  resolveCitySpy: vi.fn(async () => undefined),
  resolveByOsmIdSpy: vi.fn(async () => null),
}));
vi.mock('../geocoding.service.js', () => ({
  resolveCity: resolveCitySpy,
  resolveByOsmId: resolveByOsmIdSpy,
}));

const { findOrUpgradeCity } = await import('../cityIdentityService.js');

// ----------------------------------------------------------------
// Seed helpers
// ----------------------------------------------------------------

async function seedUserA(db: TestDb) {
  const now = Date.now();
  await db
    .insert(schema.users)
    .values({
      id: USER_A,
      clerkId: 'clerk_user_a',
      email: 'usera@example.com',
      isOwner: 1,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    })
    .onConflictDoNothing();
}

async function seedRegionTierUS(db: TestDb): Promise<number> {
  await db
    .insert(schema.countries)
    .values({ countryCode: 'US', name: 'United States', regionTierEnabled: 1 })
    .onConflictDoNothing();
  const [region] = await db
    .insert(schema.regions)
    .values({ countryCode: 'US', name: 'Colorado', iso3166_2: 'US-CO' })
    .returning();
  return region.id;
}

async function seedCity(
  db: TestDb,
  overrides: Partial<typeof schema.cities.$inferInsert>,
): Promise<number> {
  const [city] = await db
    .insert(schema.cities)
    .values({ name: 'Denver', countryCode: 'US', geocodeStatus: 'pending', ...overrides })
    .returning();
  return city.id;
}

async function readCity(cityId: number) {
  const [row] = await testDb!.select().from(schema.cities).where(eq(schema.cities.id, cityId));
  return row;
}

async function countByName(name: string) {
  const rows = await testDb!
    .select()
    .from(schema.cities)
    .where(and(eq(schema.cities.name, name), eq(schema.cities.countryCode, 'US')));
  return rows.length;
}

beforeEach(async () => {
  testDb = await createTestDb();
  await seedUserA(testDb);
  resolveCitySpy.mockClear();
  resolveByOsmIdSpy.mockClear();
});

afterEach(() => {
  testDb = null;
});

// ================================================================
// Criterion 6 (ADL-55 §7.6 / §8) — DUPLICATE-SAFETY. Re-adding a
// needs_attention city with the same (name, country, region) REUSES the
// existing row (no second row). GREEN on main — regression guard, NOT a red
// bar. Left UN-SKIPPED.
// ================================================================
describe('GE-19 REGRESSION GUARD (BUG-85) §7.6 — re-add of a needs_attention city reuses the row (GREEN on main)', () => {
  it('findOrUpgradeCity returns the existing needs_attention row, minting no duplicate (status-blind step 1)', async () => {
    const regionId = await seedRegionTierUS(testDb!);
    const existingId = await seedCity(testDb!, {
      name: 'Denver',
      regionId,
      geocodeStatus: 'needs_attention',
      geocodeCause: 'ambiguous',
      createdByUserId: USER_A,
    });

    // Re-add the SAME identity (name, country, region).
    const result = await findOrUpgradeCity('Denver', 'US', regionId, USER_A);

    expect(result).not.toBeNull();
    expect(result?.id).toBe(existingId); // reused, not re-created
    expect(await countByName('Denver')).toBe(1); // no second row
    // The reused terminal row is returned untouched (status-blind reuse).
    expect(result?.geocodeStatus).toBe('needs_attention');
  });
});

// ================================================================
// Criterion 7 (ADL-55 §7.7 / §R F1) — IN-PLACE RE-OPEN. Supplying a region for
// a REGION-LESS needs_attention city adopts that same row and RESETS it to
// pending / attempts 0 / cause null (region set), then RE-FIRES resolution.
// RED on main (whitelist excludes needs_attention; no status/cause reset; the
// re-fire guard only fires for 'pending'). Assert the reset EXPLICITLY.
// ================================================================
// GE-19 RED BAR (BUG-85) — unskip when implemented
describe.skip('GE-19 RED BAR (BUG-85) §7.7 — region supplied re-opens a region-less needs_attention row in place', () => {
  it('resets the region-less needs_attention row to pending/attempts 0/cause null, sets the region, and re-fires resolveCity', async () => {
    const regionId = await seedRegionTierUS(testDb!);
    // A region-LESS needs_attention row (region_id NULL), some retry budget spent.
    const stuckId = await seedCity(testDb!, {
      name: 'Denver',
      regionId: null,
      geocodeStatus: 'needs_attention',
      geocodeCause: 'ambiguous',
      geocodeAttempts: 3,
      createdByUserId: USER_A,
    });

    // Supplying the region should ADOPT this exact row (wildcard upgrade), not
    // insert a new one.
    const result = await findOrUpgradeCity('Denver', 'US', regionId, USER_A);

    // Re-read the ORIGINAL row by id so the assertions are deterministic even
    // when findOrUpgradeCity returns null today (the row is simply not adopted).
    const row = await readCity(stuckId);

    // TARGET (all RED on main — today the row is untouched: still
    // needs_attention / cause 'ambiguous' / attempts 3 / region NULL, and
    // findOrUpgradeCity returns null so nothing is re-fired).
    expect(row.geocodeStatus).toBe('pending'); // §R F1: status reset (the third edit)
    expect(row.geocodeCause).toBeNull(); // cause cleared
    expect(row.geocodeAttempts).toBe(0); // retry budget reset
    expect(row.regionId).toBe(regionId); // region now set
    expect(result?.id).toBe(stuckId); // adopted in place — not a new insert
    expect(await countByName('Denver')).toBe(1); // no duplicate row
    expect(resolveCitySpy).toHaveBeenCalledWith(stuckId); // resolution re-fired
  });
});

// ================================================================
// Criterion 7 counterpart (ADL-55 §3.3 / §R F1 "asymmetry preserved untouched")
// — a region-less UNRESOLVABLE row IS upgradeable (region set, attempts reset)
// but stays 'unresolvable' and is NOT re-fired: a no-match cannot become a
// match by adding a region. GREEN on main (the whitelist already includes
// 'unresolvable' and the re-fire guard only fires for 'pending') — a regression
// guard so the F1 build does not accidentally start re-firing no-match rows.
// Left UN-SKIPPED.
// ================================================================
describe('GE-19 REGRESSION GUARD (BUG-85) §3.3 — unresolvable re-open asymmetry preserved (GREEN on main)', () => {
  it('an adopted unresolvable region-less row is upgraded but NOT status-reset and NOT re-fired', async () => {
    const regionId = await seedRegionTierUS(testDb!);
    const noMatchId = await seedCity(testDb!, {
      name: 'Denver',
      regionId: null,
      geocodeStatus: 'unresolvable',
      geocodeAttempts: 2,
      createdByUserId: USER_A,
    });

    const result = await findOrUpgradeCity('Denver', 'US', regionId, USER_A);

    const row = await readCity(noMatchId);
    expect(result?.id).toBe(noMatchId);
    expect(row.regionId).toBe(regionId);
    expect(row.geocodeStatus).toBe('unresolvable');
    expect(resolveCitySpy).not.toHaveBeenCalled();
  });
});
