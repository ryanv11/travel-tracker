/**
 * Travel Tracker — Drizzle Kit Configuration
 *
 * Used by drizzle-kit for schema migration generation and application:
 *   npm run db:generate  → generate migration files from schema changes
 *   npm run db:migrate   → apply pending migrations
 *   npm run db:studio    → open Drizzle Studio to inspect the database
 *
 * db:push is FORBIDDEN (ADL-15) and removed from package.json — it bypasses the
 * patched migration path and can desync the migrations journal. Use generate + migrate.
 *
 * The dialect and credentials are driven by environment variables so this
 * same config file works for both SQLite (Phase 1) and PostgreSQL (Phase 2).
 * Changing DB_TYPE is the complete scope of the migration (ADL-04).
 *
 * SQLite uses @libsql/client as the driver (no native compilation required).
 * SQLITE_PATH must be a libSQL URL: file:./dev.db or file:/absolute/path.
 *
 * Remote Turso / TURSO_AUTH_TOKEN (ADL-32 §9): when SQLITE_PATH is a remote
 * libsql://... URL (hosted Turso — production or staging), two things differ
 * from local file: dev, both required for `db:migrate`/`db:generate` to work
 * against it — drizzle-kit's own migrate/generate commands open a separate
 * connection from the app's runtime getDb() (src/backend/db/index.ts), so
 * this file needs its own handling, not just that one:
 *   1. drizzle-kit requires `dialect: 'turso'` (not 'sqlite') to accept an
 *      `authToken` credential at all — verified against drizzle-kit's own
 *      Config type (node_modules/drizzle-kit/index.d.ts): the 'sqlite'
 *      dialect's dbCredentials type is `{ url: string }` only, no authToken
 *      field; only the 'turso' dialect's branch adds `authToken?: string`.
 *      'turso' and 'sqlite' otherwise share the same SQL grammar (both are
 *      libSQL) — this is purely a drizzle-kit config-surface distinction,
 *      not a schema/dialect change (ADL-25 still holds).
 *   2. TURSO_AUTH_TOKEN must be threaded into dbCredentials.
 * Local file: dev is unaffected — dialect stays 'sqlite', no token needed.
 */

import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// Load .env.local explicitly — dotenv/config only reads .env by default
config({ path: '.env.local' });

const dbType = process.env.DB_TYPE ?? 'sqlite';

if (dbType !== 'sqlite' && dbType !== 'postgres') {
  throw new Error(
    `drizzle.config.ts: Invalid DB_TYPE="${dbType}". Must be "sqlite" or "postgres".`,
  );
}

// A remote Turso database (production or staging) vs. a local SQLite file —
// see the module docstring for why drizzle-kit needs a different `dialect`
// value for the two, not just different credentials.
const isRemoteTurso = dbType === 'sqlite' && (process.env.SQLITE_PATH ?? '').startsWith('libsql://');

export default defineConfig({
  // The schema file is the single source of truth for all table definitions
  schema: './src/backend/db/schema.ts',

  // Migration files are output here and committed to version control
  out: './src/backend/migrations',

  // Dialect is selected by DB_TYPE (+ isRemoteTurso for the SQLite/Turso split)
  dialect: dbType === 'postgres' ? 'postgresql' : isRemoteTurso ? 'turso' : 'sqlite',

  dbCredentials:
    dbType === 'postgres'
      ? {
          // PostgreSQL: full connection URL (Phase 2)
          url: process.env.DATABASE_URL!,
        }
      : isRemoteTurso
        ? {
            // Remote Turso: libsql://... URL + auth token (required by Turso).
            url: process.env.SQLITE_PATH!,
            authToken: process.env.TURSO_AUTH_TOKEN,
          }
        : {
            // Local SQLite file: e.g. file:./dev.db or file:/abs/path/db.db
            url: process.env.SQLITE_PATH!,
          },
});
