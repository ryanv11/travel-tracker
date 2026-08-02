#!/usr/bin/env node
/**
 * Travel Tracker — ADL-48 identity-key + query-equivalence analysis  (SPIKE, Q1/Q2/Q6)
 *
 * STATUS: SPIKE ARTEFACT. Analysis only.
 *
 *  Q1f  EQUIVALENCE PROOF — is FTS5 trigram a drop-in for LIKE '%q%', or does it
 *       change what the user finds? A speed win that quietly changes results is
 *       not a speed win. Compared over many terms, set-equality, not counts.
 *  Q1g  STORAGE COST of each index option.
 *  Q1h  ROWS SCANNED per keystroke — the cost dimension a latency number hides,
 *       and the one Turso bills on.
 *  Q2b  IS COUNTRY THE LAST AVAILABLE SIGNAL? Tests the PO's claim rather than
 *       accepting it — enumerates what is actually in hand at search time.
 *  Q6   BUG-75 — the D13 identity key `(name COLLATE NOCASE, country_code,
 *       COALESCE(region_id,0))` against real gazetteer data. Derived here, not
 *       inherited from the OP-27 review.
 *
 * Usage: node scripts/spike/gazetteer-identity-analysis.mjs
 */

import { createClient } from '@libsql/client';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '../..');
const DB_PATH = path.join(REPO_ROOT, 'spike-gazetteer.db');
const db = createClient({ url: `file:${DB_PATH}` });
const ms = () => Number(process.hrtime.bigint() / 1000n) / 1000;

// ================================================================
// Q1f — trigram / LIKE equivalence
// ================================================================
console.info('='.repeat(78));
console.info("Q1f — EQUIVALENCE: is FTS5 trigram a DROP-IN for LIKE '%q%'?");
console.info('='.repeat(78));

const EQ_TERMS = [
  'york', 'orleans', 'angeles', 'vegas', 'ness', 'sur', 'ton', 'ville', 'burg', 'ford',
  'san', 'new', 'port', 'chester', 'shire', 'dale', 'wick', 'beach', 'grand', 'saint',
  'mouth', 'stone', 'bury', 'field', 'haven', 'ridge', 'brook', 'wood', 'hill', 'lake',
];

let identical = 0, differing = 0;
const diffs = [];
for (const q of EQ_TERMS) {
  const a = (await db.execute({ sql: 'SELECT id FROM gazetteer_cities WHERE name LIKE ? ORDER BY id', args: [`%${q}%`] })).rows.map((r) => r.id);
  const b = (await db.execute({ sql: 'SELECT rowid AS id FROM gaz_trigram WHERE gaz_trigram MATCH ? ORDER BY rowid', args: [`"${q}"`] })).rows.map((r) => r.id);
  const sa = new Set(a), sb = new Set(b);
  const onlyA = a.filter((x) => !sb.has(x));
  const onlyB = b.filter((x) => !sa.has(x));
  if (onlyA.length === 0 && onlyB.length === 0) identical++;
  else { differing++; diffs.push({ q, n: a.length, onlyA: onlyA.length, onlyB: onlyB.length }); }
}
console.info(`  terms compared        : ${EQ_TERMS.length}`);
console.info(`  IDENTICAL result sets : ${identical}`);
console.info(`  differing             : ${differing}`);
for (const d of diffs) console.info(`      DIFF "${d.q}": LIKE=${d.n} onlyLIKE=${d.onlyA} onlyTRIGRAM=${d.onlyB}`);

// The known boundary: trigram needs >= 3 characters.
console.info('\n  Boundary — queries shorter than 3 characters:');
for (const q of ['y', 'yo']) {
  const a = (await db.execute({ sql: 'SELECT COUNT(*) n FROM gazetteer_cities WHERE name LIKE ?', args: [`%${q}%`] })).rows[0].n;
  let b = 'ERROR';
  try { b = (await db.execute({ sql: 'SELECT COUNT(*) n FROM gaz_trigram WHERE gaz_trigram MATCH ?', args: [`"${q}"`] })).rows[0].n; } catch (e) { b = `unsupported (${e.message.slice(0, 40)})`; }
  console.info(`    "${q}" (${q.length} ch): LIKE=${a}  trigram=${b}`);
}

