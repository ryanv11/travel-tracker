/**
 * Travel Tracker — Database Connection Factory
 *
 * Returns a singleton Drizzle ORM instance configured for the engine
 * specified by the DB_TYPE environment variable.
 *
 * DB_TYPE = 'sqlite'   → @libsql/client (Phase 1: local app)
 *                         SQLITE_PATH must be a libSQL URL:
 *                           file:./path/to/db.db  (relative)
 *                           file:/absolute/path/to/db.db  (absolute/OneDrive)
 * DB_TYPE = 'postgres' → node-postgres  (Phase 2: hosted web app)
 *                         DATABASE_URL must be a PostgreSQL connection string.
 *
 * This factory is the ONLY place in the codebase that imports a database
 * driver directly. All other modules access the database through the
 * Drizzle instance returned here. Changing DB_TYPE is the complete scope
 * of the database migration (ADL-04, tech blueprint §3.2).
 *
 * Note on SQLite driver choice:
 *   @libsql/client is used instead of better-sqlite3 because it ships as
 *   pure JavaScript/WebAssembly with no native compilation required.
 *   It is fully compatible with Drizzle ORM and SQLite.
 *   For the OneDrive-synced database, set SQLITE_PATH to:
 *     file:/Users/yourname/Library/CloudStorage/OneDrive-Personal/TravelTracker/travel-tracker.db
 *
 * Usage:
 *   import { getDb } from './db/index.js';
 *   const db = getDb();
 *   const trips = await db.select().from(tripsTable);
 */

import { config } from 'dotenv';
config({ path: '.env.local' }); // Explicit load — dotenv/config only reads .env by default

import { createClient } from '@libsql/client';
import { Pool } from 'pg';
import { drizzle as drizzleLibSQL } from 'drizzle-orm/libsql';
import { drizzle as drizzlePG } from 'drizzle-orm/node-postgres';
import * as schema from './schema.js';

// Re-export schema types for convenience — consumers only need to import from here
export * from './schema.js';

// ----------------------------------------------------------------
// Type aliases
// ----------------------------------------------------------------

type LibSQLDb = ReturnType<typeof drizzleLibSQL<typeof schema>>;
type PgDb = ReturnType<typeof drizzlePG<typeof schema>>;

/** Union type covering both supported database engines */
export type AppDatabase = LibSQLDb | PgDb;

// ----------------------------------------------------------------
// Singleton — created once on first call to getDb()
// ----------------------------------------------------------------

let _db: AppDatabase | null = null;

/**
 * Returns the singleton database instance.
 * Creates the connection on first call; subsequent calls return the
 * same instance without reconnecting.
 *
 * @throws {Error} If DB_TYPE is missing or invalid, or required
 *   credentials are absent from the environment.
 */
export function getDb(): AppDatabase {
  if (_db) return _db;

  const dbType = process.env.DB_TYPE;

  if (dbType === 'sqlite') {
    _db = createLibSQLDb();
  } else if (dbType === 'postgres') {
    _db = createPostgresDb();
  } else {
    throw new Error(
      `[DB] Invalid or missing DB_TYPE: "${dbType}". ` +
        `Must be "sqlite" or "postgres". Check your .env.local file.`,
    );
  }

  return _db;
}

// ----------------------------------------------------------------
// Engine-specific constructors
// ----------------------------------------------------------------

/**
 * Creates a libSQL (SQLite-compatible) Drizzle instance.
 *
 * SQLITE_PATH must use the libSQL URL scheme:
 *   file:./dev.db                          — relative path
 *   file:/absolute/path/to/db.db           — absolute path (use for OneDrive)
 *
 * @throws {Error} If SQLITE_PATH is not set.
 */
function createLibSQLDb(): LibSQLDb {
  const sqlitePath = process.env.SQLITE_PATH;
  if (!sqlitePath) {
    throw new Error(
      '[DB] SQLITE_PATH is required when DB_TYPE=sqlite.\n' +
        '     Set it to a libSQL URL, e.g. SQLITE_PATH=file:./dev.db',
    );
  }

  const client = createClient({ url: sqlitePath });
  console.info(`[DB] SQLite (libSQL) connected: ${sqlitePath}`);
  return drizzleLibSQL(client, { schema });
}

/**
 * Creates a PostgreSQL Drizzle instance using a node-postgres connection pool.
 *
 * Phase 2 only. DATABASE_URL must be a PostgreSQL connection string,
 * e.g. postgresql://user:pass@host:5432/travel_tracker
 *
 * @throws {Error} If DATABASE_URL is not set.
 */
function createPostgresDb(): PgDb {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      '[DB] DATABASE_URL is required when DB_TYPE=postgres.',
    );
  }

  const client = new Pool({ connectionString: databaseUrl });
  console.info('[DB] PostgreSQL connected');
  return drizzlePG(client, { schema });
}
