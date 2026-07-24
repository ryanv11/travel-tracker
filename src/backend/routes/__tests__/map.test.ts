/**
 * Route integration tests for the Map Shading API (ADL-28 / BRD-AD07).
 *
 * Shading config and shading reads moved from requireOwner to requireAuth
 * only, userId-scoped — see routes/map.ts. This file replaces the HC-05
 * coverage that used to live in routes/__tests__/owner-access.test.ts.
 *
 * Covers:
 *   GET   /api/map/shading                    — requireAuth only, non-owner allowed
 *   GET   /api/map/shading/config              — lazy-seeds 6 default rows per user
 *   PATCH /api/map/shading/config/:stateKey    — write-guarded by userId, 404 for wrong user
 *   Per-user cache invalidation (PATCH by A does not affect B's cached config)
 *
 * Query-level shading isolation (two users' trips don't affect each other's
 * computed shading) is covered in services/__tests__/shading.user-scope.test.ts;
 * this file focuses on the route/auth layer and the config repository wiring.
 *
 * Uses an in-memory libSQL database per test (full isolation).
 */

import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../../db/schema.js';

// ----------------------------------------------------------------
// In-memory DB factory — the tables the map shading router/service touch.
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
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS trip_countries (
      trip_id INTEGER NOT NULL,
      country_code TEXT NOT NULL,
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
      PRIMARY KEY (trip_id, country_code),
      FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
      FOREIGN KEY (country_code) REFERENCES countries(country_code) ON DELETE RESTRICT
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
// Test user constants
// ----------------------------------------------------------------

const USER_A_ID = 'map-user-a-0000-0000-0000-000000000000';
const USER_B_ID = 'map-user-b-0000-0000-0000-000000000000';

// ----------------------------------------------------------------
// Module mocks
// ----------------------------------------------------------------

let testDb: Awaited<ReturnType<typeof createTestDb>> | null = null;
let mockUserId = USER_A_ID;
let mockIsOwner = 0; // deliberately non-owner by default — proves requireAuth is the only gate

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
    _res: import('express').Response,
    next: import('express').NextFunction,
  ) => {
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

const { default: app } = await import('../../server-test-app.js');
const supertest = (await import('supertest')).default;

// ----------------------------------------------------------------
// Seed helpers
// ----------------------------------------------------------------

async function seedUser(
  db: Awaited<ReturnType<typeof createTestDb>>,
  userId: string,
  clerkId: string,
) {
  const now = Date.now();
  await db
    .insert(schema.users)
    .values({
      id: userId,
      clerkId,
      email: `${clerkId}@example.com`,
      isOwner: 0,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    })
    .onConflictDoNothing();
}

// ----------------------------------------------------------------
// Setup / teardown
// ----------------------------------------------------------------

beforeEach(async () => {
  testDb = await createTestDb();
  await seedUser(testDb, USER_A_ID, 'clerk_user_a');
  await seedUser(testDb, USER_B_ID, 'clerk_user_b');
  mockUserId = USER_A_ID;
  mockIsOwner = 0;
});

afterEach(() => {
  testDb = null;
  mockUserId = USER_A_ID;
  mockIsOwner = 0;
});

// ================================================================
// GET /api/map/shading — requireAuth only
// ================================================================

describe('GET /api/map/shading', () => {
  it('returns 200 for a non-owner authenticated user (not owner-gated per ADL-28)', async () => {
    const res = await supertest(app).get('/api/map/shading');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ================================================================
// GET /api/map/shading/config — lazy seeding, per-user
// ================================================================

describe('GET /api/map/shading/config', () => {
  it('lazily seeds and returns 6 default rows on first access', async () => {
    const res = await supertest(app).get('/api/map/shading/config');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(6);
    expect(res.body[0]).toMatchObject({
      state_key: expect.any(String),
      display_name: expect.any(String),
      color_hex: expect.any(String),
    });
  });

  it('each user gets their own independently-seeded 6 rows', async () => {
    await supertest(app).get('/api/map/shading/config'); // seeds A

    mockUserId = USER_B_ID;
    const bRes = await supertest(app).get('/api/map/shading/config'); // seeds B
    expect(bRes.body).toHaveLength(6);

    const db = testDb!;
    const allRows = await db.select().from(schema.mapShadingConfig);
    expect(allRows).toHaveLength(12); // 6 per user, not shared
  });
});

// ================================================================
// PATCH /api/map/shading/config/:stateKey — write-guarded by userId
// ================================================================

describe('PATCH /api/map/shading/config/:stateKey', () => {
  it('updates the caller’s row — 200', async () => {
    await supertest(app).get('/api/map/shading/config'); // seed first
    const res = await supertest(app)
      .patch('/api/map/shading/config/active')
      .send({ color_hex: '#123456' });
    expect(res.status).toBe(200);
    expect(res.body.color_hex).toBe('#123456');
  });

  it('404s for a user who has no rows yet (nothing seeded, nothing to update)', async () => {
    const res = await supertest(app)
      .patch('/api/map/shading/config/active')
      .send({ color_hex: '#123456' });
    expect(res.status).toBe(404);
  });

  it('400s on an invalid hex color', async () => {
    await supertest(app).get('/api/map/shading/config');
    const res = await supertest(app)
      .patch('/api/map/shading/config/active')
      .send({ color_hex: 'not-a-color' });
    expect(res.status).toBe(400);
  });

  // ADL-28 R2 — per-user cache invalidation. A PATCH by user A must not leak
  // into or clobber user B's cached config view.
  it('does not affect another user’s config (cache or data)', async () => {
    await supertest(app).get('/api/map/shading/config'); // seed + cache A

    mockUserId = USER_B_ID;
    await supertest(app).get('/api/map/shading/config'); // seed + cache B

    mockUserId = USER_A_ID;
    await supertest(app).patch('/api/map/shading/config/active').send({ color_hex: '#111111' });

    mockUserId = USER_B_ID;
    const bConfig = await supertest(app).get('/api/map/shading/config');
    const bActive = bConfig.body.find((r: { state_key: string }) => r.state_key === 'active');
    expect(bActive.color_hex).not.toBe('#111111');
  });

  it('PATCH by user A immediately reflects for user A (cache invalidated, not stale)', async () => {
    await supertest(app).get('/api/map/shading/config'); // seed + cache A
    await supertest(app).patch('/api/map/shading/config/active').send({ color_hex: '#222222' });

    const after = await supertest(app).get('/api/map/shading/config');
    const active = after.body.find((r: { state_key: string }) => r.state_key === 'active');
    expect(active.color_hex).toBe('#222222');
  });
});
