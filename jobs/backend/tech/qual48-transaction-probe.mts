/**
 * QUAL-48 spike probe — libSQL test-client transaction behaviour.
 *
 * INERT reproducible documentation (kept per the QUAL-25 gazetteer-spike precedent).
 * NOT a test: it is self-contained (no src imports) and lives outside every vitest
 * `include` glob, so CI never runs it. Reproduce the spike evidence with:
 *   npx tsx jobs/backend/tech/qual48-transaction-probe.mts        # all probes A–F
 *   npx tsx jobs/backend/tech/qual48-transaction-probe.mts E      # a single probe
 * Full findings: jobs/backend/tech/20260810-qual48-transaction-spike.md
 */
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { sql } from 'drizzle-orm';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DDL = `CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT NOT NULL);
CREATE TABLE ext (id INTEGER PRIMARY KEY, item_id INTEGER NOT NULL, note TEXT);
CREATE UNIQUE INDEX uq_v ON t(v);`;

function line(s: string) { console.log(s); }

async function build(url: string) {
  const client = createClient({ url });
  await client.execute('PRAGMA foreign_keys = ON;');
  await client.batch(DDL.split(';').map(s => s.trim()).filter(Boolean), 'write');
  return { client, db: drizzle(client) };
}

// -------- Probe A: plain :memory: — transaction then subsequent query --------
async function probeA() {
  line('\n=== A. plain :memory: — db.transaction() then a subsequent query on same client ===');
  const { client, db } = await build(':memory:');
  let txOk = false, subseqResult = 'n/a', subseqThrew = false;
  try {
    await db.transaction(async (tx) => {
      await tx.run(sql`INSERT INTO t (v) VALUES ('a')`);
    });
    txOk = true;
  } catch (e) { line('  transaction() itself threw: ' + (e as Error).message); }
  try {
    const r = await db.all<{ c: number }>(sql`SELECT COUNT(*) AS c FROM t`);
    subseqResult = JSON.stringify(r);
  } catch (e) { subseqThrew = true; subseqResult = 'THREW: ' + (e as Error).message; }
  line(`  transaction committed: ${txOk}`);
  line(`  subsequent SELECT: ${subseqResult}`);
  line(`  => subsequent query ${subseqThrew ? 'THREW (broken)' : (subseqResult.includes('"c":1') ? 'saw the row (OK)' : 'ran but LOST the row/schema (broken)')}`);
  client.close();
}

// -------- Probe B: :memory: db.batch() atomicity --------
async function probeB() {
  line('\n=== B. plain :memory: — db.batch() atomicity (2nd stmt violates unique index) ===');
  const { client } = await build(':memory:');
  let threw = false;
  try {
    await client.batch([
      { sql: `INSERT INTO t (v) VALUES ('x')`, args: [] },
      { sql: `INSERT INTO t (v) VALUES ('x')`, args: [] }, // unique violation
    ], 'write');
  } catch (e) { threw = true; }
  const { rows } = await client.execute(`SELECT COUNT(*) AS c FROM t`);
  line(`  batch threw: ${threw}; rows in t after: ${rows[0].c}`);
  line(`  => ${threw && Number(rows[0].c) === 0 ? 'ATOMIC: first insert rolled back (OK)' : 'NOT atomic'}`);
  client.close();
}

// -------- Probe C: file-backed — transaction then subsequent query --------
async function probeC() {
  line('\n=== C. file-backed (temp file) — db.transaction() then subsequent query ===');
  const dir = mkdtempSync(join(tmpdir(), 'qual48-'));
  const path = join(dir, 'test.db');
  const { client, db } = await build(`file:${path}`);
  let txOk = false, subseq = 'n/a', threw = false;
  try {
    await db.transaction(async (tx) => {
      await tx.run(sql`INSERT INTO t (v) VALUES ('a')`);
      await tx.run(sql`INSERT INTO ext (item_id, note) VALUES (1, 'n')`);
    });
    txOk = true;
  } catch (e) { line('  tx threw: ' + (e as Error).message); }
  try {
    const r = await db.all<{ c: number }>(sql`SELECT COUNT(*) AS c FROM t`);
    subseq = JSON.stringify(r);
  } catch (e) { threw = true; subseq = 'THREW: ' + (e as Error).message; }
  line(`  transaction committed: ${txOk}`);
  line(`  subsequent SELECT: ${subseq}`);
  line(`  => ${txOk && !threw && subseq.includes('"c":1') ? 'WORKS: tx honoured AND subsequent query survives (OK)' : 'FAILED'}`);
  // rollback test: orphan prevention
  let rbThrew = false;
  try {
    await db.transaction(async (tx) => {
      await tx.run(sql`INSERT INTO t (v) VALUES ('b')`);
      await tx.run(sql`INSERT INTO t (v) VALUES ('b')`); // unique violation mid-tx
    });
  } catch { rbThrew = true; }
  const after = await db.all<{ c: number }>(sql`SELECT COUNT(*) AS c FROM t WHERE v='b'`);
  line(`  mid-tx failure rolled back: threw=${rbThrew}, rows v='b'=${JSON.stringify(after)} => ${rbThrew && JSON.stringify(after).includes('"c":0') ? 'no orphan (OK)' : 'ORPHAN'}`);
  client.close();
  rmSync(dir, { recursive: true, force: true });
}

