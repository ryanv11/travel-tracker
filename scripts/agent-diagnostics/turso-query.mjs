#!/usr/bin/env node
/**
 * Travel Tracker — Agent diagnostic read-only Turso query (ADL-33 / OP-21)
 *
 * One-off SELECT runner against the production or staging Turso database,
 * using the read-only tokens in .env.agent-diagnostics (never the app's own
 * .env.local — those are separate credential sets, see ADL-33 §5).
 *
 * This intentionally does NOT use drizzle-kit or the app's getDb() — it's a
 * thin, dependency-minimal script using @libsql/client directly (already an
 * app dependency, no new package needed).
 *
 * The read-only token itself is the only enforcement boundary — this script
 * adds no additional write-blocking, and does not need to: an INSERT/UPDATE/
 * DELETE sent through a read-only token is rejected by Turso, not by this
 * script's logic.
 *
 * Usage:
 *   node scripts/agent-diagnostics/turso-query.mjs prod "SELECT id, name FROM trip_categories LIMIT 5"
 *   node scripts/agent-diagnostics/turso-query.mjs staging "SELECT COUNT(*) FROM trips"
 *
 * Per ADL-33 §2/§6: prefer staging for schema/logic debugging (no real user
 * data). Only query production when the bug is specifically about production
 * data — a production SELECT can return real user PII (trip data, emails).
 */

import { createClient } from '@libsql/client';
import { config } from 'dotenv';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '../../.env.agent-diagnostics');

try {
  readFileSync(envPath);
} catch {
  console.error(
    `[DIAG] ${envPath} not found. This script requires the gitignored agent-diagnostics ` +
      'credential file (ADL-33 §5) — see jobs/architect/tech/20260307-architecture-decisions-log.md.',
  );
  process.exit(1);
}
config({ path: envPath });

const [, , target, sql] = process.argv;

if (!target || !sql) {
  console.error('Usage: node scripts/agent-diagnostics/turso-query.mjs <prod|staging> "<SELECT ...>"');
  process.exit(1);
}

if (target !== 'prod' && target !== 'staging') {
  console.error(`[DIAG] Invalid target "${target}" — must be "prod" or "staging".`);
  process.exit(1);
}

// Blunt footgun-removal check (not a security control — the read-only token
// is the real enforcement boundary): refuse anything that isn't a SELECT, so
// a pasted multi-statement command doesn't accidentally attempt a write.
const trimmed = sql.trim().toUpperCase();
if (!trimmed.startsWith('SELECT') && !trimmed.startsWith('PRAGMA') && !trimmed.startsWith('EXPLAIN')) {
  console.error('[DIAG] Refusing: only SELECT/PRAGMA/EXPLAIN statements are supported by this script.');
  process.exit(1);
}

const url = process.env[`TURSO_${target.toUpperCase()}_URL`];
const authToken = process.env[`TURSO_${target.toUpperCase()}_TOKEN`];

if (!url || !authToken) {
  console.error(`[DIAG] TURSO_${target.toUpperCase()}_URL or _TOKEN missing from .env.agent-diagnostics.`);
  process.exit(1);
}

if (target === 'prod') {
  console.error('[DIAG] Querying PRODUCTION — results may contain real user PII. Proceeding.');
}

const client = createClient({ url, authToken });

try {
  const result = await client.execute(sql);
  console.log(`[DIAG] ${result.rows.length} row(s):`);
  console.table(result.rows);
} catch (err) {
  console.error('[DIAG] Query failed:', err instanceof Error ? err.message : err);
  process.exit(1);
}
