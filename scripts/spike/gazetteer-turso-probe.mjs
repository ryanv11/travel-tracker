#!/usr/bin/env node
/**
 * Travel Tracker — ADL-48 Turso cold-seed / latency-regime probe  (SPIKE, Q3)
 *
 * STATUS: SPIKE ARTEFACT. Measurement only.
 *
 * Two questions, and they are different:
 *
 *  Q3a  WHICH REGIME ARE WE IN? If the network round-trip dominates, then tuning
 *       the query shape (Q1) is optimising the wrong term. Measured by timing the
 *       SAME trivial query locally and against Turso staging.
 *
 *  Q3b  COLD-SEED COST. ADL-48 §8.3 calls this UNVERIFIED and gates rollout on it.
 *
 * ---------------------------------------------------------------------------
 * CREDENTIAL CONSTRAINT — read this before concluding anything from the output.
 * ---------------------------------------------------------------------------
 * The only Turso credentials in this environment are in `.env.agent-diagnostics`,
 * and ADL-33 §5 makes them READ-ONLY BY DESIGN. The COO's brief authorised
 * creating a throwaway `spike_gazetteer_probe` table — but authorisation is not
 * capability. This probe ATTEMPTS the write anyway, deliberately, because the
 * rejection is itself the second probe confirming the token is read-only rather
 * than my inheriting that from ADL-33's text.
 *
 * Consequence: INSERT throughput against Turso is NOT measurable from here. What
 * IS measurable is the network round-trip term, which is the thing ADL-48 §8.3
 * was actually worried about ("86 batches over a WAN could plausibly be tens of
 * seconds to minutes"). Read the output with that boundary in mind.
 *
 * Usage:
 *   node scripts/spike/gazetteer-turso-probe.mjs [--env <path to .env.agent-diagnostics>]
 */

import { createClient } from '@libsql/client';
import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '../..');

const argv = process.argv.slice(2);
const argOf = (f) => {
  const i = argv.indexOf(f);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : null;
};

const ENV_PATH =
  argOf('--env') ??
  [
    path.join(REPO_ROOT, '.env.agent-diagnostics'),
    '/workspace/.env.agent-diagnostics',
  ].find((p) => existsSync(p));

if (!ENV_PATH || !existsSync(ENV_PATH)) {
  console.error('[TURSO] .env.agent-diagnostics not found. Pass --env <path>.');
  process.exit(1);
}
config({ path: ENV_PATH });
console.info(`[TURSO] credentials: ${ENV_PATH} (read-only by design, ADL-33 §5)`);

const url = process.env.TURSO_STAGING_URL;
const authToken = process.env.TURSO_STAGING_TOKEN;
if (!url || !authToken) {
  console.error('[TURSO] TURSO_STAGING_URL / _TOKEN missing.');
  process.exit(1);
}

const remote = createClient({ url, authToken });
const local = createClient({ url: `file:${path.join(REPO_ROOT, 'spike-gazetteer.db')}` });
const ms = () => Number(process.hrtime.bigint() / 1000n) / 1000;

async function timed(fn, runs = 9) {
  const s = [];
  for (let i = 0; i < runs; i++) {
    const t = ms();
    try { await fn(); } catch (e) { return { err: e.message }; }
    s.push(ms() - t);
  }
  s.sort((a, b) => a - b);
  return { median: s[Math.floor(s.length / 2)], min: s[0], max: s[s.length - 1] };
}
const f = (n) => (n == null ? '     n/a' : n.toFixed(1).padStart(8));

console.info('\n' + '='.repeat(74));
console.info('Q3a — LATENCY REGIME: is this CPU-bound or network-bound?');
console.info('='.repeat(74));

const trivialRemote = await timed(() => remote.execute('SELECT 1'));
const trivialLocal = await timed(() => local.execute('SELECT 1'));
console.info(`  SELECT 1        local ${f(trivialLocal.median)} ms   |   Turso staging ${f(trivialRemote.median)} ms  (min ${f(trivialRemote.min)} max ${f(trivialRemote.max)})`);

const countRemote = await timed(() => remote.execute('SELECT COUNT(*) FROM cities'));
console.info(`  COUNT(*) cities                       |   Turso staging ${f(countRemote.median)} ms`);
const cityRows = await remote.execute('SELECT COUNT(*) AS n FROM cities');
const regionRows = await remote.execute('SELECT COUNT(*) AS n FROM regions');
const countryRows = await remote.execute('SELECT COUNT(*) AS n FROM countries');
console.info(`  staging today: cities=${cityRows.rows[0].n} regions=${regionRows.rows[0].n} countries=${countryRows.rows[0].n}`);

console.info('\n  READ THIS: the local Q1 benchmark measured 8.7 ms for the leading-wildcard');
console.info('  scan. Compare that against the round-trip number above to see which term');
console.info('  dominates once the app talks to Turso rather than a local file.');

