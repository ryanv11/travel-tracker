/**
 * Travel Tracker — Startup Service
 *
 * Runs once at server startup to ensure all seed data is present.
 * All operations are idempotent — safe to call on every startup.
 *
 * Updated startup sequence (Corrections message, 2026-03-07):
 *   1. seedAdminData()  — trip_categories, activities, companions, map_shading_config
 *   2. seedCountries()  — countries table from data/countries.json
 *   3. seedRegions()    — regions table from data/regions.json (all 26 region-tier countries)
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { count, sql } from 'drizzle-orm';
import { countries, getDb, regions, users } from '../db/index.js';
import { activityRepository } from '../repositories/activities.js';
import { tripCategoryRepository } from '../repositories/tripCategories.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ----------------------------------------------------------------
// FK enforcement assertion (QUAL-11, ADL-41 §7.2.1 decision 9)
// ----------------------------------------------------------------

/**
 * Asserts — does NOT set — that foreign-key enforcement is active on the
 * real application connection, and fails loudly at boot if it is not.
 *
 * Every declared ON DELETE CASCADE / SET NULL in schema.ts (trips → items,
 * trips → trip_places, items.carried_from_item_id, etc. — see ADL-41 §7) is
 * only enforced because `@libsql/client` currently enables FK enforcement by
 * default. That is a driver default nothing in this repo states, tests, or
 * would notice changing — a future major-version bump could silently flip
 * it, and the symptom would be silent orphaning in production discovered
 * months later.
 *
 * Per ADL-41 §7.2/§7.2.1: the fix is NOT to issue `PRAGMA foreign_keys=ON`
 * at connect. On the remote libsql:// HTTP transport each statement is
 * independently dispatched, so a PRAGMA set once at connect time has no
 * reliable session to persist into — it would look like a fix and guarantee
 * nothing. Instead this reads the actual per-statement enforcement state,
 * which is correct on both the embedded and remote transports because it
 * reflects the condition every real cascade executes under.
 *
 * Postgres (DB_TYPE=postgres) always enforces declared FK constraints —
 * there is no PRAGMA equivalent and no driver-default risk — so this is a
 * deliberate no-op there.
 *
 * @throws {Error} if DB_TYPE=sqlite and PRAGMA foreign_keys does not return 1.
 */
export async function assertForeignKeysEnabled(): Promise<void> {
  if (process.env.DB_TYPE !== 'sqlite') {
    console.info(
      '[STARTUP] FK enforcement check skipped — DB_TYPE=postgres always enforces declared FKs',
    );
    return;
  }

  const db = getDb();
  const row = await db.get<{ foreign_keys: number }>(sql`PRAGMA foreign_keys`);
  const value = row?.foreign_keys;

  if (value !== 1) {
    throw new Error(
      `[STARTUP] FATAL: PRAGMA foreign_keys returned ${JSON.stringify(value)}, expected 1. ` +
        'Foreign-key enforcement is OFF on the application connection — every declared ' +
        'ON DELETE CASCADE / SET NULL in schema.ts (see ADL-41 §7) would silently stop ' +
        'firing, orphaning child rows instead of cascading. Refusing to start. See ADL-41 ' +
        '§7.2.1 decision 9.',
    );
  }

  console.info('[STARTUP] FK enforcement: OK (PRAGMA foreign_keys = 1)');
}

// ----------------------------------------------------------------
// Admin data seed
// ----------------------------------------------------------------

/**
 * Reconciles per-user trip_categories and activities defaults for every
 * existing user. Idempotent — each per-user seed uses onConflictDoNothing on
 * the (user_id, name) unique index.
 *
 * ADL-46 (AD-09, D3): trip_categories and activities are now per-user
 * (userId NOT NULL FK) — there is no single global row set to seed at startup
 * any more. New users are lazily seeded on first access (read or write) via
 * the repositories' ensureSeeded; this startup pass is the reconciliation
 * half of §3.2.1 — it back-fills defaults for users who predate the change
 * (e.g. a pre-existing non-owner whose lists were never populated by the S3
 * migration's owner-only CROSS JOIN backfill). Because ensureSeeded only fires
 * when a user has zero rows, this pass will NOT resurrect entries a user has
 * deactivated — it seeds only users who have no rows at all.
 *
 * ADL-28 (AD-07/AD-08): companions and map_shading_config are likewise per-user;
 * companions have no default list post-migration, and map_shading_config is
 * lazily seeded per-user on first access to the shading config endpoint.
 */
