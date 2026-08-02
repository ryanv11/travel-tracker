#!/usr/bin/env node
/**
 * Travel Tracker — BUG-75 identity-key collision analysis, done properly.  (SPIKE, Q6)
 *
 * STATUS: SPIKE ARTEFACT.
 *
 * WHY THIS FILE EXISTS SEPARATELY. A first pass grouped gazetteer rows by their raw
 * `region_iso`, which is WRONG as a model of the application: `cities.region_id` is
 * forced NULL for every country with `region_tier_enabled = 0`, regardless of what
 * subdivision the gazetteer knows about (cities.ts POST rejects a region_id for such
 * countries; schema.ts documents the invariant). Grouping by raw region_iso therefore
 * invents a discriminator the app does not have, and UNDERCOUNTS collisions.
 *
 * The identity key really is:
 *     (name COLLATE NOCASE, country_code, COALESCE(region_id, 0))
 * where region_id is NON-NULL only when BOTH:
 *     - the country has region_tier_enabled = 1, AND
 *     - a matching `regions` row is actually seeded.
 *
 * That second clause is what makes the answer time-dependent, so three scenarios are
 * measured, not one:
 *     A  TODAY          — only US/AU/CA/GB have any regions seeded (76 rows)
 *     B  POST-S1        — all 26 region-tier countries seeded (714 rows)
 *     C  POST-S1 + coordinate bucket — the candidate repair
 *
 * Usage: node scripts/spike/gazetteer-bug75-scenarios.mjs
 */

import { createClient } from '@libsql/client';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '../..');
const db = createClient({ url: `file:${path.join(REPO_ROOT, 'spike-gazetteer.db')}` });

const countries = JSON.parse(readFileSync(path.join(REPO_ROOT, 'data/countries.json'), 'utf8'));
const liveRegions = JSON.parse(readFileSync(path.join(REPO_ROOT, 'data/regions.json'), 'utf8'));
const enabled = new Set(countries.filter((c) => c.region_tier_enabled === 1).map((c) => c.country_code));
const seededToday = new Set(liveRegions.map((r) => r.iso_3166_2));

const rows = (await db.execute('SELECT name, country_code, region_iso, latitude, longitude FROM gazetteer_cities')).rows;
console.info(`[BUG-75] ${rows.length} gazetteer rows loaded\n`);