// -------- Probe D: :memory:?cache=shared — transaction then subsequent query --------
async function probeD() {
  line('\n=== D. :memory:?cache=shared — db.transaction() then subsequent query (no file I/O) ===');
  let built = true, buildErr = '';
  let client: any, db: any;
  try {
    ({ client, db } = await build('file::memory:?cache=shared'));
  } catch (e) { built = false; buildErr = (e as Error).message; }
  if (!built) { line('  build threw: ' + buildErr); return; }
  let txOk = false, subseq = 'n/a', threw = false;
  try {
    await db.transaction(async (tx: any) => {
      await tx.run(sql`INSERT INTO t (v) VALUES ('a')`);
    });
    txOk = true;
  } catch (e) { line('  tx threw: ' + (e as Error).message); }
  try {
    const r = await db.all<{ c: number }>(sql`SELECT COUNT(*) AS c FROM t`);
    subseq = JSON.stringify(r);
  } catch (e) { threw = true; subseq = 'THREW: ' + (e as Error).message; }
  line(`  transaction committed: ${txOk}`);
  line(`  subsequent SELECT: ${subseq}`);
  line(`  => ${txOk && !threw && subseq.includes('"c":1') ? 'WORKS (OK)' : 'FAILED'}`);
  client.close();
}

// -------- Probe E: cache=shared cross-client isolation (collision risk) --------
async function probeE() {
  line('\n=== E. :memory:?cache=shared — do TWO independent clients share one DB? (isolation risk) ===');
  // Client A: create table t
  const a = createClient({ url: 'file::memory:?cache=shared' });
  await a.batch(['CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT NOT NULL)'], 'write');
  await a.execute(`INSERT INTO t (v) VALUES ('from-A')`);
  // Client B: brand-new client, same URL — can it SEE A's table+row?
  let sawArow = false, msg = '';
  try {
    const b = createClient({ url: 'file::memory:?cache=shared' });
    const { rows } = await b.execute('SELECT v FROM t');
    sawArow = rows.length > 0;
    msg = JSON.stringify(rows.map(r => r.v));
    b.close();
  } catch (e) { msg = 'THREW: ' + (e as Error).message; }
  line(`  client B (separate) reading client A's table: sawRow=${sawArow} rows=${msg}`);
  line(`  => ${sawArow ? 'SHARED one DB across clients in-process (collision risk under parallel tests)' : 'each client isolated (no collision)'}`);
  a.close();
}

// -------- Probe F: file: named ?mode=memory (is it reachable through the client?) --------
async function probeF() {
  line('\n=== F. named in-memory (file:name?mode=memory&cache=shared) — reachable via client? ===');
  try {
    const c = createClient({ url: 'file:qual48named?mode=memory&cache=shared' });
    await c.execute('SELECT 1');
    line('  => accepted (named shared in-memory IS reachable)');
    c.close();
  } catch (e) { line('  => REJECTED: ' + (e as Error).message); }
}

const only = process.argv[2];
const all = { A: probeA, B: probeB, C: probeC, D: probeD, E: probeE, F: probeF } as const;
if (only && only in all) {
  await (all as any)[only]();
} else {
  await probeA(); await probeB(); await probeC(); await probeD(); await probeE(); await probeF();
}
line('\n--- versions ---');
line('node ' + process.version);
