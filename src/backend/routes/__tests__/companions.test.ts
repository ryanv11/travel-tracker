/**
 * Route integration tests for the Companions API (ADL-28 / BRD-AD08).
 *
 * Companions moved from /api/admin/companions (requireOwner) to
 * /api/companions (requireAuth only, userId-scoped) — see routes/companions.ts.
 * This file replaces the companion coverage that used to live in
 * routes/__tests__/owner-access.test.ts (HC-04) before ADL-28.
 *
 * Covers:
 *   GET    /api/companions           — all (active + inactive), any authenticated user
 *   GET    /api/companions/active    — active only
 *   POST   /api/companions           — create, scoped to the caller
 *   PATCH  /api/companions/:id       — update, write-guarded by userId
 *   DELETE /api/companions/:id       — soft-delete, write-guarded by userId
 *   Cross-user isolation: two users, distinct lists, no cross-visibility
 *   Duplicate name allowed across users, rejected within one user
 *
 * Uses an in-memory libSQL database per test (full isolation).
 */

import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../../db/schema.js';

// ----------------------------------------------------------------
// In-memory DB factory — only the tables the companions router touches.
// ----------------------------------------------------------------

async function createTestDb() {
  const client = createClient({ url: ':memory:' });
  await client.execute('PRAGMA foreign_keys = ON;');

  const ddlStatements = [
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY NOT NULL,
      clerk_id TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL,
      is_owner INTEGER DEFAULT 0 NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
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
  ];

  for (const sql of ddlStatements) {
    await client.execute(sql);
  }

  return drizzle(client, { schema });
}

// ----------------------------------------------------------------
// Test user constants
// ----------------------------------------------------------------

const USER_A_ID = 'companions-user-a-0000-0000-0000-000000000000';
const USER_B_ID = 'companions-user-b-0000-0000-0000-000000000000';

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
// Basic CRUD — requireAuth only, no requireOwner
// ================================================================

describe('GET /api/companions', () => {
  it('returns 200 for a non-owner authenticated user (not owner-gated per ADL-28)', async () => {
    const res = await supertest(app).get('/api/companions');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns all companions (active + inactive) owned by the caller', async () => {
    await supertest(app).post('/api/companions').send({ name: 'Partner' });
    await supertest(app).post('/api/companions').send({ name: 'Solo' });
    const res = await supertest(app).get('/api/companions');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toMatchObject({ name: expect.any(String), is_active: true });
  });
});

describe('GET /api/companions/active', () => {
  it('excludes deactivated companions', async () => {
    const created = await supertest(app).post('/api/companions').send({ name: 'Old Friend' });
    await supertest(app).delete(`/api/companions/${created.body.id}`);

    const res = await supertest(app).get('/api/companions/active');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('POST /api/companions', () => {
  it('creates a companion for the caller — 201 with snake_case body', async () => {
    const res = await supertest(app).post('/api/companions').send({ name: 'Family' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Family', is_active: true });
    expect(res.body).toHaveProperty('created_at');
    expect(res.body).toHaveProperty('updated_at');
  });

  it('rejects a duplicate name for the same user — 409', async () => {
    await supertest(app).post('/api/companions').send({ name: 'Partner' });
    const res = await supertest(app).post('/api/companions').send({ name: 'Partner' });
    expect(res.status).toBe(409);
  });

  it('allows the same name across two different users (BRD-AD08)', async () => {
    const first = await supertest(app).post('/api/companions').send({ name: 'Partner' });
    expect(first.status).toBe(201);

    mockUserId = USER_B_ID;
    const second = await supertest(app).post('/api/companions').send({ name: 'Partner' });
    expect(second.status).toBe(201);
  });

  it('400s on an empty name', async () => {
    const res = await supertest(app).post('/api/companions').send({ name: '' });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/companions/:id', () => {
  it('updates name — 200', async () => {
    const created = await supertest(app).post('/api/companions').send({ name: 'Original' });
    const res = await supertest(app)
      .patch(`/api/companions/${created.body.id}`)
      .send({ name: 'Renamed' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Renamed');
  });

  it('404s when the companion belongs to a different user', async () => {
    const created = await supertest(app).post('/api/companions').send({ name: 'Mine' });

    mockUserId = USER_B_ID;
    const res = await supertest(app)
      .patch(`/api/companions/${created.body.id}`)
      .send({ name: 'Hijacked' });
    expect(res.status).toBe(404);
  });

  it('404s for a non-existent id', async () => {
    const res = await supertest(app).patch('/api/companions/999999').send({ name: 'Ghost' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/companions/:id (soft-delete)', () => {
  it('sets is_active false — 200', async () => {
    const created = await supertest(app).post('/api/companions').send({ name: 'Retiring' });
    const res = await supertest(app).delete(`/api/companions/${created.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.is_active).toBe(false);
  });

  it('404s when the companion belongs to a different user', async () => {
    const created = await supertest(app).post('/api/companions').send({ name: 'Mine' });

    mockUserId = USER_B_ID;
    const res = await supertest(app).delete(`/api/companions/${created.body.id}`);
    expect(res.status).toBe(404);
  });

  it('400s when already inactive', async () => {
    const created = await supertest(app).post('/api/companions').send({ name: 'Once' });
    await supertest(app).delete(`/api/companions/${created.body.id}`);
    const res = await supertest(app).delete(`/api/companions/${created.body.id}`);
    expect(res.status).toBe(400);
  });
});

// ================================================================
// Cross-user isolation
// ================================================================

describe('Cross-user isolation', () => {
  it('user A cannot see user B’s companions and vice versa', async () => {
    await supertest(app).post('/api/companions').send({ name: 'A Companion' });

    mockUserId = USER_B_ID;
    await supertest(app).post('/api/companions').send({ name: 'B Companion' });

    const bList = await supertest(app).get('/api/companions');
    expect(bList.body).toHaveLength(1);
    expect(bList.body[0].name).toBe('B Companion');

    mockUserId = USER_A_ID;
    const aList = await supertest(app).get('/api/companions');
    expect(aList.body).toHaveLength(1);
    expect(aList.body[0].name).toBe('A Companion');
  });
});
