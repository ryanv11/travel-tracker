/**
 * Shared loader for _project/tracker.json (JSONC — allows // and block comments).
 *
 * The comment stripper is string-aware: `//` inside a JSON string literal (URLs,
 * code-comment references like "// BUG-A") is preserved. The previous regex-based
 * stripper truncated such strings and broke parsing entirely (BUG-23 / issue #96).
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const TRACKER_PATH = resolve(__dirname, '../../_project/tracker.json');

export function stripJsonComments(src) {
  let out = '';
  let i = 0;
  let inString = false;
  while (i < src.length) {
    const c = src[i];
    if (inString) {
      out += c;
      if (c === '\\') {
        out += src[i + 1] ?? '';
        i += 2;
        continue;
      }
      if (c === '"') inString = false;
      i++;
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
      i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/**
 * Status values in tracker.json have drifted over time (in-progress vs in_progress,
 * open, backlog, …). Normalise to a canonical set for display; the raw value is
 * kept on the item as `rawStatus`.
 *
 * Canonical: done | in_progress | partial | blocked | pending | deferred | closed
 */
const STATUS_ALIASES = {
  'in-progress': 'in_progress',
  open: 'pending',
  backlog: 'pending',
  accepted: 'deferred', // accepted limitation — not being worked
  'not-a-bug': 'closed', // investigated, closed without change
};

export function normaliseStatus(status) {
  return STATUS_ALIASES[status] ?? status;
}

/** Statuses that count as "no further work expected". */
export const RESOLVED_STATUSES = new Set(['done', 'deferred', 'closed']);

export function isOpen(item) {
  return !RESOLVED_STATUSES.has(item.status);
}

export function loadTracker() {
  const raw = readFileSync(TRACKER_PATH, 'utf8');
  const data = JSON.parse(stripJsonComments(raw));
  for (const item of data.items) {
    item.rawStatus = item.status;
    item.status = normaliseStatus(item.status);
  }
  return data;
}
