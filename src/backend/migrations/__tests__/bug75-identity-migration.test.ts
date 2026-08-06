/**
 * BUG-75 / GE-16 (v3.19) — expand/contract migration end-state, SCHEMA layer.
 *
 * ATDD-first RED acceptance tests (OP-35). Authored BEFORE the migrations exist.
 *
 * createTestDb() applies the REAL migrations (src/backend/migrations/*.sql) — see
 * repositories/__tests__/test-db.ts. So this file locks the observable end-state
 * the EXPAND + SWITCH stages must produce (v3 §B2, corrected by review F2 + m-1/m-3):
 *
 *   EXPAND: cities gains nullable osm_type / osm_id / display_name.
 *   SWITCH: the global uniq_cities_name_country_region_ci is DROPPED and replaced by
 *           two partial unique indexes —
 *             • resolved-by-OSM: UNIQUE (osm_type, osm_id) WHERE osm_id IS NOT NULL
 *             • pending-per-creator: UNIQUE (name COLLATE NOCASE, country_code,
 *               COALESCE(region_id,0), COALESCE(created_by_user_id,'')) WHERE
 *               geocode_status='pending'
 *           plus the m-3 both-or-neither CHECK ((osm_type IS NULL) = (osm_id IS NULL)).
 *
 * "Green at each stage" (#8) is a per-commit CI property — the implementer stages
 * EXPAND and SWITCH as independently green commits (ADL-47). This file cannot see
 * the intermediate commits; it locks the FINAL invariants AND the two behaviours a
 * broken SWITCH would violate: coexistence of distinct osm_ids must succeed (no
 * unique violation), and a same-osm_id duplicate must be rejected (the index that
 * drives the merge). Those two are the observable proof the SWITCH landed correctly.
 */

import { describe, expect, it } from 'vitest';
import { createTestDb } from '../../repositories/__tests__/test-db.js';

/** Query the applied schema's sqlite_master through a fresh test DB's client. */
async function schemaRows(): Promise<Array<{ type: string; name: string; sql: string | null }>> {
  // createTestDb returns a drizzle instance over an in-memory client that has the
  // real migrations applied. Use its underlying .run/.all via drizzle's sql tag.
  const { sql } = await import('drizzle-orm');
  const db = await createTestDb();
  const rows = (await db.all(
    sql`SELECT type, name, sql FROM sqlite_master WHERE tbl_name = 'cities'`,
  )) as Array<{ type: string; name: string; sql: string | null }>;
  return rows;
}

describe('BUG-75 EXPAND — cities carries the identity columns', () => {
  it('cities has nullable osm_type, osm_id, display_name columns', async () => {
    const { sql } = await import('drizzle-orm');
    const db = await createTestDb();
    const cols = (await db.all(sql`PRAGMA table_info(cities)`)) as Array<{ name: string }>;
    const names = cols.map((c) => c.name);
    expect(names).toContain('osm_type');
    expect(names).toContain('osm_id');
    expect(names).toContain('display_name');
  });

  it('the identity columns are nullable (EXPAND is backward-compatible)', async () => {
    const { sql } = await import('drizzle-orm');
    const db = await createTestDb();
    const cols = (await db.all(sql`PRAGMA table_info(cities)`)) as Array<{
      name: string;
      notnull: number;
    }>;
    for (const name of ['osm_type', 'osm_id', 'display_name']) {
      const col = cols.find((c) => c.name === name);
      expect(col, `${name} column present`).toBeDefined();
      expect(col?.notnull, `${name} must be nullable`).toBe(0);
    }
  });
});

