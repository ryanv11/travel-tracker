/**
 * Travel Tracker — Drizzle Kit Configuration
 *
 * Used by drizzle-kit for schema migration generation and application:
 *   npm run db:generate  → generate migration files from schema changes
 *   npm run db:push      → apply schema directly to the database (dev shortcut)
 *   npm run db:studio    → open Drizzle Studio to inspect the database
 *
 * The dialect and credentials are driven by environment variables so this
 * same config file works for both SQLite (Phase 1) and PostgreSQL (Phase 2).
 * Changing DB_TYPE is the complete scope of the migration (ADL-04).
 *
 * SQLite uses @libsql/client as the driver (no native compilation required).
 * SQLITE_PATH must be a libSQL URL: file:./dev.db or file:/absolute/path.
 */
import { defineConfig } from 'drizzle-kit';
import { config } from 'dotenv';
// Load .env.local explicitly — dotenv/config only reads .env by default
config({ path: '.env.local' });
const dbType = process.env.DB_TYPE ?? 'sqlite';
if (dbType !== 'sqlite' && dbType !== 'postgres') {
    throw new Error(`drizzle.config.ts: Invalid DB_TYPE="${dbType}". Must be "sqlite" or "postgres".`);
}
export default defineConfig({
    // The schema file is the single source of truth for all table definitions
    schema: './src/backend/db/schema.ts',
    // Migration files are output here and committed to version control
    out: './src/backend/migrations',
    // Dialect is selected by DB_TYPE — no other config change required
    dialect: dbType === 'postgres' ? 'postgresql' : 'sqlite',
    dbCredentials: dbType === 'postgres'
        ? {
            // PostgreSQL: full connection URL (Phase 2)
            url: process.env.DATABASE_URL,
        }
        : {
            // SQLite: libSQL URL e.g. file:./dev.db or file:/abs/path/db.db
            url: process.env.SQLITE_PATH,
        },
});
//# sourceMappingURL=drizzle.config.js.map