export async function seedAdminData(): Promise<void> {
  const db = getDb();

  const allUsers = await db.select({ id: users.id }).from(users);
  for (const u of allUsers) {
    await tripCategoryRepository.ensureSeeded(u.id);
    await activityRepository.ensureSeeded(u.id);
  }
  console.info(
    `[STARTUP] Admin data: per-user categories/activities reconciled for ${allUsers.length} user(s)`,
  );
}

// ----------------------------------------------------------------
// Country seed (GE-04, GE-05, GE-06)
// ----------------------------------------------------------------

/**
 * Populates the countries table from data/countries.json if the table is empty.
 * Skips silently if already populated.
 */
export async function seedCountries(): Promise<void> {
  const db = getDb();

  const [{ value: existingCount }] = await db.select({ value: count() }).from(countries);
  if (existingCount > 0) {
    console.info('[STARTUP] Countries already seeded, skipping');
    return;
  }

  const dataPath = join(__dirname, '../../../data/countries.json');
  const rawData = readFileSync(dataPath, 'utf-8');
  const countryData = JSON.parse(rawData) as Array<{
    country_code: string;
    name: string;
    region_tier_enabled: number;
    region_tier_label: string | null;
  }>;

  await db
    .insert(countries)
    .values(
      countryData.map((c) => ({
        countryCode: c.country_code,
        name: c.name,
        regionTierEnabled: c.region_tier_enabled,
        regionTierLabel: c.region_tier_label,
      })),
    )
    .onConflictDoNothing();

  console.info(`[STARTUP] ✓ Countries seeded (${countryData.length} rows)`);
}

// ----------------------------------------------------------------
// Region seed — ISO 3166-2 subdivisions (GE-01/GE-02/GE-03)
//
// Originally US/AU/CA only (Correction 2), extended to GB by BUG-30, and to all
// 26 region_tier_enabled countries — 714 rows — by BUG-77 / ADL-48 S1.
// ----------------------------------------------------------------

/**
 * Number of rows per upsert statement. Each row binds 3 parameters, so 200 rows is
 * 600 bound parameters — comfortably under SQLite's most conservative historical
 * SQLITE_MAX_VARIABLE_NUMBER of 999, which a single 714-row statement (2,142 params)
 * would exceed on an older engine build. Only ever paid on a seed that actually runs.
 */
const REGION_UPSERT_CHUNK = 200;

type RegionSeedRow = { country_code: string; name: string; iso_3166_2: string };
type RegionContentRow = { countryCode: string; name: string; iso3166_2: string };

/**
 * Order-independent content hash over a set of region rows.
 *
 * `iso_3166_2` is the identity (it carries a UNIQUE index); `country_code` and `name`
 * are the content. Sorting by the identity before hashing makes the digest independent
 * of row order, so it compares the *content* of the seed file against the *content* of
 * the table without caring how either is ordered.
 *
 * The separators are U+0001 and U+0002 rather than a printable delimiter, so a subdivision
 * name containing the delimiter cannot forge a different field or row boundary and make two
 * genuinely different row sets hash identically. Neither control character occurs in ISO
 * 3166-2 data.
 */
const REGION_FIELD_SEP = String.fromCharCode(1);
const REGION_ROW_SEP = String.fromCharCode(2);

