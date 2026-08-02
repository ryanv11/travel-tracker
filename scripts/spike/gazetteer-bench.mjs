#!/usr/bin/env node
/**
 * Travel Tracker — ADL-48 gazetteer search benchmark  (SPIKE, Q1/Q2)
 *
 * STATUS: SPIKE ARTEFACT. Measurement harness only — ships nothing.
 *
 * Answers, with real timings against the real 170,540-row dataset in local libSQL:
 *
 *   Q1  Which query shape can serve city search at 170k rows, and what does each
 *       cost SEMANTICALLY (not just in milliseconds)?
 *          - leading-wildcard LIKE '%q%'   (today's behaviour, cities.ts:48)
 *          - prefix LIKE 'q%'              (indexable, but "york" stops finding "New York")
 *          - FTS5                          (token-prefix; finds "New York" from "york")
 *          - FTS5 substring via trigram    (full substring parity, larger index)
 *   Q1b Minimum query length — where does the cost curve actually bite?
 *   Q1c Result caps.
 *   Q2  Narrowing by the trip's declared countries: hard WHERE filter vs ORDER BY rank.
 *
 * Every timing here is LOCAL libSQL (a file database) — CPU and disk only, no
 * network. The Turso/remote regime is measured separately in gazetteer-turso-probe.mjs;
 * the two must be read together, because if the network term dominates then query
 * shape is the wrong lever entirely.
 *
 * Usage:
 *   node scripts/spike/gazetteer-bench.mjs [--db <path>] [--rebuild]
 */

import { createClient } from '@libsql/client';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '../..');

const argv = process.argv.slice(2);
const argOf = (f) => {
  const i = argv.indexOf(f);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : null;
};
const DB_PATH = path.resolve(REPO_ROOT, argOf('--db') ?? 'spike-gazetteer.db');
const REBUILD = argv.includes('--rebuild');

const GAZ_PATH = path.join(REPO_ROOT, 'data/gazetteer-cities.json');
if (!existsSync(GAZ_PATH)) {
  console.error(`[BENCH] ${GAZ_PATH} not found — run scripts/generate-gazetteer.mjs first.`);
  process.exit(1);
}

if (REBUILD && existsSync(DB_PATH)) {
  for (const suffix of ['', '-shm', '-wal']) {
    try { rmSync(DB_PATH + suffix); } catch { /* absent */ }
  }
}

const db = createClient({ url: `file:${DB_PATH}` });
const ms = () => Number(process.hrtime.bigint() / 1000n) / 1000;

/** Median + p95 of n timed runs. Median is the honest headline; p95 catches cliff behaviour. */
async function timeIt(label, fn, runs = 7) {
  await fn(); // warm
  const samples = [];
  for (let i = 0; i < runs; i++) {
    const t0 = ms();
    await fn();
    samples.push(ms() - t0);
  }
  samples.sort((a, b) => a - b);
  return {
    label,
    median: samples[Math.floor(samples.length / 2)],
    min: samples[0],
    max: samples[samples.length - 1],
  };
}
const f = (n) => n.toFixed(1).padStart(8);

// ================================================================
// 1. Build
// ================================================================
const existing = await db
  .execute("SELECT name FROM sqlite_master WHERE type='table' AND name='gazetteer_cities'")
  .then((r) => r.rows.length > 0)
  .catch(() => false);

