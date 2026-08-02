#!/usr/bin/env node
/**
 * Travel Tracker — gazetteer / subdivision generator  (ADL-48 §8.1, SPIKE)
 *
 * STATUS: S1 SHIPPED (BUG-77, issue #367). The subdivision half of this script is now
 * production: its output IS `data/regions.json`, which `seedRegions()` seeds from. The
 * gazetteer-cities half remains a SPIKE ARTEFACT pending a COO decision on ADL-48 S2.
 * See jobs/architect/tech/20260802-ADL48-feasibility-spike.md for the verdict.
 *
 * Reads one or two upstream datasets and emits the build artifacts:
 *   data/regions.generated.json  — ISO 3166-2 subdivisions, S1  (promoted to data/regions.json)
 *   data/gazetteer-cities.json   — ~170k world cities, S2  (NOT COMMITTED — gitignored)
 *   data/gazetteer-meta.json     — provenance + content hash, S2
 *
 * ---------------------------------------------------------------------------
 * S1-ONLY MODE (added 2026-08-02, BUG-77) — cities.json is OPTIONAL.
 * ---------------------------------------------------------------------------
 * The subdivision output depends on `iso3166-2-db` alone; `cities.json` feeds only the
 * S2 gazetteer half. Requiring it to regenerate `data/regions.json` would make a shipped
 * build artifact un-reproducible without a 19 MB dependency that S1 never reads. When the
 * cities input is absent the script emits the S1 artifact, reports S2 as SKIPPED, and
 * still enforces every S1 safety proof. Pass --cities (or vendor the file) to get S2 back.
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
 *   and the seed for `regions` must be an ADDITIVE UPSERT, never delete-and-reload.
 *   As implemented in `seedRegions()` (BUG-77):
 *
 *       INSERT INTO regions (...) VALUES (...)
 *       ON CONFLICT (iso_3166_2) DO UPDATE SET name = excluded.name, ...
 *
 *   DO UPDATE rather than DO NOTHING because the gate is content-addressed: under
 *   DO NOTHING an upstream name correction would leave the table's hash permanently
 *   mismatched, so the seed would re-run every single boot and never converge.
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
 * and on every CI run, so that is paid over and over. Neither package is a
 * dependency; as of BUG-77 the iso3166-2-db file is VENDORED at
 * `data/vendor/iso3166-2.json` (provenance in data/vendor/README.md).
 * Inputs are resolved from, in order:
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

function resolveInput(label, explicit, envVar, vendorRel, nodeModulesRel, { optional = false } = {}) {
  const candidates = [
    explicit,
    process.env[envVar],
    path.join(REPO_ROOT, vendorRel),
    path.join(REPO_ROOT, nodeModulesRel),
  ].filter(Boolean);
  for (const c of candidates) if (existsSync(c)) return c;
  if (optional) return null;
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
// Optional: S2 input only. Absent => S1-only run (see header).
const CITIES_PATH = resolveInput(
  'cities.json data',
  argOf('--cities'),
  'CITIES_JSON',
  'data/vendor/cities.json',
  'node_modules/cities.json/cities.json',
  { optional: true },
);
const S2_ENABLED = CITIES_PATH !== null;

// ----------------------------------------------------------------
// Load
// ----------------------------------------------------------------
console.info(`[GAZ] iso3166-2-db : ${ISO_DB_PATH}`);
console.info(`[GAZ] cities.json  : ${CITIES_PATH ?? '(absent — S1-only run, S2 skipped)'}`);

const isoDb = JSON.parse(readFileSync(ISO_DB_PATH, 'utf8'));
const allCities = S2_ENABLED ? JSON.parse(readFileSync(CITIES_PATH, 'utf8')) : [];
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

/**
 * STABLE ORDERING (BUG-77). Rows already present in `data/regions.json` keep their existing
 * position; genuinely new rows are appended in sorted order. Two reasons, both deliberate:
 *
 *  1. The git diff of a regeneration becomes a PURE APPEND. "All 76 existing codes are
 *     preserved byte-for-byte" is then visible in the diff itself rather than something a
 *     reviewer has to take on trust from a script's own output.
 *  2. Row order is INSERT order, and `regions.id` is AUTOINCREMENT, so on a FRESH database
 *     the pre-existing codes keep the exact ids they were assigned before. Nothing in the
 *     app hard-codes a region id (checked), so this is belt-and-braces rather than load-
 *     bearing — but it costs nothing and removes a class of surprise.
 *
 * Self-maintaining: after promotion, the next regeneration reads the promoted file as its
 * ordering baseline, so the property holds for every future refresh too.
 */
const livePosition = new Map(liveRegions.map((r, i) => [r.iso_3166_2, i]));
const orderedRegionRows = [
  ...regionRows
    .filter((r) => livePosition.has(r.iso_3166_2))
    .sort((a, b) => livePosition.get(a.iso_3166_2) - livePosition.get(b.iso_3166_2)),
  ...regionRows.filter((r) => !livePosition.has(r.iso_3166_2)),
];

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

