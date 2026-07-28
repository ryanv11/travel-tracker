/**
 * Contract tests for ADL-27 requireOwner middleware.
 *
 * Verifies HC-04 / HC-06 from OP-06 hardening checklist:
 *   HC-04: Admin routes (categories, activities, countries, regions) require owner
 *   HC-06: POST /api/cities requires owner
 *
 * HC-05 (map shading config routes require owner) is SUPERSEDED (2026-07-23) by
 * ADL-28 (AD-07) — shading config and shading reads are now per-user (requireAuth
 * only, userId-scoped), not owner-only. Coverage for the new behaviour lives in
 * services/__tests__/shading.user-scope.test.ts (per-user query isolation) and
 * routes/__tests__/map.test.ts (requireAuth-only route behaviour, lazy seeding,
 * per-user cache invalidation).
 *
 * Companion admin routes (GET/POST/PATCH/DELETE /api/admin/companions) are also
 * SUPERSEDED by ADL-28 (AD-08) — companions moved to /api/companions (requireAuth
 * only, userId-scoped, not an admin/owner resource). Coverage lives in
 * routes/__tests__/companions.test.ts.
 *
 * Test structure:
 *   - Non-owner tests: req.user.isOwner = 0 → expect 403 Forbidden
 *   - Owner tests:     req.user.isOwner = 1 → expect 200/201 (success)
 *
 * Uses an in-memory libSQL database per test (full isolation).
 */

import { createClient } from '@libsql/client';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/libsql';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../../db/schema.js';

// ----------------------------------------------------------------
// In-memory DB factory
// ----------------------------------------------------------------