function regionContentHash(rows: RegionContentRow[]): string {
  const canonical = [...rows]
    .sort((a, b) => (a.iso3166_2 < b.iso3166_2 ? -1 : a.iso3166_2 > b.iso3166_2 ? 1 : 0))
    .map((r) => [r.iso3166_2, r.countryCode, r.name].join(REGION_FIELD_SEP))
    .join(REGION_ROW_SEP);
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Reconciles the regions table with data/regions.json — 714 ISO 3166-2 subdivisions
 * covering all 26 `region_tier_enabled = 1` countries (BUG-77, ADL-48 S1).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS SEED IS ADDITIVE. IT MUST NEVER DELETE AND RELOAD. Read before editing.
 * ─────────────────────────────────────────────────────────────────────────────
 * `cities.region_id` REFERENCES `regions.id` (schema.ts; migration 0000 line 23) and
 * `regions.id` is AUTOINCREMENT. A DELETE + reload re-issues ids, which either aborts
 * under the FK enforcement asserted at boot by assertForeignKeysEnabled(), or — if
 * enforcement were ever off — silently repoints every existing city at a *different*
 * subdivision. That corruption is invisible until a user notices their city moved state.
 *
 * ADL-48 §8.1 describes hash-gated seeding as DELETE + batch-insert, and §11's S1 row
 * invokes that mechanism by name. **That pattern is correct only for a table nothing
 * references** — §8.1 says so itself, justifying its safety as "nothing references
 * gazetteer_cities". `regions` is referenced, so the mechanism here is an upsert instead.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE GATE CHANGED from `existingCount > 0`
 * ─────────────────────────────────────────────────────────────────────────────
 * The previous gate returned early whenever the table held any rows at all. Staging and
 * production each hold exactly 76 regions, so a regenerated 714-row file would never have
 * been applied to either — the new subdivisions would ship and do nothing. This is the same
 * row-count-gating trap that made BUG-30 require a hand-written patch migration (0008).
 *
 * The gate is now content-addressed: hash the bundled file, hash what the table holds for
 * those same codes, compare. A data correction now applies itself on next boot with no
 * migration.
 *
 * **Steady-state cost is one read and zero writes** — a single `SELECT` of three small
 * columns (714 rows, ~30 KB, one round trip), then a hash comparison in memory. No stored
 * hash, and therefore no schema change: persisting one would need a new meta table, and
 * `regions` itself has nowhere to put it. Hashing the table instead of trusting a stored
 * marker is also strictly stronger — it detects drift applied directly to the database,
 * which a stored hash would happily vouch for.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY `DO UPDATE SET` RATHER THAN `DO NOTHING`
 * ─────────────────────────────────────────────────────────────────────────────
 * Convergence. Under DO NOTHING an upstream *name* correction would leave the table's hash
 * permanently different from the file's, so the gate would fail and re-run the seed on
 * every single boot, forever, without ever fixing the row it keeps noticing. `setWhere`
 * narrows the UPDATE to rows that genuinely differ, so a run that only adds new codes does
 * not touch — or bump `updated_at` on — a single existing row.
 *
 * Rows present in the table but absent from the file are **left alone**, never deleted:
 * one of them could already be referenced by a city. The gate only asks "is every bundled
 * row present and correct", which is exactly what an additive seed can guarantee.
 */
export async function seedRegions(): Promise<void> {
  const db = getDb();

  const dataPath = join(__dirname, '../../../data/regions.json');
  const rawData = readFileSync(dataPath, 'utf-8');
  const regionData = JSON.parse(rawData) as RegionSeedRow[];

  const bundled: RegionContentRow[] = regionData.map((r) => ({
    countryCode: r.country_code,
    name: r.name,
    iso3166_2: r.iso_3166_2,
  }));
  const bundledHash = regionContentHash(bundled);
  const bundledCodes = new Set(bundled.map((r) => r.iso3166_2));

  // --- The gate: one read, no writes. ---
  const existing = await db
    .select({
      countryCode: regions.countryCode,
      name: regions.name,
      iso3166_2: regions.iso3166_2,
    })
    .from(regions);

  const existingBundled = existing.filter((r) => bundledCodes.has(r.iso3166_2));
  if (
    existingBundled.length === bundled.length &&
    regionContentHash(existingBundled) === bundledHash
  ) {
    console.info(
      `[STARTUP] Regions up to date (${bundled.length} rows, content ${bundledHash.slice(0, 12)}), skipping`,
    );
    return;
  }

  for (let i = 0; i < bundled.length; i += REGION_UPSERT_CHUNK) {
    await db
      .insert(regions)
      .values(bundled.slice(i, i + REGION_UPSERT_CHUNK))
      .onConflictDoUpdate({
        target: regions.iso3166_2,
        set: {
          name: sql`excluded.name`,
          countryCode: sql`excluded.country_code`,
          updatedAt: sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`,
        },
        // Only rewrite rows whose content actually differs. Keeps a purely additive
        // run from touching, or bumping updated_at on, any pre-existing row.
        setWhere: sql`${regions.name} IS NOT excluded.name OR ${regions.countryCode} IS NOT excluded.country_code`,
      });
  }

  const [{ value: totalAfter }] = await db.select({ value: count() }).from(regions);
  console.info(
    `[STARTUP] ✓ Regions reconciled (${bundled.length} bundled, ${existingBundled.length} already present, ${totalAfter} total, content ${bundledHash.slice(0, 12)})`,
  );
}