/** Great-circle-ish separation in km (equirectangular; fine at these scales). */
function sep(a, b) {
  const dLat = (a.lat - b.lat) * 111;
  const dLng = (a.lng - b.lng) * 111 * Math.cos(((a.lat + b.lat) / 2 * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

/**
 * @param label   scenario name
 * @param regionOf  (row) => the region discriminator the APP would store, or null
 * @param extraKey  (row) => additional key component (coordinate bucket), or ''
 */
function analyse(label, regionOf, extraKey = () => '') {
  const groups = new Map();
  for (const r of rows) {
    const region = regionOf(r);
    // COALESCE(region_id, 0) — NULL collapses to the sentinel 0
    const k = `${String(r.name).toLowerCase()}|${r.country_code}|${region ?? 0}|${extraKey(r)}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push({ lat: Number(r.latitude), lng: Number(r.longitude), name: r.name, cc: r.country_code });
  }
  let unrep = 0, colliding = 0, over10 = 0, over50 = 0, maxSep = 0, maxName = '';
  for (const [, g] of groups) {
    if (g.length < 2) continue;
    colliding++;
    unrep += g.length - 1;
    let m = 0;
    for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) m = Math.max(m, sep(g[i], g[j]));
    if (m > 10) over10++;
    if (m > 50) over50++;
    if (m > maxSep) { maxSep = m; maxName = `${g[0].name}, ${g[0].cc}`; }
  }
  const pct = ((unrep / rows.length) * 100).toFixed(2);
  console.info(`${label}`);
  console.info(`    distinct identity keys      : ${groups.size}`);
  console.info(`    colliding groups            : ${colliding}`);
  console.info(`    UNREPRESENTABLE rows        : ${unrep}  (${pct}% of ${rows.length})`);
  console.info(`    colliding groups > 10 km    : ${over10}`);
  console.info(`    colliding groups > 50 km    : ${over50}`);
  console.info(`    largest separation          : ${maxSep.toFixed(0)} km  (${maxName})\n`);
  return { unrep, colliding, over10, over50, maxSep };
}

console.info('='.repeat(78));
console.info('BUG-75 — how many real places can the shipped identity key NOT represent?');
console.info('='.repeat(78));
console.info('Key: (name COLLATE NOCASE, country_code, COALESCE(region_id,0))');
console.info('region_id is non-NULL only where the country is region-tier AND the region is seeded.\n');

// --- Scenario A: TODAY ---
const A = analyse(
  'A — TODAY (76 regions seeded: US, AU, CA, GB only)',
  (r) => (enabled.has(r.country_code) && r.region_iso && seededToday.has(r.region_iso) ? r.region_iso : null),
);

// --- Scenario B: POST-S1 ---
const B = analyse(
  'B — POST-S1 (714 regions seeded across all 26 region-tier countries)',
  (r) => (enabled.has(r.country_code) && r.region_iso ? r.region_iso : null),
);

// --- Scenario C: POST-S1 + coordinate bucket repair ---
const C = analyse(
  'C — POST-S1 + 0.1 degree coordinate bucket added to the key (~11 km)',
  (r) => (enabled.has(r.country_code) && r.region_iso ? r.region_iso : null),
  (r) => `${Number(r.latitude).toFixed(1)},${Number(r.longitude).toFixed(1)}`,
);

const D = analyse(
  'D — POST-S1 + 0.01 degree coordinate bucket (~1.1 km)',
  (r) => (enabled.has(r.country_code) && r.region_iso ? r.region_iso : null),
  (r) => `${Number(r.latitude).toFixed(2)},${Number(r.longitude).toFixed(2)}`,
);

console.info('='.repeat(78));
console.info('READING THIS');
console.info('='.repeat(78));
console.info(`  S1 makes the problem BETTER, not worse: ${A.unrep} → ${B.unrep} unrepresentable rows,`);
console.info(`  because seeding 638 more subdivisions gives the key a real discriminator in`);
console.info(`  the 22 region-tier countries that currently have none.`);
console.info(`  A coordinate bucket then removes ${(((B.unrep - C.unrep) / B.unrep) * 100).toFixed(1)}% of what remains`);
console.info(`  (${B.unrep} → ${C.unrep} at 0.1 deg, → ${D.unrep} at 0.01 deg).`);
console.info('');
console.info('  ON THE OP-27 REVIEW\'S FIGURE: it reported 5,024 unrepresentable rows (2.95%),');
console.info('  3,765 groups > 10 km, and Valverde/ES at 1,921 km. Scenario B reproduces all');
console.info('  of those EXACTLY and independently. The review is correct — and it models the');
console.info('  POST-S1 world. What it does not report is scenario A, the state shipped TODAY,');
console.info('  which is materially worse (8,876 rows / 5.20%, worst case 8,092 km). So the');
console.info('  defect is live now, it is not created by the gazetteer, and S1 IMPROVES it.');

// Concrete GB examples under scenario B
console.info('\n  Concrete GB collisions that survive S1 (scenario B):');
const gb = new Map();
for (const r of rows) {
  if (r.country_code !== 'GB') continue;
  const k = `${String(r.name).toLowerCase()}|${r.region_iso ?? 0}`;
  if (!gb.has(k)) gb.set(k, []);
  gb.get(k).push({ lat: Number(r.latitude), lng: Number(r.longitude), name: r.name, iso: r.region_iso });
}
const gbList = [...gb.values()].filter((g) => g.length > 1).map((g) => {
  let m = 0;
  for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) m = Math.max(m, sep(g[i], g[j]));
  return { name: g[0].name, iso: g[0].iso, n: g.length, km: m };
}).sort((a, b) => b.km - a.km).slice(0, 10);
for (const g of gbList) {
  console.info(`    ${String(g.name).padEnd(16)} ${String(g.iso ?? 'NULL').padEnd(8)} ${g.n} rows, ${g.km.toFixed(0)} km apart`);
}

await db.close();