// Coverage: every region-tier country must end up with at least one subdivision, or the
// selector is still empty for its users — which is the whole point of S1 (BUG-77).
const perCountry = new Map(enabled.map((cc) => [cc, 0]));
for (const r of regionRows) perCountry.set(r.country_code, (perCountry.get(r.country_code) ?? 0) + 1);
const emptyCountries = enabled.filter((cc) => (perCountry.get(cc) ?? 0) === 0);

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
console.info(`  region-tier countries     : ${enabled.length}`);
console.info(`  ...with >= 1 subdivision  : ${enabled.length - emptyCountries.length}`);
console.info(
  `  ...with ZERO subdivisions : ${emptyCountries.length} ${emptyCountries.length ? emptyCountries.join(',') : '(none)'}`,
);
console.info(
  `  per country               : ${enabled.map((cc) => `${cc}=${perCountry.get(cc)}`).join(' ')}`,
);

if (S2_ENABLED) {
  console.info('\n=== GAZETTEER CITIES (S2) ===');
  console.info(`  rows                      : ${gazRows.length}`);
  console.info(`  rows in enabled countries : ${enabledCityRows.length}`);
  console.info(
    `  joined to ISO subdivision : ${enabledJoined} (${((enabledJoined / enabledCityRows.length) * 100).toFixed(2)}%)`,
  );
  console.info(
    `  NULL region (all rows)    : ${nullRegion} (${((nullRegion / gazRows.length) * 100).toFixed(2)}%)`,
  );
} else {
  console.info('\n=== GAZETTEER CITIES (S2) — SKIPPED ===');
  console.info('  no cities.json input; S1 subdivision output above is complete and unaffected.');
}

const SAFE =
  missing.length === 0 &&
  renamed.length === 0 &&
  dupes.length === 0 &&
  emptyCountries.length === 0 &&
  regionRows.length >= liveRegions.length;
console.info(`\n=== S1 SEED SAFETY: ${SAFE ? 'PASS' : 'FAIL'} ===`);
console.info(
  '  (additive upsert only — ON CONFLICT (iso_3166_2) DO UPDATE SET name/country_code;',
);
console.info('   never DELETE+reload, see F2 above and src/backend/services/startup.service.ts)');

// ----------------------------------------------------------------
// 6. Emit
// ----------------------------------------------------------------
const citiesJson = JSON.stringify(gazRows);
const contentHash = createHash('sha256').update(citiesJson).digest('hex');

const meta = {
  generated_at: new Date().toISOString(),
  sources: [
    ...(S2_ENABLED
      ? [
          {
            name: 'cities.json',
            version: '1.1.61',
            licence: 'CC-BY-4.0',
            attribution: 'City data © GeoNames contributors, CC BY 4.0',
            path: path.relative(REPO_ROOT, CITIES_PATH),
          },
        ]
      : []),
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

if (S2_ENABLED) {
  console.info(`\n=== ARTIFACT ===`);
  console.info(
    `  gazetteer-cities.json bytes : ${meta.cities_bytes} (${(meta.cities_bytes / 1024 / 1024).toFixed(2)} MB)`,
  );
  console.info(`  content hash                : ${meta.cities_content_hash}`);
}

if (DRY_RUN) {
  console.info('\n[GAZ] --dry-run: nothing written.');
  process.exit(SAFE ? 0 : 1);
}

if (S2_ENABLED) {
  writeFileSync(path.join(OUT_DIR, 'gazetteer-cities.json'), citiesJson);
  writeFileSync(path.join(OUT_DIR, 'gazetteer-meta.json'), JSON.stringify(meta, null, 2) + '\n');
}
// One object per line, matching data/regions.json's existing hand-maintained formatting.
// A 714-row file expanded to 4 lines per object is 2,856 lines of unreviewable diff; this
// keeps one row = one line, so the append is legible.
const regionsJson =
  '[\n' +
  orderedRegionRows
    .map(
      (r) =>
        `  { "country_code": ${JSON.stringify(r.country_code)}, "name": ${JSON.stringify(r.name)}, "iso_3166_2": ${JSON.stringify(r.iso_3166_2)} }`,
    )
    .join(',\n') +
  '\n]\n';
writeFileSync(path.join(OUT_DIR, 'regions.generated.json'), regionsJson);
console.info(
  `\n[GAZ] wrote ${S2_ENABLED ? 'gazetteer-cities.json, gazetteer-meta.json, ' : ''}regions.generated.json -> ${OUT_DIR}`,
);
console.info('[GAZ] NOTE: regions.generated.json is written alongside, NOT over, data/regions.json.');
console.info('[GAZ]       Promoting it is a separate, reviewed step (S1).');

process.exit(SAFE ? 0 : 1);
