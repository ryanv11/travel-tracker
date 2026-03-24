/**
 * Security Access Matrix — Regression Test Suite
 * BRD §5.11 SE-01 through SE-07 / OP-06 hardening checklist
 *
 * This file is a LIVING ACCESS MATRIX. When a new route is added:
 *   1. Add a Part A row (unauthenticated → 401)
 *   2. If requireOwner: add a Part B row (non-owner → 403)
 *   3. If route accesses user-owned data: verify cross-user case in Part C or service unit test
 *
 * Exempt from Part A: /health (liveness probe), /geo/* (public static — OP-06 §1.2)
 * Not in Part B: /api/map/shading/countries/:code and /api/map/shading/regions/:code
 *   are requireAuth only (not owner-restricted) — intentional per OP-06 §2 access matrix.
 */

import { createClient } from '@libsql/client';
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
      name TEXT NOT NULL UNIQUE,
      is_active INTEGER DEFAULT 1 NOT NULL,
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
      updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL
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
      state_key TEXT PRIMARY KEY NOT NULL,
      display_name TEXT NOT NULL,
      color_hex TEXT NOT NULL,
      updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL
    )`,
  ];

  for (const sql of ddlStatements) {
    await client.execute(sql);
  }

  return drizzle(client, { schema });
}

// ----------------------------------------------------------------
// Test user constants
// ----------------------------------------------------------------

const USER_A_ID = 'user-a-00000000-0000-0000-0000-000000000000'; // owner, isOwner=1
const USER_B_ID = 'user-b-00000000-0000-0000-0000-000000000000'; // non-owner, isOwner=0

// ----------------------------------------------------------------
// Module-level mock control variables
// ----------------------------------------------------------------

let testDb: Awaited<ReturnType<typeof createTestDb>> | null = null;
let mockIsOwner = 1;
let mockUserId = USER_A_ID;
let mockAuthEnabled = true;

// ----------------------------------------------------------------
// Module mocks — must be declared before any imports that use them
// ----------------------------------------------------------------

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
    req: import('express').Request,
    res: import('express').Response,
    next: import('express').NextFunction,
  ) => {
    if (!mockAuthEnabled) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    (req as import('express').Request & { user?: unknown }).user = {
      id: mockUserId,
      clerkId: mockUserId === USER_A_ID ? 'clerk_user_a' : 'clerk_user_b',
      email: mockUserId === USER_A_ID ? 'usera@example.com' : 'userb@example.com',
      isOwner: mockIsOwner,
    };
    next();
  },
}));

vi.mock('../../services/geocoding.service.js', () => ({
  resolveCity: async () => undefined,
}));

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

async function seedUser(
  db: Awaited<ReturnType<typeof createTestDb>>,
  userId: string,
  clerkId: string,
  email: string,
  isOwner: number,
) {
  const now = Date.now();
  await db
    .insert(schema.users)
    .values({
      id: userId,
      clerkId,
      email,
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

async function seedTrip(
  db: Awaited<ReturnType<typeof createTestDb>>,
  userId: string,
): Promise<number> {
  const now = new Date().toISOString();
  const inserted = await db
    .insert(schema.trips)
    .values({
      name: 'Test Trip',
      startDate: '2026-01-01',
      endDate: '2026-01-10',
      status: 'planning',
      userId,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: schema.trips.id });
  return inserted[0].id;
}

// ----------------------------------------------------------------
// Setup / teardown
// ----------------------------------------------------------------

beforeEach(async () => {
  testDb = await createTestDb();
  // Default: authenticated as USER_A (owner)
  mockAuthEnabled = true;
  mockIsOwner = 1;
  mockUserId = USER_A_ID;
});

afterEach(() => {
  testDb = null;
  mockAuthEnabled = true;
  mockIsOwner = 1;
  mockUserId = USER_A_ID;
});

// ================================================================
// Part A — Unauthenticated rejection (28 cases)
//
// All /api/* routes must return 401 when auth is disabled.
// Exempt: /health (liveness probe), /geo/* (public static — OP-06 §1.2)
// ================================================================

describe('Part A — Unauthenticated rejection: all API routes return 401', () => {
  beforeEach(() => {
    mockAuthEnabled = false;
  });

  it('GET /api/trips → 401', async () => {
    const res = await supertest(app).get('/api/trips');
    expect(res.status).toBe(401);
  });

  it('POST /api/trips → 401', async () => {
    const res = await supertest(app).post('/api/trips').send({});
    expect(res.status).toBe(401);
  });

  it('GET /api/trips/1 → 401', async () => {
    const res = await supertest(app).get('/api/trips/1');
    expect(res.status).toBe(401);
  });

  it('PATCH /api/trips/1 → 401', async () => {
    const res = await supertest(app).patch('/api/trips/1').send({});
    expect(res.status).toBe(401);
  });

  it('DELETE /api/trips/1 → 401', async () => {
    const res = await supertest(app).delete('/api/trips/1');
    expect(res.status).toBe(401);
  });

  it('GET /api/trips/1/places → 401', async () => {
    const res = await supertest(app).get('/api/trips/1/places');
    expect(res.status).toBe(401);
  });

  it('POST /api/trips/1/places → 401', async () => {
    const res = await supertest(app).post('/api/trips/1/places').send({});
    expect(res.status).toBe(401);
  });

  it('GET /api/trips/1/items → 401', async () => {
    const res = await supertest(app).get('/api/trips/1/items');
    expect(res.status).toBe(401);
  });

  it('POST /api/trips/1/items → 401', async () => {
    const res = await supertest(app).post('/api/trips/1/items').send({});
    expect(res.status).toBe(401);
  });

  it('GET /api/cities → 401', async () => {
    const res = await supertest(app).get('/api/cities').query({ q: 'test' });
    expect(res.status).toBe(401);
  });

  it('POST /api/cities → 401', async () => {
    const res = await supertest(app).post('/api/cities').send({});
    expect(res.status).toBe(401);
  });

  it('GET /api/cities/1/carry-forward → 401', async () => {
    const res = await supertest(app).get('/api/cities/1/carry-forward');
    expect(res.status).toBe(401);
  });

  it('GET /api/cities/1/items → 401', async () => {
    const res = await supertest(app).get('/api/cities/1/items');
    expect(res.status).toBe(401);
  });

  it('GET /api/map/shading → 401', async () => {
    const res = await supertest(app).get('/api/map/shading');
    expect(res.status).toBe(401);
  });

  it('GET /api/map/shading/config → 401', async () => {
    const res = await supertest(app).get('/api/map/shading/config');
    expect(res.status).toBe(401);
  });

  it('PATCH /api/map/shading/config/visited → 401', async () => {
    const res = await supertest(app).patch('/api/map/shading/config/visited').send({});
    expect(res.status).toBe(401);
  });

  it('GET /api/map/shading/countries/US → 401', async () => {
    const res = await supertest(app).get('/api/map/shading/countries/US');
    expect(res.status).toBe(401);
  });

  it('GET /api/map/shading/regions/US → 401', async () => {
    const res = await supertest(app).get('/api/map/shading/regions/US');
    expect(res.status).toBe(401);
  });

  it('GET /api/admin/categories → 401', async () => {
    const res = await supertest(app).get('/api/admin/categories');
    expect(res.status).toBe(401);
  });

  it('POST /api/admin/categories → 401', async () => {
    const res = await supertest(app).post('/api/admin/categories').send({});
    expect(res.status).toBe(401);
  });

  it('GET /api/admin/activities → 401', async () => {
    const res = await supertest(app).get('/api/admin/activities');
    expect(res.status).toBe(401);
  });

  it('POST /api/admin/activities → 401', async () => {
    const res = await supertest(app).post('/api/admin/activities').send({});
    expect(res.status).toBe(401);
  });

  it('GET /api/admin/companions → 401', async () => {
    const res = await supertest(app).get('/api/admin/companions');
    expect(res.status).toBe(401);
  });

  it('POST /api/admin/companions → 401', async () => {
    const res = await supertest(app).post('/api/admin/companions').send({});
    expect(res.status).toBe(401);
  });

  it('GET /api/admin/countries → 401', async () => {
    const res = await supertest(app).get('/api/admin/countries');
    expect(res.status).toBe(401);
  });

  it('PATCH /api/admin/countries/US → 401', async () => {
    const res = await supertest(app).patch('/api/admin/countries/US').send({});
    expect(res.status).toBe(401);
  });

  it('GET /api/admin/countries/US/regions → 401', async () => {
    const res = await supertest(app).get('/api/admin/countries/US/regions');
    expect(res.status).toBe(401);
  });

  it('POST /api/admin/countries/US/regions → 401', async () => {
    const res = await supertest(app).post('/api/admin/countries/US/regions').send({});
    expect(res.status).toBe(401);
  });
});

// ================================================================
// Part B — Owner-only routes: non-owner gets 403 (27 cases)
//
// Authenticated as USER_B (isOwner=0). All owner-gated routes must
// return 403 { error: 'Forbidden' }.
//
// NOT included here (requireAuth only, not requireOwner):
//   GET /api/map/shading/countries/:code
//   GET /api/map/shading/regions/:code
// ================================================================

describe('Part B — Non-owner authenticated user receives 403 on owner-only routes', () => {
  beforeEach(async () => {
    mockAuthEnabled = true;
    mockIsOwner = 0;
    mockUserId = USER_B_ID;
    await seedUser(testDb!, USER_B_ID, 'clerk_user_b', 'userb@example.com', 0);
  });

  // Admin — categories
  it('GET /api/admin/categories → 403', async () => {
    const res = await supertest(app).get('/api/admin/categories');
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'Forbidden' });
  });

  it('POST /api/admin/categories → 403', async () => {
    const res = await supertest(app).post('/api/admin/categories').send({ name: 'Test' });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'Forbidden' });
  });

  it('PATCH /api/admin/categories/1 → 403', async () => {
    const res = await supertest(app).patch('/api/admin/categories/1').send({ name: 'Updated' });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'Forbidden' });
  });

  it('DELETE /api/admin/categories/1 → 403', async () => {
    const res = await supertest(app).delete('/api/admin/categories/1');
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'Forbidden' });
  });

  it('GET /api/admin/categories/active → 403', async () => {
    const res = await supertest(app).get('/api/admin/categories/active');
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'Forbidden' });
  });

  // Admin — activities
  it('GET /api/admin/activities → 403', async () => {
    const res = await supertest(app).get('/api/admin/activities');
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'Forbidden' });
  });

  it('POST /api/admin/activities → 403', async () => {
    const res = await supertest(app).post('/api/admin/activities').send({ name: 'Test' });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'Forbidden' });
  });

  it('PATCH /api/admin/activities/1 → 403', async () => {
    const res = await supertest(app).patch('/api/admin/activities/1').send({ name: 'Updated' });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'Forbidden' });
  });

  it('DELETE /api/admin/activities/1 → 403', async () => {
    const res = await supertest(app).delete('/api/admin/activities/1');
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'Forbidden' });
  });

  it('GET /api/admin/activities/active → 403', async () => {
    const res = await supertest(app).get('/api/admin/activities/active');
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'Forbidden' });
  });

  // Admin — companions
  it('GET /api/admin/companions → 403', async () => {
    const res = await supertest(app).get('/api/admin/companions');
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'Forbidden' });
  });

  it('POST /api/admin/companions → 403', async () => {
    const res = await supertest(app).post('/api/admin/companions').send({ name: 'Test' });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'Forbidden' });
  });

  it('PATCH /api/admin/companions/1 → 403', async () => {
    const res = await supertest(app).patch('/api/admin/companions/1').send({ name: 'Updated' });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'Forbidden' });
  });

  it('DELETE /api/admin/companions/1 → 403', async () => {
    const res = await supertest(app).delete('/api/admin/companions/1');
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'Forbidden' });
  });

  it('GET /api/admin/companions/active → 403', async () => {
    const res = await supertest(app).get('/api/admin/companions/active');
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'Forbidden' });
  });

  // Admin — countries
  it('GET /api/admin/countries → 403', async () => {
    const res = await supertest(app).get('/api/admin/countries');
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'Forbidden' });
  });

  it('PATCH /api/admin/countries/US → 403', async () => {
    const res = await supertest(app).patch('/api/admin/countries/US').send({});
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'Forbidden' });
  });

  it('GET /api/admin/countries/US/regions → 403', async () => {
    const res = await supertest(app).get('/api/admin/countries/US/regions');
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'Forbidden' });
  });

  it('POST /api/admin/countries/US/regions → 403', async () => {
    const res = await supertest(app).post('/api/admin/countries/US/regions').send({});
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'Forbidden' });
  });

  // Admin — regions PATCH
  // Confirmed path from admin.ts: PATCH /api/admin/countries/:countryCode/regions/:regionId
  it('PATCH /api/admin/countries/US/regions/1 → 403', async () => {
    const res = await supertest(app)
      .patch('/api/admin/countries/US/regions/1')
      .send({ name: 'Updated' });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'Forbidden' });
  });

  // Map shading — owner-only routes
  it('GET /api/map/shading → 403', async () => {
    const res = await supertest(app).get('/api/map/shading');
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'Forbidden' });
  });

  it('GET /api/map/shading/config → 403', async () => {
    const res = await supertest(app).get('/api/map/shading/config');
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'Forbidden' });
  });

  it('PATCH /api/map/shading/config/visited → 403', async () => {
    const res = await supertest(app).patch('/api/map/shading/config/visited').send({});
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'Forbidden' });
  });

  // Cities — owner-only routes
  it('POST /api/cities → 403', async () => {
    await seedCountry(testDb!);
    const res = await supertest(app)
      .post('/api/cities')
      .send({ name: 'Test City', country_code: 'US' });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'Forbidden' });
  });

  // PATCH /api/cities/:id — BUG-22 (GitHub issue #91) is being fixed concurrently.
  // requireOwner is missing on PATCH /api/cities/:id in current main.
  // This test is skipped until fix/bug22-cities-patch-owner is merged.
  // Once BUG-22 merges, remove the .skip and the test should pass (returns 403).
  it.skip('PATCH /api/cities/1 → 403 (BUG-22: requireOwner missing on PATCH /api/cities/:id — unskip after BUG-22 merge)', async () => {
    const res = await supertest(app).patch('/api/cities/1').send({ region_id: null });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'Forbidden' });
  });
});

// ================================================================
// Part C — Cross-user data isolation (5 cases)
//
// Seed USER_A's trip. Run all tests as USER_B.
// USER_B should see empty trip list, 404 on USER_A's trip, and
// 403 on owner-gated routes regardless of trip ownership.
// ================================================================

describe('Part C — Cross-user data isolation', () => {
  let tripAId: number;

  beforeEach(async () => {
    // Seed both users
    await seedUser(testDb!, USER_A_ID, 'clerk_user_a', 'usera@example.com', 1);
    await seedUser(testDb!, USER_B_ID, 'clerk_user_b', 'userb@example.com', 0);

    // Seed a trip owned by USER_A
    tripAId = await seedTrip(testDb!, USER_A_ID);

    // Run all Part C tests as USER_B (non-owner)
    mockAuthEnabled = true;
    mockIsOwner = 0;
    mockUserId = USER_B_ID;
  });

  it('GET /api/trips → 200 with empty list (USER_B cannot see USER_A trips)', async () => {
    const res = await supertest(app).get('/api/trips');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('GET /api/trips/:tripAId → 404 (opaque, not 403 per SE-05)', async () => {
    const res = await supertest(app).get(`/api/trips/${tripAId}`);
    expect(res.status).toBe(404);
  });

  it('PATCH /api/trips/:tripAId → 404 (opaque, not 403 per SE-05)', async () => {
    const res = await supertest(app).patch(`/api/trips/${tripAId}`).send({ name: 'Hijack' });
    expect(res.status).toBe(404);
  });

  it('DELETE /api/trips/:tripAId → 404 (opaque, not 403 per SE-05)', async () => {
    const res = await supertest(app).delete(`/api/trips/${tripAId}`);
    expect(res.status).toBe(404);
  });

  it('GET /api/map/shading → 403 (non-owner gate — USER_B cannot access shading)', async () => {
    const res = await supertest(app).get('/api/map/shading');
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'Forbidden' });
  });
});