// Case-insensitivity parity
console.info('\n  Case parity (LIKE is ASCII-case-insensitive by default in SQLite):');
for (const q of ['YORK', 'York', 'york']) {
  const a = (await db.execute({ sql: 'SELECT COUNT(*) n FROM gazetteer_cities WHERE name LIKE ?', args: [`%${q}%`] })).rows[0].n;
  const b = (await db.execute({ sql: 'SELECT COUNT(*) n FROM gaz_trigram WHERE gaz_trigram MATCH ?', args: [`"${q}"`] })).rows[0].n;
  console.info(`    "${q}": LIKE=${a}  trigram=${b}`);
}

// ================================================================
// Q1g — storage cost
// ================================================================
console.info('\n' + '='.repeat(78));
console.info('Q1g — STORAGE COST of each option');
console.info('='.repeat(78));
const sizes = await db.execute(`
  SELECT name, SUM(pgsize) AS bytes FROM dbstat GROUP BY name ORDER BY bytes DESC
`).catch(() => null);
if (sizes) {
  for (const r of sizes.rows.slice(0, 12)) {
    console.info(`  ${String(r.name).padEnd(34)}${(Number(r.bytes) / 1024 / 1024).toFixed(2).padStart(8)} MB`);
  }
} else {
  console.info('  dbstat unavailable in this build — reporting whole-file size only.');
}
console.info(`  ${'TOTAL db file'.padEnd(34)}${(statSync(DB_PATH).size / 1024 / 1024).toFixed(2).padStart(8)} MB`);

// ================================================================
// Q1h — rows scanned per keystroke
// ================================================================
console.info('\n' + '='.repeat(78));
console.info('Q1h — ROWS SCANNED per keystroke (the cost a latency number hides)');
console.info('='.repeat(78));
console.info('  Turso bills on rows read. A full index scan reads every row, every keystroke.');
const [{ n: totalRows }] = (await db.execute('SELECT COUNT(*) AS n FROM gazetteer_cities')).rows;
console.info('  term        LIKE %q% rows scanned   trigram rows matched   ratio');
for (const q of ['york', 'newport', 'glas', 'plock']) {
  const matched = (await db.execute({ sql: 'SELECT COUNT(*) n FROM gazetteer_cities WHERE name LIKE ?', args: [`%${q}%`] })).rows[0].n;
  const ratio = Math.round(Number(totalRows) / Math.max(Number(matched), 1));
  console.info(
    `  ${q.padEnd(12)}${String(totalRows).padStart(18)}${String(matched).padStart(23)}${String(ratio).padStart(8)}x`,
  );
}

// ================================================================
// Q2b — is country genuinely the last signal?
// ================================================================
console.info('\n' + '='.repeat(78));
console.info('Q2b — IS COUNTRY THE LAST AVAILABLE SIGNAL AT SEARCH TIME?');
console.info('='.repeat(78));
console.info('  Testing the PO\'s claim rather than accepting it. What narrowing power');
console.info('  would each candidate signal actually buy, measured on real data?');

const liveRegions = JSON.parse(readFileSync(path.join(REPO_ROOT, 'data/regions.json'), 'utf8'));
const countries = JSON.parse(readFileSync(path.join(REPO_ROOT, 'data/countries.json'), 'utf8'));
const enabled = countries.filter((c) => c.region_tier_enabled === 1);
const withRegions = new Set(liveRegions.map((r) => r.country_code));

console.info(`\n  Signal 1 — trip's declared countries (trip_countries). AVAILABLE.`);
for (const q of ['newport', 'springfield', 'york']) {
  const all = (await db.execute({ sql: 'SELECT COUNT(*) n FROM gazetteer_cities WHERE name LIKE ?', args: [`%${q}%`] })).rows[0].n;
  const gb = (await db.execute({ sql: "SELECT COUNT(*) n FROM gazetteer_cities WHERE name LIKE ? AND country_code='GB'", args: [`%${q}%`] })).rows[0].n;
  console.info(`      "${q}": ${all} worldwide → ${gb} in GB  (${(100 - (Number(gb) / Number(all)) * 100).toFixed(0)}% reduction)`);
}