async function createTestDb() {
  const client = createClient({ url: ':memory:' });
  await client.execute('PRAGMA foreign_keys = ON;');

  const ddlStatements = [
    `CREATE TABLE IF NOT EXISTS countries (
      country_code TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      region_tier_enabled INTEGER DEFAULT 0 NOT NULL,
      region_tier_label TEXT,
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
      updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS regions (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      country_code TEXT NOT NULL,
      name TEXT NOT NULL,
      iso_3166_2 TEXT NOT NULL DEFAULT 'XX-UNKNOWN',
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
      updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
      FOREIGN KEY (country_code) REFERENCES countries(country_code)
    )`,
    `CREATE TABLE IF NOT EXISTS cities (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      country_code TEXT NOT NULL,
      region_id INTEGER,
      name TEXT NOT NULL,
      latitude REAL,
      longitude REAL,
      geocode_status TEXT DEFAULT 'pending' NOT NULL,
      geocode_attempted_at TEXT,
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
      updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
      FOREIGN KEY (country_code) REFERENCES countries(country_code),
      FOREIGN KEY (region_id) REFERENCES regions(id)
    )`,
    // BUG-33 (migration 0010, merged): mirrors uniq_cities_name_country_ci so the
    // BUG-33 find-or-create tests below exercise the same constraint production has.
    `CREATE UNIQUE INDEX IF NOT EXISTS uniq_cities_name_country_ci
      ON cities (name COLLATE NOCASE, country_code)`,
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY NOT NULL,
      clerk_id TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL,
      is_owner INTEGER DEFAULT 0 NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS trips (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      name TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      status TEXT DEFAULT 'planning' NOT NULL,
      photo_album_ref TEXT,
      user_id TEXT,
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
      updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS trip_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      name TEXT NOT NULL UNIQUE,
      is_active INTEGER DEFAULT 1 NOT NULL,
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
      updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS trip_categories_map (
      trip_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      PRIMARY KEY (trip_id, category_id),
      FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES trip_categories(id)
    )`,
    `CREATE TABLE IF NOT EXISTS companions (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      is_active INTEGER DEFAULT 1 NOT NULL,
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
      updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
      UNIQUE (user_id, name),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS trip_companions_map (
      trip_id INTEGER NOT NULL,
      companion_id INTEGER NOT NULL,
      PRIMARY KEY (trip_id, companion_id),
      FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
      FOREIGN KEY (companion_id) REFERENCES companions(id)
    )`,
    `CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      name TEXT NOT NULL UNIQUE,
      is_active INTEGER DEFAULT 1 NOT NULL,
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
      updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS trip_activities_map (
      trip_id INTEGER NOT NULL,
      activity_id INTEGER NOT NULL,
      PRIMARY KEY (trip_id, activity_id),
      FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
      FOREIGN KEY (activity_id) REFERENCES activities(id)
    )`,
    `CREATE TABLE IF NOT EXISTS trip_places (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      trip_id INTEGER NOT NULL,
      city_id INTEGER NOT NULL,
      user_id TEXT,
      arrived_on TEXT,
      departed_on TEXT,
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
      updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
      FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
      FOREIGN KEY (city_id) REFERENCES cities(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(trip_id, city_id)
    )`,
    `CREATE TABLE IF NOT EXISTS trip_place_activities_map (
      trip_place_id INTEGER NOT NULL,
      activity_id INTEGER NOT NULL,
      PRIMARY KEY (trip_place_id, activity_id),
      FOREIGN KEY (trip_place_id) REFERENCES trip_places(id) ON DELETE CASCADE,
      FOREIGN KEY (activity_id) REFERENCES activities(id)
    )`,
    `CREATE TABLE IF NOT EXISTS trip_countries (
      trip_id INTEGER NOT NULL,
      country_code TEXT NOT NULL,
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
      PRIMARY KEY (trip_id, country_code),
      FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
      FOREIGN KEY (country_code) REFERENCES countries(country_code) ON DELETE RESTRICT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_trip_countries_country ON trip_countries (country_code)`,
    `CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      trip_id INTEGER NOT NULL,
      trip_place_id INTEGER,
      item_type TEXT NOT NULL,
      status TEXT DEFAULT 'consider' NOT NULL,
      notes TEXT,
      map_url TEXT,
      is_carried_forward INTEGER DEFAULT 0 NOT NULL,
      carried_from_item_id INTEGER,
      user_id TEXT,
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
      updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
      FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
      FOREIGN KEY (trip_place_id) REFERENCES trip_places(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS item_flights (
      item_id INTEGER PRIMARY KEY NOT NULL,
      airline TEXT, flight_number TEXT, departure_airport TEXT, arrival_airport TEXT,
      departure_datetime TEXT, arrival_datetime TEXT, booking_reference TEXT, seat TEXT,
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS item_hotels (
      item_id INTEGER PRIMARY KEY NOT NULL,
      property_name TEXT, address TEXT, check_in_date TEXT, check_out_date TEXT,
      booking_reference TEXT, confirmation_number TEXT, rating INTEGER, post_visit_notes TEXT,
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS item_car_rentals (
      item_id INTEGER PRIMARY KEY NOT NULL,
      provider TEXT, pickup_location TEXT, dropoff_location TEXT,
      pickup_datetime TEXT, dropoff_datetime TEXT, booking_reference TEXT, vehicle_class TEXT,
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS item_restaurants (
      item_id INTEGER PRIMARY KEY NOT NULL,
      name TEXT, neighbourhood_area TEXT, cuisine_type TEXT, source TEXT,
      rating INTEGER, post_visit_notes TEXT,
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS item_experiences (
      item_id INTEGER PRIMARY KEY NOT NULL,
      rating INTEGER, post_visit_notes TEXT,
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS map_shading_config (
      state_key TEXT NOT NULL,
      user_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      color_hex TEXT NOT NULL,
      updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
      PRIMARY KEY (state_key, user_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
  ];

  for (const sql of ddlStatements) {
    await client.execute(sql);
  }

  return drizzle(client, { schema });
}

// ----------------------------------------------------------------
// Module mocks
// ----------------------------------------------------------------

let testDb: Awaited<ReturnType<typeof createTestDb>> | null = null;

// Controls what isOwner value the mock requireAuth sets on req.user
let mockIsOwner = 0;

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

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (
    _req: import('express').Request,
    _res: import('express').Response,
    next: import('express').NextFunction,
  ) => {
    (_req as import('express').Request & { user?: unknown }).user = {
      id: 'test-user-id',
      clerkId: 'user_test',
      email: 'test@example.com',
      isOwner: mockIsOwner,
    };
    next();
  },
}));

vi.mock('../../services/geocoding.service.js', () => ({
  resolveCity: async () => undefined,
}));

// Mock shading service to avoid DB dependency in map shading GET test
vi.mock('../../services/shading.service.js', () => ({
  getAllCountryShading: async () => [],
  getCountryShading: async () => null,
  getRegionShading: async () => [],
  invalidateConfigCache: () => undefined,
}));

const { default: app } = await import('../../server-test-app.js');
const supertest = (await import('supertest')).default;

// ----------------------------------------------------------------
// Seed helpers
// ----------------------------------------------------------------

const TEST_USER_ID = 'test-user-id';

async function seedTestUser(db: Awaited<ReturnType<typeof createTestDb>>, isOwner = 0) {
  const now = Date.now();
  await db
    .insert(schema.users)
    .values({
      id: TEST_USER_ID,
      clerkId: 'user_test',
      email: 'test@example.com',
      isOwner,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    })
    .onConflictDoNothing();
}

async function seedCountry(
  db: Awaited<ReturnType<typeof createTestDb>>,
  countryCode = 'US',
  name = 'United States',
) {
  await db.insert(schema.countries).values({ countryCode, name }).onConflictDoNothing();
}

// ----------------------------------------------------------------
// Setup / teardown
// ----------------------------------------------------------------

beforeEach(async () => {
  testDb = await createTestDb();
  mockIsOwner = 0; // Default: non-owner
});

afterEach(() => {
  testDb = null;
  mockIsOwner = 0;
});

// ================================================================
// HC-04: Admin routes require owner
// ================================================================

describe('HC-04: Non-owner authenticated user receives 403 on admin routes', () => {
  it('GET /api/admin/categories → 403 for non-owner', async () => {
    mockIsOwner = 0;
    await seedTestUser(testDb!, 0);
    const res = await supertest(app).get('/api/admin/categories');
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'Forbidden' });
  });

  it('POST /api/admin/categories → 403 for non-owner', async () => {
    mockIsOwner = 0;
    await seedTestUser(testDb!, 0);
    const res = await supertest(app).post('/api/admin/categories').send({ name: 'New Category' });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'Forbidden' });
  });
});

describe('HC-04: Owner user receives 200/201 on admin routes', () => {
  it('GET /api/admin/categories → 200 for owner', async () => {
    mockIsOwner = 1;
    await seedTestUser(testDb!, 1);
    const res = await supertest(app).get('/api/admin/categories');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /api/admin/categories → 201 for owner', async () => {
    mockIsOwner = 1;
    await seedTestUser(testDb!, 1);
    const res = await supertest(app).post('/api/admin/categories').send({ name: 'Owner Category' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Owner Category' });
  });
});

// ================================================================
// HC-06: POST /api/cities requires owner
// ================================================================

describe('HC-06: POST /api/cities requires owner', () => {
  it('POST /api/cities → 403 for non-owner', async () => {
    mockIsOwner = 0;
    await seedTestUser(testDb!, 0);
    await seedCountry(testDb!);
    const res = await supertest(app)
      .post('/api/cities')
      .send({ name: 'New City', country_code: 'US' });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'Forbidden' });
  });

  it('POST /api/cities → 201 for owner', async () => {
    mockIsOwner = 1;
    await seedTestUser(testDb!, 1);
    await seedCountry(testDb!);
    const res = await supertest(app)
      .post('/api/cities')
      .send({ name: 'Owner City', country_code: 'US' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Owner City', country_code: 'US' });
  });
});

// ================================================================
// BUG-33: POST /api/cities find-or-create (no duplicate rows)
// ================================================================

describe('BUG-33: POST /api/cities find-or-create', () => {
  beforeEach(async () => {
    mockIsOwner = 1;
    await seedTestUser(testDb!, 1);
    await seedCountry(testDb!);
  });

  it('returns the existing city (200) on an exact-name repeat instead of inserting a duplicate', async () => {
    const first = await supertest(app)
      .post('/api/cities')
      .send({ name: 'Glasgow', country_code: 'US' });
    expect(first.status).toBe(201);

    const second = await supertest(app)
      .post('/api/cities')
      .send({ name: 'Glasgow', country_code: 'US' });
    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);

    const rows = await testDb!
      .select()
      .from(schema.cities)
      .where(eq(schema.cities.countryCode, 'US'));
    expect(rows).toHaveLength(1);
  });

  it('matches an existing city case-insensitively (e.g. "glasgow" vs "Glasgow")', async () => {
    const first = await supertest(app)
      .post('/api/cities')
      .send({ name: 'Glasgow', country_code: 'US' });
    expect(first.status).toBe(201);

    const second = await supertest(app)
      .post('/api/cities')
      .send({ name: 'glasgow', country_code: 'US' });
    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);
    expect(second.body.name).toBe('Glasgow'); // returns the stored casing, not the request's

    const rows = await testDb!
      .select()
      .from(schema.cities)
      .where(eq(schema.cities.countryCode, 'US'));
    expect(rows).toHaveLength(1);
  });

  it('does not match a same-named city in a different country', async () => {
    await seedCountry(testDb!, 'GB', 'United Kingdom');

    const first = await supertest(app)
      .post('/api/cities')
      .send({ name: 'Glasgow', country_code: 'GB' });
    expect(first.status).toBe(201);

    const second = await supertest(app)
      .post('/api/cities')
      .send({ name: 'Glasgow', country_code: 'US' });
    expect(second.status).toBe(201);
    expect(second.body.id).not.toBe(first.body.id);

    const rows = await testDb!.select().from(schema.cities);
    expect(rows).toHaveLength(2);
  });
});

// ================================================================
// BUG-22: PATCH /api/cities/:id requires owner (SE-03)
// ================================================================

describe('BUG-22: PATCH /api/cities/:id requires owner', () => {
  it('PATCH /api/cities/1 → 403 for non-owner', async () => {
    mockIsOwner = 0;
    await seedTestUser(testDb!, 0);
    const res = await supertest(app).patch('/api/cities/1').send({ region_id: null });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'Forbidden' });
  });

  it('PATCH /api/cities/1 → 404 for owner (city does not exist, but auth gate passes)', async () => {
    mockIsOwner = 1;
    await seedTestUser(testDb!, 1);
    const res = await supertest(app).patch('/api/cities/1').send({ region_id: null });
    expect(res.status).toBe(404);
  });
});
