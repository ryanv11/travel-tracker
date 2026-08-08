#!/usr/bin/env node
/**
 * tracker-check — hard gate on tracker.json integrity. Run in /pre-push and CI.
 *
 * Enforces what git cannot catch on its own (CLAUDE.md + the grep-tracker-id-is-free
 * memory — a duplicate tracker ID has slipped THREE times: BUG-77, DEP-03, OP-33/34, none
 * flagged by git):
 *   1. tracker.json (JSONC) parses.
 *   2. Every item carries the required fields.
 *   3. No duplicate `id`, across all prefixes. Governance OP rules are backfilled into the
 *      tracker, so it is the single OP registry and a within-file dup check also catches the
 *      CLAUDE.md-vs-tracker OP collision that bit us this session.
 *   4. brdRefs integrity: every brdRefs value names a real requirement ID in the BRD.
 *
 * Exit non-zero on any violation. Zero-network, zero-false-positive on clean data.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { stripJsonComments, TRACKER_PATH } from './lib/tracker-data.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BRD_PATH = resolve(__dirname, '../_project/travel-tracker-BRD.md');

const errors = [];

let tracker;
try {
  tracker = JSON.parse(stripJsonComments(readFileSync(TRACKER_PATH, 'utf8')));
} catch (e) {
  console.error(`tracker-check: FAIL — tracker.json does not parse: ${e.message}`);
  process.exit(1);
}

const items = Array.isArray(tracker.items) ? tracker.items : [];
if (!items.length) {
  console.error('tracker-check: FAIL — no items[] array found in tracker.json');
  process.exit(1);
}

// 2. required fields
const REQUIRED = ['id', 'type', 'title', 'status', 'priority'];
for (const it of items) {
  const missing = REQUIRED.filter((k) => it[k] === undefined || it[k] === '');
  if (missing.length) errors.push(`item ${it.id || '(no id)'} missing required field(s): ${missing.join(', ')}`);
}

// 3. duplicate ids
const counts = new Map();
for (const it of items) if (it.id) counts.set(it.id, (counts.get(it.id) || 0) + 1);
for (const [id, n] of counts) if (n > 1) errors.push(`duplicate id: ${id} appears ${n} times`);

// 4. brdRefs integrity
const brdText = readFileSync(BRD_PATH, 'utf8');
const brdIds = new Set(brdText.match(/\b[A-Z][A-Z0-9]*-\d+\b/g) || []);
for (const it of items) {
  if (!Array.isArray(it.brdRefs)) continue;
  for (const ref of it.brdRefs) {
    const bare = String(ref).replace(/^BRD-/, '');
    if (!brdIds.has(ref) && !brdIds.has(bare)) {
      errors.push(`item ${it.id}: brdRef "${ref}" is not a requirement ID present in the BRD`);
    }
  }
}

if (errors.length) {
  console.error(`tracker-check: FAIL — ${errors.length} problem(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`tracker-check: OK — ${items.length} items, no duplicate ids, brdRefs valid.`);
