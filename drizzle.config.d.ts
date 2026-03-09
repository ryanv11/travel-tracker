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
declare const _default: import("drizzle-kit").Config;
export default _default;
//# sourceMappingURL=drizzle.config.d.ts.map