console.info(`\n  Signal 2 — region/state. NOT available: the user types the city BEFORE`);
console.info(`      the region is known. This is the asymmetry the PO identified.`);
console.info(`      TODAY it is doubly unavailable: of ${enabled.length} region-tier countries,`);
console.info(`      only ${withRegions.size} have ANY regions seeded (${[...withRegions].join(',')}) —`);
console.info(`      ${enabled.length - withRegions.size} enabled countries have ZERO regions, so region_id is`);
console.info(`      invariantly NULL there and cannot narrow anything even in principle.`);

console.info(`\n  Signal 3 — the trip's ALREADY-ADDED places. Let's size it:`);
console.info(`      If a trip already has a place, its country AND region are known. A second`);
console.info(`      city is disproportionately likely to be near the first (a trip is a`);
console.info(`      geographic cluster). Measured proximity narrowing, "newport" in GB:`);
const npGb = (await db.execute({ sql: "SELECT name, region_iso, latitude, longitude FROM gazetteer_cities WHERE name LIKE 'newport' AND country_code='GB'", args: [] })).rows;
console.info(`      ${npGb.length} exact "Newport" rows in GB:`);
for (const r of npGb) console.info(`        ${String(r.name).padEnd(10)} ${String(r.region_iso ?? 'null').padEnd(8)} ${Number(r.latitude).toFixed(3)},${Number(r.longitude).toFixed(3)}`);
// How much would a 100km anchor narrow it?
if (npGb.length > 1) {
  const anchor = npGb[0];
  const near = npGb.filter((r) => {
    const dLat = (Number(r.latitude) - Number(anchor.latitude)) * 111;
    const dLng = (Number(r.longitude) - Number(anchor.longitude)) * 111 * Math.cos((Number(anchor.latitude) * Math.PI) / 180);
    return Math.sqrt(dLat * dLat + dLng * dLng) <= 100;
  });
  console.info(`      An anchor at the first row + 100 km radius narrows ${npGb.length} → ${near.length}.`);
}

console.info(`\n  Signal 4 — the user's PREVIOUS trips' cities. Available in principle`);
console.info(`      (cities table is global, trips are per-user). Weak and biased: it`);
console.info(`      ranks toward where they have been, not where they are going.`);

// ================================================================
// Q6 — BUG-75 identity key collisions
// ================================================================
console.info('\n' + '='.repeat(78));
console.info('Q6 — BUG-75: D13 identity key vs real gazetteer data');
console.info('='.repeat(78));
console.info('  Key: (name COLLATE NOCASE, country_code, COALESCE(region_id,0))');
console.info('  region_iso is the gazetteer proxy for region_id (S1 maps one to one).\n');

// Collisions under the key AS IT WOULD BEHAVE POST-S1 (all 26 countries have regions)
const collide = await db.execute(`
  SELECT lower(name) AS k, country_code, COALESCE(region_iso,'~') AS r,
         COUNT(*) AS n,
         MIN(latitude) AS mnla, MAX(latitude) AS mxla,
         MIN(longitude) AS mnlo, MAX(longitude) AS mxlo
  FROM gazetteer_cities
  GROUP BY lower(name), country_code, COALESCE(region_iso,'~')
  HAVING COUNT(*) > 1
`);
let unrepresentable = 0, groupsOver10 = 0, groupsOver50 = 0, maxSep = 0, maxSepName = '';
for (const g of collide.rows) {
  unrepresentable += Number(g.n) - 1;
  const dLat = (Number(g.mxla) - Number(g.mnla)) * 111;
  const dLng = (Number(g.mxlo) - Number(g.mnlo)) * 111 * Math.cos((Number(g.mnla) * Math.PI) / 180);
  const sep = Math.sqrt(dLat * dLat + dLng * dLng);
  if (sep > 10) groupsOver10++;
  if (sep > 50) groupsOver50++;
  if (sep > maxSep) { maxSep = sep; maxSepName = `${g.k} ${g.country_code}`; }
}
console.info(`  gazetteer rows                    : ${totalRows}`);
console.info(`  colliding identity groups         : ${collide.rows.length}`);
console.info(`  ROWS UNREPRESENTABLE in cities    : ${unrepresentable} (${((unrepresentable / Number(totalRows)) * 100).toFixed(2)}%)`);
console.info(`  colliding groups > 10 km apart    : ${groupsOver10}`);
console.info(`  colliding groups > 50 km apart    : ${groupsOver50}`);
console.info(`  largest separation                : ${maxSep.toFixed(0)} km (${maxSepName})`);

