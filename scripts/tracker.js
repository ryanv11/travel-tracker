#!/usr/bin/env node
/**
 * Travel Tracker — Work Tracker CLI
 * Usage:
 *   node scripts/tracker.js                    Full dashboard
 *   node scripts/tracker.js --owner backend    Filter by owner
 *   node scripts/tracker.js --type bug         Filter by type (phase|feature|bug|task|requirement)
 *   node scripts/tracker.js --status open      Filter: open = anything not done/deferred
 *   node scripts/tracker.js --priority P0      Filter by priority
 *   node scripts/tracker.js --id BUG-01        Detail view for one item
 *   node scripts/tracker.js --brd MP           Items referencing BRD reqs starting with MP
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Load data ───────────────────────────────────────────────────────────────

const dataPath = resolve(__dirname, '../_project/tracker.json');
let raw;
try {
  raw = readFileSync(dataPath, 'utf8');
  // Strip JS-style comments so we can parse the JSON
  raw = raw.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
} catch (e) {
  console.error('Cannot read _project/tracker.json:', e.message);
  process.exit(1);
}

let data;
try {
  data = JSON.parse(raw);
} catch (e) {
  console.error('tracker.json parse error:', e.message);
  process.exit(1);
}

const { meta, items } = data;

// ─── ANSI helpers ────────────────────────────────────────────────────────────

const R = '\x1b[0m';
const B = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const GRN = '\x1b[32m';
const YLW = '\x1b[33m';
const BLU = '\x1b[34m';
const MAG = '\x1b[35m';
const CYN = '\x1b[36m';
const BRED = '\x1b[91m';
const BGRN = '\x1b[92m';
const BYLW = '\x1b[93m';
const BCYN = '\x1b[96m';

const WIDTH = 80;

function hr(char = '─') { return char.repeat(WIDTH); }
function bold(s) { return `${B}${s}${R}`; }
function pad(s, len) { return String(s).padEnd(len); }

function statusLabel(status) {
  switch (status) {
    case 'done':        return `${BGRN}✅ done       ${R}`;
    case 'in_progress': return `${BCYN}🔄 in progress${R}`;
    case 'blocked':     return `${BRED}⏸  blocked    ${R}`;
    case 'pending':     return `${BYLW}⬜ pending    ${R}`;
    case 'deferred':    return `${DIM}◌  deferred   ${R}`;
    default:            return status;
  }
}

function statusBadge(status) {
  switch (status) {
    case 'done':        return `${BGRN}DONE${R}`;
    case 'in_progress': return `${BCYN}IN PROGRESS${R}`;
    case 'blocked':     return `${BRED}BLOCKED${R}`;
    case 'pending':     return `${BYLW}PENDING${R}`;
    case 'deferred':    return `${DIM}DEFERRED${R}`;
    default:            return status;
  }
}

function priorityBadge(p) {
  switch (p) {
    case 'P0': return `${BRED}${B}P0${R}`;
    case 'P1': return `${RED}P1${R}`;
    case 'P2': return `${YLW}P2${R}`;
    case 'P3': return `${DIM}P3${R}`;
    default:   return p;
  }
}

function ownerTag(o) {
  const colours = {
    architect:    MAG,
    database:     BLU,
    backend:      CYN,
    frontend:     GRN,
    qa:           YLW,
    docs:         DIM,
    coo:          BRED,
    integrations: DIM,
    system:       DIM,
  };
  const c = colours[o] || '';
  return `${c}${pad(o, 12)}${R}`;
}

function progressBar(done, inProgress, total, width = 24) {
  if (total === 0) return '─'.repeat(width);
  const doneBlocks = Math.round((done / total) * width);
  const ipBlocks   = Math.round((inProgress / total) * width);
  const remaining  = width - doneBlocks - ipBlocks;
  return (
    `${BGRN}${'█'.repeat(doneBlocks)}${R}` +
    `${BCYN}${'▒'.repeat(Math.max(0, ipBlocks))}${R}` +
    `${DIM}${'░'.repeat(Math.max(0, remaining))}${R}`
  );
}

// ─── Arg parsing ─────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function getArg(flag) {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
}
function hasFlag(flag) { return args.includes(flag); }

const filterOwner    = getArg('--owner');
const filterType     = getArg('--type');
const filterStatus   = getArg('--status');
const filterPriority = getArg('--priority');
const filterId       = getArg('--id');
const filterBrd      = getArg('--brd');
const filterOpen     = hasFlag('--open');

// ─── Views ───────────────────────────────────────────────────────────────────

function isOpen(item) {
  return item.status !== 'done' && item.status !== 'deferred';
}

function applyFilters(list) {
  return list.filter(item => {
    if (filterOwner    && item.owner !== filterOwner) return false;
    if (filterType     && item.type  !== filterType)  return false;
    if (filterPriority && item.priority !== filterPriority.toUpperCase()) return false;
    if (filterStatus === 'open' && !isOpen(item)) return false;
    if (filterStatus && filterStatus !== 'open' && item.status !== filterStatus) return false;
    if (filterBrd) {
      const prefix = filterBrd.toUpperCase();
      if (!item.brdRefs.some(r => r.startsWith(prefix))) return false;
    }
    return true;
  });
}

// ─── Detail view ─────────────────────────────────────────────────────────────

function showDetail(id) {
  const item = items.find(i => i.id.toLowerCase() === id.toLowerCase());
  if (!item) {
    console.log(`\n${RED}No item found with id: ${id}${R}\n`);
    return;
  }
  console.log();
  console.log(bold(`${item.id}  —  ${item.title}`));
  console.log(hr());
  console.log(`  Type:      ${item.type}`);
  console.log(`  Status:    ${statusLabel(item.status)}`);
  console.log(`  Priority:  ${priorityBadge(item.priority)}`);
  console.log(`  Owner:     ${ownerTag(item.owner)}`);
  console.log(`  Phase:     ${item.phase}`);
  if (item.brdRefs.length > 0) {
    console.log(`  BRD refs:  ${item.brdRefs.join(', ')}`);
  }
  console.log();
  console.log(`  ${item.notes}`);
  console.log();
}

// ─── Phase summary ───────────────────────────────────────────────────────────

function showPhases() {
  const phases = items.filter(i => i.type === 'phase');
  console.log(bold('PHASES'));
  for (const p of phases) {
    const icon = {
      done:        `${BGRN}✅${R}`,
      in_progress: `${BCYN}🔄${R}`,
      blocked:     `${BRED}⏸ ${R}`,
      pending:     `${BYLW}⬜${R}`,
      deferred:    `${DIM}◌ ${R}`,
    }[p.status] || '  ';
    const statusStr = {
      done:        `${BGRN}COMPLETE${R}`,
      in_progress: `${BCYN}IN PROGRESS${R}`,
      blocked:     `${BRED}BLOCKED${R}`,
      pending:     `${BYLW}PENDING${R}`,
      deferred:    `${DIM}PENDING${R}`,
    }[p.status] || p.status;
    console.log(`  ${icon}  ${pad(p.id, 8)}  ${pad(p.title, 38)}  ${statusStr}`);
  }
}

// ─── BRD coverage ────────────────────────────────────────────────────────────

function showBrdCoverage() {
  const features = items.filter(i => i.type === 'feature');
  const nrs      = items.filter(i => i.type === 'requirement' && i.id.startsWith('NR-'));
  const ops      = items.filter(i => i.type === 'requirement' && i.id.startsWith('OP-'));

  function counts(list) {
    return {
      done:        list.filter(i => i.status === 'done').length,
      in_progress: list.filter(i => i.status === 'in_progress').length,
      blocked:     list.filter(i => i.status === 'blocked').length,
      pending:     list.filter(i => i.status === 'pending').length,
      deferred:    list.filter(i => i.status === 'deferred').length,
      total:       list.length,
    };
  }

  function coverageLine(label, c, brdCount) {
    const active = c.done + c.in_progress + c.blocked;
    const pct    = Math.round((c.done / (c.total - c.deferred || 1)) * 100);
    const bar    = progressBar(c.done, c.in_progress + c.blocked, c.total - c.deferred);
    const detail = [
      c.done        ? `${BGRN}${c.done} done${R}`            : '',
      c.in_progress ? `${BCYN}${c.in_progress} in progress${R}` : '',
      c.blocked     ? `${BRED}${c.blocked} blocked${R}`       : '',
      c.pending     ? `${BYLW}${c.pending} pending${R}`       : '',
      c.deferred    ? `${DIM}${c.deferred} deferred${R}`      : '',
    ].filter(Boolean).join('  ');
    console.log(`  ${pad(label, 22)}  ${bar}  ${detail}`);
    if (brdCount) {
      console.log(`  ${DIM}${pad('', 22)}  ${brdCount} BRD requirements tracked${R}`);
    }
  }

  const featBrdCount = [...new Set(features.flatMap(f => f.brdRefs))].length;

  console.log(bold('BRD COVERAGE'));
  coverageLine('Core v2.3 (features)', counts(features), featBrdCount);
  coverageLine('Delta NRs (NR-01–15)', counts(nrs));
  coverageLine('Governance (OP-01–06)', counts(ops));
}

// ─── Open items by priority ───────────────────────────────────────────────────

function showOpenItems(list) {
  const open = list.filter(i => i.type !== 'phase' && isOpen(i));
  if (open.length === 0) {
    console.log(`  ${BGRN}No open items${R}`);
    return;
  }

  const byPriority = { P0: [], P1: [], P2: [], P3: [] };
  for (const item of open) {
    if (byPriority[item.priority]) byPriority[item.priority].push(item);
    else byPriority.P3.push(item);
  }

  const labels = {
    P0: `${BRED}${B}P0  BLOCKERS${R}`,
    P1: `${RED}P1  CRITICAL${R}`,
    P2: `${YLW}P2  IMPORTANT${R}`,
    P3: `${DIM}P3  MINOR${R}`,
  };

  let total = 0;
  for (const [p, group] of Object.entries(byPriority)) {
    if (group.length === 0) continue;
    total += group.length;
    console.log(`\n  ${labels[p]}  ${DIM}(${group.length})${R}`);
    for (const item of group) {
      const statusIcon = {
        in_progress: `${BCYN}●${R}`,
        blocked:     `${BRED}◼${R}`,
        pending:     `${BYLW}○${R}`,
      }[item.status] || '·';
      const idStr    = `${B}${pad(item.id, 8)}${R}`;
      const ownerStr = ownerTag(item.owner);
      const title    = item.title.length > 40
        ? item.title.slice(0, 37) + '...'
        : item.title;
      console.log(`    ${statusIcon}  ${idStr}  ${ownerStr}  ${title}`);
    }
  }
  return total;
}

// ─── Owner workload ──────────────────────────────────────────────────────────

function showOwnerSummary() {
  const open = items.filter(i => i.type !== 'phase' && isOpen(i));
  const byOwner = {};
  for (const item of open) {
    if (!byOwner[item.owner]) byOwner[item.owner] = { open: 0, blocked: 0 };
    byOwner[item.owner].open++;
    if (item.status === 'blocked') byOwner[item.owner].blocked++;
  }

  const sorted = Object.entries(byOwner).sort((a, b) => b[1].open - a[1].open);
  if (sorted.length === 0) return;

  console.log(bold('OPEN ITEMS BY OWNER'));
  for (const [owner, counts] of sorted) {
    const bar   = '█'.repeat(counts.open);
    const extra = counts.blocked > 0 ? `  ${BRED}${counts.blocked} blocked${R}` : '';
    console.log(`  ${ownerTag(owner)}  ${BCYN}${bar}${R}  ${counts.open} open${extra}`);
  }
}

// ─── Main dashboard ──────────────────────────────────────────────────────────

function showDashboard() {
  const filtered = applyFilters(items);
  const isFiltered = filterOwner || filterType || filterStatus || filterPriority || filterBrd;

  console.log();
  console.log(`${B}TRAVEL TRACKER — WORK TRACKER${R}${DIM}   updated: ${meta.updated}${R}`);
  console.log(hr('═'));

  if (!isFiltered) {
    showPhases();
    console.log();
    console.log(hr());
    console.log();
    showBrdCoverage();
    console.log();
    console.log(hr());
    console.log();
    showOwnerSummary();
    console.log();
    console.log(hr());
    console.log();
    console.log(bold('OPEN ITEMS'));
    const total = showOpenItems(items);
    console.log();
    console.log(hr());
    const deferred = items.filter(i => i.status === 'deferred' && i.type !== 'phase').length;
    const done     = items.filter(i => i.status === 'done'     && i.type !== 'phase').length;
    console.log(`  ${DIM}${done} done  ·  ${deferred} deferred  ·  ${total} open${R}`);
  } else {
    // Filtered view
    const label = [
      filterOwner    && `owner=${filterOwner}`,
      filterType     && `type=${filterType}`,
      filterStatus   && `status=${filterStatus}`,
      filterPriority && `priority=${filterPriority}`,
      filterBrd      && `brd=${filterBrd}`,
    ].filter(Boolean).join(', ');
    console.log(`  ${DIM}Filter: ${label}${R}`);
    console.log();

    if (filtered.length === 0) {
      console.log(`  ${YLW}No items match this filter.${R}`);
    } else {
      for (const item of filtered) {
        const idStr = `${B}${pad(item.id, 8)}${R}`;
        console.log(
          `  ${statusLabel(item.status)}  ${priorityBadge(item.priority)}  ` +
          `${idStr}  ${ownerTag(item.owner)}  ${item.title}`
        );
        if (item.brdRefs.length > 0) {
          console.log(`  ${DIM}             BRD: ${item.brdRefs.join(', ')}${R}`);
        }
      }
      console.log();
      console.log(hr());
      console.log(`  ${DIM}${filtered.length} items${R}`);
    }
  }

  console.log();
  console.log(
    `${DIM}  node scripts/tracker.js --owner <owner>   filter by owner` +
    `\n  node scripts/tracker.js --type <type>     filter by type (phase|feature|bug|task|requirement)` +
    `\n  node scripts/tracker.js --status open     open items only` +
    `\n  node scripts/tracker.js --priority P0     filter by priority` +
    `\n  node scripts/tracker.js --id <id>         item detail` +
    `\n  node scripts/tracker.js --brd <prefix>    items by BRD ref (e.g. --brd MP)${R}`
  );
  console.log();
}

// ─── Entry point ─────────────────────────────────────────────────────────────

if (filterId) {
  showDetail(filterId);
} else {
  showDashboard();
}