if (!existing) {
  console.info('[BENCH] building gazetteer_cities …');
  const rows = JSON.parse(readFileSync(GAZ_PATH, 'utf8'));
  console.info(`[BENCH] ${rows.length} rows to load`);

  await db.execute(`CREATE TABLE gazetteer_cities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    country_code TEXT NOT NULL,
    region_iso TEXT,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL
  )`);

  const t0 = ms();
  const BATCH = 2000;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const placeholders = chunk.map(() => '(?,?,?,?,?)').join(',');
    const args = [];
    for (const r of chunk) args.push(r.name, r.country_code, r.region_iso, r.latitude, r.longitude);
    await db.execute({
      sql: `INSERT INTO gazetteer_cities (name,country_code,region_iso,latitude,longitude) VALUES ${placeholders}`,
      args,
    });
  }
  const insertMs = ms() - t0;

  const t1 = ms();
  await db.execute('CREATE INDEX idx_gaz_name_nocase ON gazetteer_cities (name COLLATE NOCASE)');
  await db.execute('CREATE INDEX idx_gaz_country ON gazetteer_cities (country_code)');
  await db.execute(
    'CREATE INDEX idx_gaz_name_country ON gazetteer_cities (name COLLATE NOCASE, country_code)',
  );
  const indexMs = ms() - t1;

  // FTS5 — token prefix. Finds "New York" from "york" (unlike LIKE 'york%').
  const t2 = ms();
  await db.execute(
    "CREATE VIRTUAL TABLE gaz_fts USING fts5(name, content='gazetteer_cities', content_rowid='id', tokenize='unicode61')",
  );
  await db.execute("INSERT INTO gaz_fts(gaz_fts) VALUES('rebuild')");
  const ftsMs = ms() - t2;

  // FTS5 trigram — true substring parity with LIKE '%q%' (needs >=3 chars).
  let trigramMs = -1;
  try {
    const t3 = ms();
    await db.execute(
      "CREATE VIRTUAL TABLE gaz_trigram USING fts5(name, content='gazetteer_cities', content_rowid='id', tokenize='trigram')",
    );
    await db.execute("INSERT INTO gaz_trigram(gaz_trigram) VALUES('rebuild')");
    trigramMs = ms() - t3;
  } catch (e) {
    console.warn(`[BENCH] trigram tokenizer unavailable: ${e.message}`);
  }

  console.info(`[BENCH] insert ${insertMs.toFixed(0)} ms · b-tree idx ${indexMs.toFixed(0)} ms · fts5 ${ftsMs.toFixed(0)} ms · trigram ${trigramMs.toFixed(0)} ms`);
}

const [{ n: total }] = (await db.execute('SELECT COUNT(*) AS n FROM gazetteer_cities')).rows;
console.info(`\n[BENCH] gazetteer_cities rows: ${total}`);
console.info(`[BENCH] db file: ${(await import('node:fs')).statSync(DB_PATH).size / 1024 / 1024} MB\n`);

// ================================================================
// 2. Q1 — DOES THE INDEX ACTUALLY GET USED? (verify, don't infer)
// ================================================================
console.info('='.repeat(78));
console.info('Q1a — EXPLAIN QUERY PLAN: is a leading wildcard really unindexable?');
console.info('='.repeat(78));
for (const [label, sql, args] of [
  ["today: LIKE '%york%'", 'SELECT id FROM gazetteer_cities WHERE name LIKE ?', ['%york%']],
  ["prefix: LIKE 'york%'", 'SELECT id FROM gazetteer_cities WHERE name LIKE ?', ['york%']],
  [
    "prefix + COLLATE NOCASE",
    'SELECT id FROM gazetteer_cities WHERE name LIKE ? COLLATE NOCASE',
    ['york%'],
  ],
  [
    "prefix + country",
    'SELECT id FROM gazetteer_cities WHERE name LIKE ? AND country_code = ?',
    ['york%', 'GB'],
  ],
  ['fts5 MATCH', "SELECT rowid FROM gaz_fts WHERE gaz_fts MATCH ?", ['york*']],
]) {
  try {
    const plan = await db.execute({ sql: `EXPLAIN QUERY PLAN ${sql}`, args });
    console.info(`  ${label.padEnd(26)} → ${plan.rows.map((r) => r.detail).join(' | ')}`);
  } catch (e) {
    console.info(`  ${label.padEnd(26)} → ERROR ${e.message}`);
  }
}

// ================================================================
// 3. Q1 — query shape comparison
// ================================================================
const TERMS = ['york', 'lond', 'paris', 'newp', 'springf', 'san', 'glas', 'inver'];
const LIMIT = 50;

console.info('\n' + '='.repeat(78));
console.info(`Q1b — QUERY SHAPE, median ms over ${TERMS.length} terms (LIMIT ${LIMIT}, local libSQL)`);
console.info('='.repeat(78));
console.info('  shape                          median      min      max   rows(ex)');

