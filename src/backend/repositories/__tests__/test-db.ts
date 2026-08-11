/**
 * Shared in-memory test database factory for repository tests.
 *
 * QUAL-03: this used to hand-write all 21 tables as literal DDL, duplicating
 * db/schema.ts. A migration could change the real schema while every
 * repository test kept passing green against the stale hand-written copy —
 * the tests could not detect the drift.
 *
 * Now migration-driven: the REAL migrations (src/backend/migrations/*.sql)
 * are applied once per worker (via drizzle-orm's libsql migrator, the same
 * programmatic path drizzle-kit's own migrate command wraps) to a template
 * in-memory database. The resulting schema is captured as a DDL snapshot
 * (`SELECT sql FROM sqlite_master`, in creation order) and cached at module
 * scope. Every createTestDb() call replays that cached snapshot into a fresh
 * :memory: database via a single client.batch() — no per-test migration
 * replay, so suite time is not affected by the number of migration files.
 * The snapshot itself is only ever built once (first createTestDb() call
 * within this module instance — Vitest's default `isolate: true` gives each
 * test file its own module registry, so in practice this is "once per test
 * file", not once per test).
 *
 * Because the snapshot is derived from applying the real migrations, a
 * migration/schema change that isn't reflected in the applied SQL now shows
 * up as a genuine repository-test failure instead of passing silently
 * against a stale hand-written copy.
 *
 * Each test should still call createTestDb() in beforeEach for full
 * per-test isolation (a fresh :memory: database) — only the *schema build*
 * is shared, never the data.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import * as schema from '../../db/schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_FOLDER = join(__dirname, '../../migrations');

// ----------------------------------------------------------------
// Schema snapshot — built once per module instance, reused by every
// createTestDb() call thereafter.
// ----------------------------------------------------------------

let cachedDdlPromise: Promise<string[]> | null = null;

/**
 * Applies the real migrations to a throwaway template :memory: database and
 * returns the resulting schema as an ordered list of DDL statements
 * (CREATE TABLE / CREATE INDEX / …), lifted straight from sqlite_master.
 *
 * Excludes drizzle's own `__drizzle_migrations` bookkeeping table and
 * SQLite's internal `sqlite_%` objects — neither is part of the application
 * schema tests should see.
 *
 * Cached at module scope: only the first call in a given module instance
 * pays the migration-replay cost. Every subsequent call (including from
 * concurrent createTestDb() invocations) awaits the same in-flight promise.
 */
function getSchemaDdl(): Promise<string[]> {
  if (!cachedDdlPromise) {
    cachedDdlPromise = (async () => {
      const templateClient = createClient({ url: ':memory:' });
      try {
        const templateDb = drizzle(templateClient, { schema });
        await migrate(templateDb, { migrationsFolder: MIGRATIONS_FOLDER });

        const { rows } = await templateClient.execute(
          `SELECT sql FROM sqlite_master
           WHERE sql IS NOT NULL
             AND name NOT LIKE 'sqlite_%'
             AND name != '__drizzle_migrations'
           ORDER BY rowid`,
        );
        return rows.map((row) => row.sql as string);
      } finally {
        templateClient.close();
      }
    })();
  }
  return cachedDdlPromise;
}

export async function createTestDb() {
  const client = createClient({ url: ':memory:' });

  await client.execute('PRAGMA foreign_keys = ON;');

  const ddlStatements = await getSchemaDdl();
  await client.batch(ddlStatements, 'write');

  return drizzle(client, { schema });
}

export type TestDb = Awaited<ReturnType<typeof createTestDb>>;

/**
 * A file-backed variant of {@link createTestDb} — QUAL-50 / QUAL-48 part 2.
 *
 * WHY THIS EXISTS: `@libsql/client`'s `db.transaction()` hands its live
 * connection to the transaction and nulls the client's internal `#db`, so the
 * NEXT query on the same client reopens a fresh connection from the client URL.
 * For a `:memory:` client that fresh connection is a brand-new EMPTY database —
 * so any query issued after a `db.transaction()` throws "no such table". A
 * file-backed client reopens the SAME file and sees the committed (or
 * rolled-back) state, which is exactly what a test asserting on the outcome of a
 * transaction needs. The QUAL-48 spike verified this and that the partial unique
 * indexes stay enforced (mock-fidelity, QUAL-22). See
 * jobs/backend/tech/20260810-qual48-transaction-spike.md.
 *
 * SCOPE: reach for this ONLY in test files that need to observe the DB across a
 * `db.transaction()` boundary (today: `itemRepository.create`'s atomic
 * base+extension write, and any test that issues a further query after a create).
 * `createTestDb()` (`:memory:`) stays the default everywhere else — it is faster
 * and the file-backed client costs per-test file I/O (~+30% on a suite made
 * entirely of these; the spike measured it).
 *
 * CLEANUP IS THE CALLER'S JOB: this returns a `cleanup()` the caller MUST invoke
 * (afterEach) to close the client and remove the unique temp directory. The
 * spike variant leaked temp dirs precisely because it skipped this — do not.
 */
export async function createFileBackedTestDb(): Promise<{ db: TestDb; cleanup: () => void }> {
  const dir = mkdtempSync(join(tmpdir(), 'tt-testdb-'));
  const file = join(dir, 'test.db');
  const client = createClient({ url: `file:${file}` });

  await client.execute('PRAGMA foreign_keys = ON;');

  const ddlStatements = await getSchemaDdl();
  await client.batch(ddlStatements, 'write');

  const db = drizzle(client, { schema });

  const cleanup = () => {
    try {
      client.close();
    } catch {
      /* already closed */
    }
    rmSync(dir, { recursive: true, force: true });
  };

  return { db, cleanup };
}

export const TEST_USER_ID = 'test-user-id';
export const OTHER_USER_ID = 'other-user-id';

export async function seedTestUser(
  db: TestDb,
  userId = TEST_USER_ID,
  clerkId = 'user_test',
  isOwner = 0,
) {
  const now = Date.now();
  await db
    .insert(schema.users)
    .values({
      id: userId,
      clerkId,
      email: `${userId}@example.com`,
      isOwner,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    })
    .onConflictDoNothing();
}

export async function seedTrip(
  db: TestDb,
  overrides: Partial<typeof schema.trips.$inferInsert> = {},
) {
  const [trip] = await db
    .insert(schema.trips)
    .values({
      name: 'Test Trip',
      startDate: '2026-06-01',
      endDate: '2026-06-10',
      status: 'planning',
      userId: TEST_USER_ID,
      ...overrides,
    })
    .returning();
  return trip;
}

export async function seedCountry(db: TestDb, countryCode: string, name: string) {
  await db.insert(schema.countries).values({ countryCode, name }).onConflictDoNothing();
}

export async function seedCity(
  db: TestDb,
  countryCode: string,
  name = 'TestCity',
  overrides: Partial<typeof schema.cities.$inferInsert> = {},
) {
  const [city] = await db
    .insert(schema.cities)
    .values({ name, countryCode, geocodeStatus: 'resolved', ...overrides })
    .returning();
  return city;
}

export async function seedCompanion(
  db: TestDb,
  overrides: Partial<typeof schema.companions.$inferInsert> = {},
) {
  const now = new Date().toISOString();
  const [companion] = await db
    .insert(schema.companions)
    .values({
      userId: TEST_USER_ID,
      name: 'Test Companion',
      isActive: 1,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    })
    .returning();
  return companion;
}