describe('BUG-75 SWITCH — the index set is cut over', () => {
  it('the old global uniq_cities_name_country_region_ci index is GONE', async () => {
    const rows = await schemaRows();
    const names = rows.filter((r) => r.type === 'index').map((r) => r.name);
    expect(names).not.toContain('uniq_cities_name_country_region_ci');
  });

  it('a resolved-by-OSM partial UNIQUE index on (osm_type, osm_id) WHERE osm_id IS NOT NULL exists', async () => {
    const rows = await schemaRows();
    const idx = rows.find(
      (r) =>
        r.type === 'index' &&
        r.sql != null &&
        /unique/i.test(r.sql) &&
        /osm_id/i.test(r.sql) &&
        /where/i.test(r.sql) &&
        /osm_id\s+is\s+not\s+null/i.test(r.sql),
    );
    expect(idx, 'resolved-by-OSM partial unique index missing').toBeDefined();
  });

  it('a pending-per-creator partial UNIQUE index scoped WHERE geocode_status = pending exists', async () => {
    const rows = await schemaRows();
    const idx = rows.find(
      (r) =>
        r.type === 'index' &&
        r.sql != null &&
        /unique/i.test(r.sql) &&
        /geocode_status\s*=\s*'pending'/i.test(r.sql) &&
        /created_by_user_id/i.test(r.sql),
    );
    expect(idx, 'pending-per-creator partial unique index missing').toBeDefined();
  });

  it('the m-3 both-or-neither CHECK ((osm_type IS NULL) = (osm_id IS NULL)) is present on cities', async () => {
    const rows = await schemaRows();
    const tableDdl = rows.find((r) => r.type === 'table')?.sql ?? '';
    // Tolerant of formatting/whitespace — both column names + an equality of NULL tests.
    const normalized = tableDdl.replace(/\s+/g, ' ').toLowerCase();
    expect(
      /osm_type.*is null.*=.*osm_id.*is null|osm_id.*is null.*=.*osm_type.*is null/.test(
        normalized,
      ),
      'both-or-neither osm CHECK missing',
    ).toBe(true);
  });
});

describe('BUG-75 SWITCH behaviour — coexistence succeeds, same-osm_id collides', () => {
  it('two rows with distinct osm_id but identical (name,country,region) can BOTH be inserted (no global-index violation)', async () => {
    const { sql } = await import('drizzle-orm');
    const db = await createTestDb();
    await db.run(
      sql`INSERT INTO countries (country_code, name, region_tier_enabled) VALUES ('GB','United Kingdom',1)`,
    );
    await db.run(
      sql`INSERT INTO regions (country_code, name, iso_3166_2) VALUES ('GB','England','GB-ENG')`,
    );
    const [region] = (await db.all(
      sql`SELECT id FROM regions WHERE iso_3166_2 = 'GB-ENG'`,
    )) as Array<{ id: number }>;

    await db.run(
      sql`INSERT INTO cities (name, country_code, region_id, geocode_status, osm_type, osm_id)
          VALUES ('Newport','GB',${region.id},'resolved','node',26700978)`,
    );
    // Same name+country+region, DIFFERENT osm_id — must NOT collide.
    await expect(
      db.run(
        sql`INSERT INTO cities (name, country_code, region_id, geocode_status, osm_type, osm_id)
            VALUES ('Newport','GB',${region.id},'resolved','node',27459103)`,
      ),
    ).resolves.toBeDefined();

    const count = (await db.all(
      sql`SELECT COUNT(*) AS n FROM cities WHERE name = 'Newport'`,
    )) as Array<{ n: number }>;
    expect(count[0].n).toBe(2);
  });

  it('two rows with the SAME osm_id are rejected by the resolved-by-OSM unique index', async () => {
    const { sql } = await import('drizzle-orm');
    const db = await createTestDb();
    await db.run(
      sql`INSERT INTO countries (country_code, name, region_tier_enabled) VALUES ('GB','United Kingdom',1)`,
    );
    await db.run(
      sql`INSERT INTO cities (name, country_code, geocode_status, osm_type, osm_id)
          VALUES ('Newport','GB','resolved','node',26700978)`,
    );
    await expect(
      db.run(
        sql`INSERT INTO cities (name, country_code, geocode_status, osm_type, osm_id)
            VALUES ('Newport','GB','resolved','node',26700978)`,
      ),
    ).rejects.toThrow();
  });

  it('multiple NULL-osm_id rows do NOT collide on the resolved-by-OSM index (partial WHERE osm_id IS NOT NULL)', async () => {
    const { sql } = await import('drizzle-orm');
    const db = await createTestDb();
    await db.run(
      sql`INSERT INTO countries (country_code, name, region_tier_enabled) VALUES ('GB','United Kingdom',1)`,
    );
    // Two legacy/pending rows with NULL osm_id, different creators — the resolved-by-OSM
    // index must not fire (it is partial), so this must succeed.
    await db.run(
      sql`INSERT INTO cities (name, country_code, geocode_status, created_by_user_id)
          VALUES ('Oldtown','GB','pending','user-x')`,
    );
    await expect(
      db.run(
        sql`INSERT INTO cities (name, country_code, geocode_status, created_by_user_id)
            VALUES ('Oldtown','GB','pending','user-y')`,
      ),
    ).resolves.toBeDefined();
  });
});
