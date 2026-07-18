#!/usr/bin/env node
/**
 * Travel Tracker — human-readable status snapshot generator.
 *
 * Renders _project/tracker.json into _project/STATUS.md (markdown dashboard).
 *
 * Usage:
 *   npm run status          Regenerate _project/STATUS.md
 *   npm run status:check    Exit 1 if STATUS.md is stale (pre-push gate)
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadTracker, isOpen } from './lib/tracker-data.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, '../_project/STATUS.md');

const STATUS_DISPLAY = {
  done: '✅ Done',
  in_progress: '🔄 In progress',
  partial: '◐ Partial',
  blocked: '⛔ Blocked',
  pending: '⬜ Pending',
  deferred: '⏸️ Deferred',
  closed: '✖️ Closed',
};

const PRIORITY_SECTIONS = [
  ['P0', 'P0 — Blockers'],
  ['P1', 'P1 — Critical'],
  ['P2', 'P2 — Important'],
  ['P3', 'P3 — Minor'],
];

function bar(done, partial, total, width = 20) {
  if (total === 0) return '░'.repeat(width);
  const d = Math.round((done / total) * width);
  const p = Math.min(width - d, Math.round((partial / total) * width));
  return '█'.repeat(d) + '▓'.repeat(p) + '░'.repeat(Math.max(0, width - d - p));
}

function esc(s) {
  return String(s).replace(/\|/g, '\\|');
}

function render(data) {
  const { meta, items } = data;
  const lines = [];
  const push = (...l) => lines.push(...l);

  const phases = items.filter((i) => i.type === 'phase');
  const work = items.filter((i) => i.type !== 'phase');
  const open = work.filter(isOpen);
  const done = work.filter((i) => i.status === 'done');
  const deferred = work.filter((i) => i.status === 'deferred');
  const closed = work.filter((i) => i.status === 'closed');

  push(
    '# Travel Tracker — Status',
    '',
    '> **Generated** from `_project/tracker.json` — do not edit by hand.',
    '> Regenerate with `npm run status`. Staleness is gated by `npm run status:check` (pre-push).',
    '',
    `_Tracker last updated: ${meta.updated}_`,
    ''
  );

  // ── Phases ────────────────────────────────────────────────────────────────
  push('## Phases', '', '| Phase | Title | Status |', '|---|---|---|');
  for (const p of phases) {
    push(`| ${p.id} | ${esc(p.title)} | ${STATUS_DISPLAY[p.status] ?? p.status} |`);
  }
  push('');

  // ── Open work ─────────────────────────────────────────────────────────────
  push(`## Open work (${open.length})`, '');
  for (const [pri, heading] of PRIORITY_SECTIONS) {
    const group = open.filter((i) => (i.priority ?? 'P3') === pri);
    if (group.length === 0) continue;
    push(`### ${heading} (${group.length})`, '');
    push('| ID | Title | Owner | Status |', '|---|---|---|---|');
    for (const i of group) {
      push(
        `| ${i.id} | ${esc(i.title)} | ${i.owner} | ${STATUS_DISPLAY[i.status] ?? i.status} |`
      );
    }
    push('');
  }
  if (open.length === 0) push('_No open items._', '');

  // ── Coverage rollup ───────────────────────────────────────────────────────
  push('## Coverage by type', '', '| Type | Progress | Done | Open | Deferred/Closed |', '|---|---|---|---|---|');
  const types = ['feature', 'requirement', 'bug', 'task', 'chore'];
  for (const t of types) {
    const group = work.filter((i) => i.type === t);
    if (group.length === 0) continue;
    const gDone = group.filter((i) => i.status === 'done').length;
    const gPartial = group.filter((i) => ['partial', 'in_progress'].includes(i.status)).length;
    const gResolved = group.filter((i) => ['deferred', 'closed'].includes(i.status)).length;
    const gOpen = group.filter(isOpen).length;
    const denom = group.length - gResolved;
    push(
      `| ${t} | \`${bar(gDone, gPartial, denom)}\` ${gDone}/${denom} | ${gDone} | ${gOpen} | ${gResolved} |`
    );
  }
  push('');

  // ── Deferred / closed ─────────────────────────────────────────────────────
  if (deferred.length > 0) {
    push('<details>', `<summary>Deferred (${deferred.length})</summary>`, '');
    push('| ID | Title | Owner |', '|---|---|---|');
    for (const i of deferred) push(`| ${i.id} | ${esc(i.title)} | ${i.owner} |`);
    push('', '</details>', '');
  }
  if (closed.length > 0) {
    push('<details>', `<summary>Closed without change (${closed.length})</summary>`, '');
    push('| ID | Title | Resolution |', '|---|---|---|');
    for (const i of closed) push(`| ${i.id} | ${esc(i.title)} | ${i.rawStatus} |`);
    push('', '</details>', '');
  }

  push('---', '', `_${done.length} done · ${deferred.length} deferred · ${closed.length} closed · ${open.length} open — ${work.length} tracked items_`, '');
  return lines.join('\n');
}

const data = loadTracker();
const output = render(data);

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(OUT_PATH, 'utf8');
  } catch {
    /* missing file is stale */
  }
  if (current !== output) {
    console.error('STATUS.md is stale — run `npm run status` and commit the result.');
    process.exit(1);
  }
  console.log('STATUS.md is up to date.');
} else {
  writeFileSync(OUT_PATH, output);
  console.log(`Wrote ${OUT_PATH}`);
}