const shapes = [
  {
    label: "LIKE '%q%'  (TODAY)",
    run: (q) => db.execute({ sql: `SELECT id,name,country_code,region_iso,latitude,longitude FROM gazetteer_cities WHERE name LIKE ? ORDER BY name LIMIT ${LIMIT}`, args: [`%${q}%`] }),
  },
  {
    label: "LIKE 'q%'   (prefix)",
    run: (q) => db.execute({ sql: `SELECT id,name,country_code,region_iso,latitude,longitude FROM gazetteer_cities WHERE name LIKE ? ORDER BY name LIMIT ${LIMIT}`, args: [`${q}%`] }),
  },
  {
    label: 'FTS5 MATCH  (token pfx)',
    run: (q) => db.execute({ sql: `SELECT g.id,g.name,g.country_code,g.region_iso,g.latitude,g.longitude FROM gaz_fts JOIN gazetteer_cities g ON g.id=gaz_fts.rowid WHERE gaz_fts MATCH ? LIMIT ${LIMIT}`, args: [`${q}*`] }),
  },
  {
    label: 'FTS5 trigram (substring)',
    run: (q) => db.execute({ sql: `SELECT g.id,g.name,g.country_code,g.region_iso,g.latitude,g.longitude FROM gaz_trigram JOIN gazetteer_cities g ON g.id=gaz_trigram.rowid WHERE gaz_trigram MATCH ? LIMIT ${LIMIT}`, args: [`"${q}"`] }),
  },
];

const shapeResults = {};
for (const s of shapes) {
  const meds = [];
  let exampleRows = 0;
  for (const q of TERMS) {
    try {
      const r = await timeIt(q, () => s.run(q), 5);
      meds.push(r.median);
      if (q === 'york') exampleRows = (await s.run(q)).rows.length;
    } catch (e) {
      console.info(`  ${s.label.padEnd(28)} ERROR ${e.message}`);
      meds.length = 0;
      break;
    }
  }
  if (!meds.length) continue;
  meds.sort((a, b) => a - b);
  shapeResults[s.label] = meds[Math.floor(meds.length / 2)];
  console.info(
    `  ${s.label.padEnd(28)}${f(meds[Math.floor(meds.length / 2)])}${f(meds[0])}${f(meds[meds.length - 1])}   ${exampleRows}`,
  );
}

// ================================================================
// 4. Q1 — SEMANTIC cost. The part a speed table hides.
// ================================================================
console.info('\n' + '='.repeat(78));
console.info('Q1c — SEMANTIC COST: what each shape FINDS for the same typed text');
console.info('='.repeat(78));
const semanticProbes = ['york', 'orleans', 'angeles', 'vegas', 'sur', 'ness'];
console.info('  typed      LIKE %q%   LIKE q%    FTS5 tok   FTS5 trig   example miss');
for (const q of semanticProbes) {
  const sub = (await db.execute({ sql: 'SELECT COUNT(*) n FROM gazetteer_cities WHERE name LIKE ?', args: [`%${q}%`] })).rows[0].n;
  const pfx = (await db.execute({ sql: 'SELECT COUNT(*) n FROM gazetteer_cities WHERE name LIKE ?', args: [`${q}%`] })).rows[0].n;
  let fts = 0, tri = 0;
  try { fts = (await db.execute({ sql: 'SELECT COUNT(*) n FROM gaz_fts WHERE gaz_fts MATCH ?', args: [`${q}*`] })).rows[0].n; } catch {}
  try { tri = (await db.execute({ sql: 'SELECT COUNT(*) n FROM gaz_trigram WHERE gaz_trigram MATCH ?', args: [`"${q}"`] })).rows[0].n; } catch {}
  // A concrete name the prefix shape loses
  const miss = (await db.execute({ sql: 'SELECT name FROM gazetteer_cities WHERE name LIKE ? AND name NOT LIKE ? LIMIT 1', args: [`%${q}%`, `${q}%`] })).rows[0]?.name ?? '—';
  console.info(`  ${q.padEnd(10)}${String(sub).padStart(8)}${String(pfx).padStart(11)}${String(fts).padStart(11)}${String(tri).padStart(12)}   ${miss}`);
}

// ================================================================
// 5. Q1d — minimum query length
// ================================================================
console.info('\n' + '='.repeat(78));
console.info('Q1d — MIN QUERY LENGTH: cost and result count vs typed characters');
console.info('='.repeat(78));
console.info('  chars  sample   LIKE %q% ms   rows matched   FTS5 ms   note');
for (const q of ['s', 'sa', 'san', 'sant', 'santa']) {
  const t = await timeIt('x', () => db.execute({ sql: `SELECT id,name FROM gazetteer_cities WHERE name LIKE ? ORDER BY name LIMIT ${LIMIT}`, args: [`%${q}%`] }), 5);
  const n = (await db.execute({ sql: 'SELECT COUNT(*) n FROM gazetteer_cities WHERE name LIKE ?', args: [`%${q}%`] })).rows[0].n;
  let ft = -1;
  try { const r = await timeIt('y', () => db.execute({ sql: `SELECT rowid FROM gaz_fts WHERE gaz_fts MATCH ? LIMIT ${LIMIT}`, args: [`${q}*`] }), 5); ft = r.median; } catch {}
  console.info(`  ${String(q.length).padStart(5)}  ${q.padEnd(8)}${f(t.median)}   ${String(n).padStart(12)}${f(ft)}`);
}