// ---------------------------------------------------------------
// Batch behaviour — does batch() cost one round trip or N?
// ---------------------------------------------------------------
console.info('\n' + '='.repeat(74));
console.info('Q3b — BATCH ROUND-TRIP BEHAVIOUR (reads — see credential constraint)');
console.info('='.repeat(74));
console.info('  batch size    median ms    ms/statement');
for (const n of [1, 10, 100, 500, 2000]) {
  const stmts = Array.from({ length: n }, () => 'SELECT 1');
  const r = await timed(() => remote.batch(stmts, 'read'), 5);
  if (r.err) { console.info(`  ${String(n).padStart(10)}    ERROR ${r.err}`); continue; }
  console.info(`  ${String(n).padStart(10)}${f(r.median)}${f(r.median / n)}`);
}

// A single statement carrying a large payload — the shape a real seed batch uses.
console.info('\n  Single statement carrying a large VALUES payload (the real seed shape):');
for (const n of [500, 2000]) {
  const vals = Array.from({ length: n }, (_, i) => `(${i})`).join(',');
  const r = await timed(() => remote.execute(`SELECT COUNT(*) FROM (VALUES ${vals})`), 5);
  console.info(`    ${String(n).padStart(5)} VALUES rows → ${f(r?.median)} ms`);
}

// ---------------------------------------------------------------
// The authorised write attempt — expected to be REJECTED.
// ---------------------------------------------------------------
console.info('\n' + '='.repeat(74));
console.info('Q3c — WRITE CAPABILITY (authorised scratch table, expected to be refused)');
console.info('='.repeat(74));
let writeCapable = false;
try {
  await remote.execute('CREATE TABLE IF NOT EXISTS spike_gazetteer_probe (id INTEGER PRIMARY KEY, name TEXT)');
  writeCapable = true;
  console.info('  CREATE TABLE spike_gazetteer_probe → SUCCEEDED (token is write-capable)');
} catch (e) {
  console.info(`  CREATE TABLE spike_gazetteer_probe → REJECTED: ${e.message}`);
  console.info('  → Confirms ADL-33 §5 by a second, independent probe (attempted write, not just');
  console.info('    the documentation). Turso INSERT throughput is NOT measurable from here.');
}

if (writeCapable) {
  // Only reachable if a write-capable token is ever supplied. Measure, then DROP.
  console.info('\n  Write-capable token detected — measuring real INSERT batches.');
  try {
    for (const n of [500, 2000]) {
      const ph = Array.from({ length: n }, () => '(?,?)').join(',');
      const args = [];
      for (let i = 0; i < n; i++) args.push(i, `name-${i}`);
      const t = ms();
      await remote.execute({ sql: `INSERT INTO spike_gazetteer_probe (id,name) VALUES ${ph}`, args });
      const took = ms() - t;
      console.info(`    INSERT ${String(n).padStart(5)} rows → ${took.toFixed(1)} ms  (extrapolated 170,540 rows: ${((took * 170540) / n / 1000).toFixed(1)} s)`);
      await remote.execute('DELETE FROM spike_gazetteer_probe');
    }
  } finally {
    await remote.execute('DROP TABLE IF EXISTS spike_gazetteer_probe');
    const still = await remote.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='spike_gazetteer_probe'");
    console.info(`  DROP spike_gazetteer_probe → ${still.rows.length === 0 ? 'CONFIRMED GONE' : 'STILL PRESENT — MANUAL CLEANUP REQUIRED'}`);
  }
} else {
  // Prove we left nothing behind even though the write was refused.
  const still = await remote.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='spike_gazetteer_probe'");
  console.info(`  Post-check: spike_gazetteer_probe present on staging? ${still.rows.length === 0 ? 'NO — nothing was created, nothing to clean up' : 'YES — MANUAL CLEANUP REQUIRED'}`);
}

// ---------------------------------------------------------------
// Storage headroom
// ---------------------------------------------------------------
console.info('\n' + '='.repeat(74));
console.info('Q3d — STORAGE HEADROOM');
console.info('='.repeat(74));
try {
  const pc = await remote.execute('PRAGMA page_count');
  const ps = await remote.execute('PRAGMA page_size');
  const pages = Number(Object.values(pc.rows[0])[0]);
  const size = Number(Object.values(ps.rows[0])[0]);
  console.info(`  staging DB today: ${pages} pages × ${size} B = ${((pages * size) / 1024 / 1024).toFixed(2)} MB`);
} catch (e) {
  console.info(`  PRAGMA page_count/page_size unavailable: ${e.message}`);
}
console.info('  Local measured gazetteer footprint is reported by gazetteer-bench.mjs.');

await remote.close();
await local.close();
console.info('\n[TURSO] done.');