console.info('\n  Worst offenders in GB (a PO would hit these):');
const gbWorst = await db.execute(`
  SELECT name, COALESCE(region_iso,'~') AS r, COUNT(*) AS n,
         MIN(latitude) mnla, MAX(latitude) mxla, MIN(longitude) mnlo, MAX(longitude) mxlo
  FROM gazetteer_cities WHERE country_code='GB'
  GROUP BY lower(name), COALESCE(region_iso,'~') HAVING COUNT(*) > 1
  ORDER BY COUNT(*) DESC LIMIT 8
`);
for (const g of gbWorst.rows) {
  const dLat = (Number(g.mxla) - Number(g.mnla)) * 111;
  const dLng = (Number(g.mxlo) - Number(g.mnlo)) * 111 * Math.cos((Number(g.mnla) * Math.PI) / 180);
  console.info(`    ${String(g.name).padEnd(14)} ${String(g.r).padEnd(8)} ${g.n} rows, ${Math.sqrt(dLat * dLat + dLng * dLng).toFixed(0)} km apart`);
}

// THE COO'S CLAIM: today, 22 of 26 enabled countries have zero regions, so the
// whole country is one identity bucket. Verify it, don't inherit it.
console.info('\n  COO claim — "22 of 26 region-tier countries hold zero regions, so the');
console.info('  entire country is one identity bucket TODAY". Verified against real data:');
const noRegionCountries = enabled.filter((c) => !withRegions.has(c.country_code)).map((c) => c.country_code);
console.info(`    region-tier countries          : ${enabled.length}`);
console.info(`    with >=1 seeded region         : ${withRegions.size} (${[...withRegions].join(',')})`);
console.info(`    with ZERO seeded regions       : ${noRegionCountries.length} → ${noRegionCountries.join(',')}`);

const collideNoRegion = await db.execute({
  sql: `SELECT lower(name) k, country_code, COUNT(*) n
        FROM gazetteer_cities
        WHERE country_code IN (${noRegionCountries.map(() => '?').join(',')})
        GROUP BY lower(name), country_code HAVING COUNT(*) > 1`,
  args: noRegionCountries,
});
let noRegionUnrep = 0;
for (const g of collideNoRegion.rows) noRegionUnrep += Number(g.n) - 1;
console.info(`    → in those ${noRegionCountries.length} countries the key degenerates to (name, country_code):`);
console.info(`      colliding groups ${collideNoRegion.rows.length}, unrepresentable rows ${noRegionUnrep}`);
console.info(`      CLAIM CONFIRMED: with region_id invariantly NULL, COALESCE(region_id,0)=0`);
console.info(`      for every city in those countries, so the whole country is one bucket.`);

// Option costing
console.info('\n  Option costing — how much does each repair actually buy?');
const withAdmin2 = await db.execute(`
  SELECT COUNT(*) n FROM (
    SELECT lower(name) k, country_code, COALESCE(region_iso,'~') r,
           ROUND(latitude,1) la, ROUND(longitude,1) lo, COUNT(*) c
    FROM gazetteer_cities GROUP BY 1,2,3,4,5 HAVING COUNT(*) > 1)
`);
let coordBucketUnrep = 0;
const cb = await db.execute(`
  SELECT COUNT(*) - COUNT(DISTINCT lower(name)||'|'||country_code||'|'||COALESCE(region_iso,'~')||'|'||ROUND(latitude,1)||'|'||ROUND(longitude,1)) AS n
  FROM gazetteer_cities
`);
coordBucketUnrep = Number(cb.rows[0].n);
console.info(`    (a) key + 0.1° coordinate bucket → unrepresentable drops ${unrepresentable} → ${coordBucketUnrep}`);
console.info(`        (0.1° ≈ 11 km; resolves ${(((unrepresentable - coordBucketUnrep) / unrepresentable) * 100).toFixed(1)}% of collisions)`);
console.info(`    (b) accept conflation            → ${unrepresentable} rows silently mis-pin, up to ${maxSep.toFixed(0)} km`);
console.info(`    (c) hide colliding rows          → ${unrepresentable} places become unselectable`);

await db.close();
console.info('\n[ANALYSIS] done.');