// ================================================================
// 6. Q2 — narrowing by trip country: FILTER vs RANK
// ================================================================
console.info('\n' + '='.repeat(78));
console.info('Q2 — NARROWING BY TRIP COUNTRY: hard WHERE filter vs ORDER BY rank');
console.info('='.repeat(78));
const TRIP_SETS = [
  { label: '1 country  (GB)', ccs: ['GB'] },
  { label: '2 countries (GB,FR)', ccs: ['GB', 'FR'] },
  { label: '4 countries', ccs: ['GB', 'FR', 'ES', 'IT'] },
];
console.info('  scenario                         unnarrowed   WHERE filt   ORDER BY rank');
for (const { label, ccs } of TRIP_SETS) {
  const inList = ccs.map(() => '?').join(',');
  const meds = { base: [], filt: [], rank: [] };
  for (const q of TERMS) {
    meds.base.push((await timeIt('b', () => db.execute({ sql: `SELECT id,name,country_code FROM gazetteer_cities WHERE name LIKE ? ORDER BY name LIMIT ${LIMIT}`, args: [`%${q}%`] }), 5)).median);
    meds.filt.push((await timeIt('f', () => db.execute({ sql: `SELECT id,name,country_code FROM gazetteer_cities WHERE name LIKE ? AND country_code IN (${inList}) ORDER BY name LIMIT ${LIMIT}`, args: [`%${q}%`, ...ccs] }), 5)).median);
    meds.rank.push((await timeIt('r', () => db.execute({ sql: `SELECT id,name,country_code FROM gazetteer_cities WHERE name LIKE ? ORDER BY (country_code IN (${inList})) DESC, name LIMIT ${LIMIT}`, args: [`%${q}%`, ...ccs] }), 5)).median);
  }
  const med = (a) => { a.sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
  console.info(`  ${label.padEnd(32)}${f(med(meds.base))}${f(med(meds.filt))}${f(med(meds.rank))}`);
}

// Q2 — what does a hard filter COST the user? Cross-border cities lost.
console.info('\n  What a hard WHERE filter removes (trip declares GB only):');
for (const q of ['calais', 'newport', 'bergen']) {
  const all = (await db.execute({ sql: 'SELECT name,country_code FROM gazetteer_cities WHERE name LIKE ? LIMIT 200', args: [`%${q}%`] })).rows;
  const gb = all.filter((r) => r.country_code === 'GB').length;
  console.info(`    "${q}": ${all.length} rows worldwide, ${gb} in GB → filter hides ${all.length - gb}`);
}

// ================================================================
// 7. Q1e — result caps and ambiguity detectability
// ================================================================
console.info('\n' + '='.repeat(78));
console.info('Q1e — RESULT CAPS: can ambiguity stay detectable under a cap?');
console.info('='.repeat(78));
console.info('  A cap truncates ROWS. A separate COUNT(*)/GROUP BY keeps ambiguity visible.');
console.info('  term         total rows   distinct (cc,region)   capped@50?   COUNT cost ms');
for (const q of ['springfield', 'newport', 'san', 'york']) {
  const n = (await db.execute({ sql: 'SELECT COUNT(*) n FROM gazetteer_cities WHERE name LIKE ?', args: [`%${q}%`] })).rows[0].n;
  const g = (await db.execute({ sql: 'SELECT COUNT(*) n FROM (SELECT DISTINCT country_code, region_iso FROM gazetteer_cities WHERE name LIKE ?)', args: [`%${q}%`] })).rows[0].n;
  const t = await timeIt('c', () => db.execute({ sql: 'SELECT COUNT(*) n FROM gazetteer_cities WHERE name LIKE ?', args: [`%${q}%`] }), 5);
  console.info(`  ${q.padEnd(13)}${String(n).padStart(10)}${String(g).padStart(22)}${(n > 50 ? '  YES' : '   no').padStart(13)}${f(t.median)}`);
}

console.info('\n[BENCH] done.');
await db.close();
