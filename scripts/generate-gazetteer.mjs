#!/usr/bin/env node
/**
 * Travel Tracker — gazetteer / subdivision generator  (ADL-48 §8.1, SPIKE)
 *
 * STATUS: SPIKE ARTEFACT. Nothing here ships without the COO adopting the
 * feasibility spike's verdict (jobs/architect/tech/20260802-ADL48-feasibility-spike.md).
 *
 * Reads two upstream datasets and emits the committed build artifacts:
 *   data/regions.json            — ISO 3166-2 subdivisions for region-tier countries
 *   data/gazetteer-cities.json   — ~170k world cities  (NOT COMMITTED — gitignored)
 *   data/gazetteer-meta.json     — provenance + content hash
 *
 * ---------------------------------------------------------------------------
 * TWO REVIEW FINDINGS ARE IMPLEMENTED HERE. Both were blocking. Read before editing.
 * ---------------------------------------------------------------------------
 *
 * F4 — empty ISO subdivision codes must be filtered.
 *   `iso3166-2-db` ships subdivisions whose `iso` field is an empty string
 *   (recently-created subdivisions that have a GeoNames `admin` code but no ISO
 *   code assigned yet). Naive `${cc}-${r.iso}` turns those into `"ID-"` / `"PH-"`,
 *   which are NOT NULL and distinct, so they pass every constraint on `regions`
 *   and land as permanently-unmatchable garbage. They are dropped here and
 *   reported by name, never silently.
 *
 * F2 — this generator emits data ONLY. It does not define the seed mechanism,
 *   and the seed for `regions` must be an ADDITIVE UPSERT, never delete-and-reload:
 *
 *       INSERT INTO regions (...) VALUES (...) ON CONFLICT (iso_3166_2) DO NOTHING
 *
 *   `cities.region_id` REFERENCES `regions.id` (schema.ts), and `regions.id` is
 *   AUTOINCREMENT. A DELETE + reload re-issues ids and silently repoints every
 *   existing city at a different subdivision. The ADL-48 §8.1 delete-and-reload
 *   pattern is safe ONLY for `gazetteer_cities`, because that is the only table
 *   nothing references. Verified against schema.ts, not inherited from the review.
 *
 * ---------------------------------------------------------------------------
 * INPUT RESOLUTION — deliberately not a package.json dependency.
 * ---------------------------------------------------------------------------
 * `iso3166-2-db` unpacks to 283 MB / 42,268 files and costs ~11.8 s of install
 * time, for ONE 3.35 MB file. This repo installs node_modules per agent worktree
 * and on every CI run, so that is paid over and over. The spike therefore does
 * not add it to package.json; inputs are resolved from, in order:
 *
 *   1. --iso-db <path> / --cities <path>   (explicit)
 *   2. $ISO3166_2_DB / $CITIES_JSON        (env)
 *   3. data/vendor/iso3166-2.json          (the recommended end state)
 *   4. node_modules/<pkg>/...              (ADL-48's stated devDependency design)
 *
 * Usage:
 *   node scripts/generate-gazetteer.mjs --iso-db <path> --cities <path> [--out-dir data] [--dry-run]
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..');

// ----------------------------------------------------------------
// Arg parsing
// ----------------------------------------------------------------
const argv = process.argv.slice(2);
const argOf = (flag) => {
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : null;
};
const DRY_RUN = argv.includes('--dry-run');
const OUT_DIR = path.resolve(REPO_ROOT, argOf('--out-dir') ?? 'data');

function resolveInput(label, explicit, envVar, vendorRel, nodeModulesRel) {
  const candidates = [
    explicit,
    process.env[envVar],
    path.join(REPO_ROOT, vendorRel),
    path.join(REPO_ROOT, nodeModulesRel),
  ].filter(Boolean);
  for (const c of candidates) if (existsSync(c)) return c;
  console.error(
    `[GAZ] Could not resolve ${label}. Tried:\n` +
      candidates.map((c) => `  - ${c}`).join('\n') +
      `\nPass an explicit path or set $${envVar}.`,
  );
  process.exit(1);
}

const ISO_DB_PATH = resolveInput(
  'iso3166-2-db data',
  argOf('--iso-db'),
  'ISO3166_2_DB',
  'data/vendor/iso3166-2.json',
  'node_modules/iso3166-2-db/data/iso3166-2.json',
);
const CITIES_PATH = resolveInput(
  'cities.json data',
  argOf('--cities'),
  'CITIES_JSON',
  'data/vendor/cities.json',
  'node_modules/cities.json/cities.json',
);

// ----------------------------------------------------------------
// Load
// ----------------------------------------------------------------
console.info(`[GAZ] iso3166-2-db : ${ISO_DB_PATH}`);
console.info(`[GAZ] cities.json  : ${CITIES_PATH}`);

const isoDb = JSON.parse(readFileSync(ISO_DB_PATH, 'utf8'));
const allCities = JSON.parse(readFileSync(CITIES_PATH, 'utf8'));
const countries = JSON.parse(readFileSync(path.join(REPO_ROOT, 'data/countries.json'), 'utf8'));
const liveRegions = JSON.parse(readFileSync(path.join(REPO_ROOT, 'data/regions.json'), 'utf8'));

const enabled = countries.filter((c) => c.region_tier_enabled === 1).map((c) => c.country_code);
const enabledSet = new Set(enabled);
console.info(`[GAZ] ${allCities.length} source cities · ${enabled.length} region-tier countries`);

// ----------------------------------------------------------------
// 1. Subdivisions  (S1 output)
// ----------------------------------------------------------------
const regionRows = [];
const dropped = []; // F4
const seenIso = new Set();
const dupes = [];

for (const cc of enabled) {
  const entry = isoDb[cc];
  if (!entry || !Array.isArray(entry.regions)) continue;
  for (const r of entry.regions) {
    const isoSuffix = (r.iso ?? '').trim();

    // --- F4: drop empty-ISO subdivisions, loudly ---
    if (isoSuffix === '') {
      dropped.push({ country_code: cc, name: r.name, admin: r.admin ?? null, fips: r.fips ?? null });
      continue;
    }

    const code = `${cc}-${isoSuffix}`;
    if (seenIso.has(code)) {
      dupes.push(code);
      continue;
    }
    seenIso.add(code);
    regionRows.push({ country_code: cc, name: r.name, iso_3166_2: code });
  }
}

regionRows.sort((a, b) =>
  a.country_code === b.country_code
    ? a.iso_3166_2.localeCompare(b.iso_3166_2)
    : a.country_code.localeCompare(b.country_code),
);

// ----------------------------------------------------------------
// 2. Crosswalk: GeoNames admin1 -> ISO 3166-2   (ADL-48 §4.1)
//    GeoNames admin1 codes are NOT ISO 3166-2 codes. `admin` is the join key.
// ----------------------------------------------------------------
const crosswalk = new Map(); // `${cc}|${adminCode}` -> ISO 3166-2
for (const cc of Object.keys(isoDb)) {
  const entry = isoDb[cc];
  if (!entry || !Array.isArray(entry.regions)) continue;
  for (const r of entry.regions) {
    const isoSuffix = (r.iso ?? '').trim();
    if (isoSuffix === '') continue; // F4 again — never crosswalk to a garbage code
    const admin = r.admin == null ? '' : String(r.admin).trim();
    if (admin === '') continue;
    const key = `${cc}|${admin}`;
    if (!crosswalk.has(key)) crosswalk.set(key, `${cc}-${isoSuffix}`);
  }
}

// ----------------------------------------------------------------
// 3. Gazetteer cities  (S2 output)
// ----------------------------------------------------------------
const gazRows = [];
let joined = 0;
let nullRegion = 0;

for (const c of allCities) {
  const cc = c.country;
  const lat = Number(c.lat);
  const lng = Number(c.lng);
  if (!cc || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;

  let regionIso = null;
  const admin1 = c.admin1 == null ? '' : String(c.admin1).trim();
  if (admin1 !== '') regionIso = crosswalk.get(`${cc}|${admin1}`) ?? null;

  if (enabledSet.has(cc)) {
    if (regionIso) joined++;
  }
  if (regionIso === null) nullRegion++;

  gazRows.push({
    name: c.name,
    country_code: cc,
    region_iso: regionIso,
    latitude: lat,
    longitude: lng,
  });
}

// ----------------------------------------------------------------
// 4. Correctness proofs  (S1 safety — the point of the exercise)
// ----------------------------------------------------------------
const generatedByIso = new Map(regionRows.map((r) => [r.iso_3166_2, r]));

const preserved = [];
const missing = [];
const renamed = [];
for (const live of liveRegions) {
  const gen = generatedByIso.get(live.iso_3166_2);
  if (!gen) {
    missing.push(live);
  } else {
    preserved.push(live.iso_3166_2);
    if (gen.name !== live.name) {
      renamed.push({ iso: live.iso_3166_2, live: live.name, generated: gen.name });
    }
    if (gen.country_code !== live.country_code) {
      renamed.push({ iso: live.iso_3166_2, live: live.country_code, generated: gen.country_code });
    }
  }
}

const enabledCityRows = gazRows.filter((r) => enabledSet.has(r.country_code));
const enabledJoined = enabledCityRows.filter((r) => r.region_iso !== null).length;

// ----------------------------------------------------------------
// 5. Report
// ----------------------------------------------------------------
console.info('\n=== SUBDIVISIONS (S1) ===');
console.info(`  generated rows            : ${regionRows.length}`);
console.info(`  dropped (F4, empty ISO)   : ${dropped.length}`);
for (const d of dropped) console.info(`      DROP ${d.country_code} "${d.name}" (admin=${d.admin}, fips=${d.fips})`);
console.info(`  duplicate iso_3166_2      : ${dupes.length} ${dupes.length ? dupes.join(',') : '(none)'}`);
console.info(`  live regions.json rows    : ${liveRegions.length}`);
console.info(`  PRESERVED byte-for-byte   : ${preserved.length} / ${liveRegions.length}`);
console.info(`  MISSING from generated    : ${missing.length}`);
for (const m of missing) console.info(`      MISSING ${m.iso_3166_2} "${m.name}"`);
console.info(`  name/country mismatches   : ${renamed.length}`);
for (const r of renamed) console.info(`      DIFF ${r.iso}: live="${r.live}" generated="${r.generated}"`);
console.info(`  net NEW rows (additive)   : ${regionRows.length - preserved.length}`);

console.info('\n=== GAZETTEER CITIES (S2) ===');
console.info(`  rows                      : ${gazRows.length}`);
console.info(`  rows in enabled countries : ${enabledCityRows.length}`);
console.info(
  `  joined to ISO subdivision : ${enabledJoined} (${((enabledJoined / enabledCityRows.length) * 100).toFixed(2)}%)`,
);
console.info(
  `  NULL region (all rows)    : ${nullRegion} (${((nullRegion / gazRows.length) * 100).toFixed(2)}%)`,
);

const SAFE =
  missing.length === 0 && renamed.length === 0 && dupes.length === 0 && regionRows.length >= liveRegions.length;
console.info(`\n=== S1 SEED SAFETY: ${SAFE ? 'PASS' : 'FAIL'} ===`);
console.info(
  '  (additive upsert only — ON CONFLICT (iso_3166_2) DO NOTHING; never DELETE+reload, see F2 above)',
);

// ----------------------------------------------------------------
// 6. Emit
// ----------------------------------------------------------------
const citiesJson = JSON.stringify(gazRows);
const contentHash = createHash('sha256').update(citiesJson).digest('hex');

const meta = {
  generated_at: new Date().toISOString(),
  sources: [
    {
      name: 'cities.json',
      version: '1.1.61',
      licence: 'CC-BY-4.0',
      attribution: 'City data © GeoNames contributors, CC BY 4.0',
      path: path.relative(REPO_ROOT, CITIES_PATH),
    },
    {
      name: 'iso3166-2-db',
      version: '2.3.11',
      licence: 'MIT',
      attribution: 'ISO 3166-2 subdivision data — iso3166-2-db',
      path: path.relative(REPO_ROOT, ISO_DB_PATH),
    },
  ],
  regions_row_count: regionRows.length,
  regions_dropped_empty_iso: dropped.length,
  cities_row_count: gazRows.length,
  cities_content_hash: `sha256:${contentHash}`,
  cities_bytes: Buffer.byteLength(citiesJson),
};

console.info(`\n=== ARTIFACT ===`);
console.info(`  gazetteer-cities.json bytes : ${meta.cities_bytes} (${(meta.cities_bytes / 1024 / 1024).toFixed(2)} MB)`);
console.info(`  content hash                : ${meta.cities_content_hash}`);

if (DRY_RUN) {
  console.info('\n[GAZ] --dry-run: nothing written.');
  process.exit(SAFE ? 0 : 1);
}

writeFileSync(path.join(OUT_DIR, 'gazetteer-cities.json'), citiesJson);
writeFileSync(path.join(OUT_DIR, 'gazetteer-meta.json'), JSON.stringify(meta, null, 2) + '\n');
writeFileSync(
  path.join(OUT_DIR, 'regions.generated.json'),
  JSON.stringify(regionRows, null, 2) + '\n',
);
console.info(`\n[GAZ] wrote gazetteer-cities.json, gazetteer-meta.json, regions.generated.json -> ${OUT_DIR}`);
console.info('[GAZ] NOTE: regions.generated.json is written alongside, NOT over, data/regions.json.');
console.info('[GAZ]       Promoting it is a separate, reviewed step (S1).');

process.exit(SAFE ? 0 : 1);
