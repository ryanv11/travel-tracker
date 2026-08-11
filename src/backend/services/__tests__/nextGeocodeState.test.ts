/**
 * GE-19 / BUG-85 — nextGeocodeState PURE-FUNCTION TABLE TEST (ADL-55 §7
 * criterion 11, §3.2). The Backend-owned unit-level red bar for the geocode
 * state machine: every (current-row × verdict) cell of the §3.2 table yields the
 * specified {status, attempts, cause}. No DB, no network — nextGeocodeState is a
 * pure function (ADL-55 D5), which is the whole point of extracting the policy
 * out of resolveCity's IO.
 *
 * The cap is GEOCODE_ATTEMPT_CAP = 5 (geocoding.service.ts). The boundary is
 * pinned via attempts=3 (3+1=4 < 5 → stays pending) vs attempts=4 (4+1=5 >= 5 →
 * needs_attention), so the semantics are asserted without importing the private
 * constant — if the cap moves, this test's boundary cases surface it as the
 * behaviour change it is.
 */

import { describe, expect, it } from 'vitest';
import {
  type GeocodeLifecycleVerdict,
  type GeocodeStateInput,
  type NextGeocodeState,
  nextGeocodeState,
} from '../geocoding.service.js';

interface Case {
  name: string;
  row: GeocodeStateInput;
  verdict: GeocodeLifecycleVerdict;
  expected: NextGeocodeState;
}

/** Terse constructor for a current-row state. */
const row = (
  geocodeStatus: GeocodeStateInput['geocodeStatus'],
  geocodeAttempts: number,
  geocodeCause: GeocodeStateInput['geocodeCause'] = null,
): GeocodeStateInput => ({ geocodeStatus, geocodeAttempts, geocodeCause });

const cases: Case[] = [
  // ── 'ok' → resolved. Attempts are irrelevant once resolved (preserved as-is);
  //    any prior cause is cleared.
  {
    name: 'ok → resolved, attempts preserved, cause cleared',
    row: row('pending', 2, 'unreachable'),
    verdict: 'ok',
    expected: { status: 'resolved', attempts: 2, cause: null },
  },

  // ── 'no_match' → unresolvable (terminal, ADL-46 D10). NOT a recoverable
  //    failure, so no attempt is consumed; cause null.
  {
    name: 'no_match → unresolvable, no attempt consumed, cause null',
    row: row('pending', 0),
    verdict: 'no_match',
    expected: { status: 'unresolvable', attempts: 0, cause: null },
  },
  {
    name: 'no_match preserves an existing attempt count (does not increment)',
    row: row('pending', 3, 'unreachable'),
    verdict: 'no_match',
    expected: { status: 'unresolvable', attempts: 3, cause: null },
  },

  // ── 'ambiguous' → needs_attention/ambiguous on the FIRST verdict (D1a / OQ-3).
  //    Deterministic answer, so NO retry is ever spent, whatever the budget.
  {
    name: 'ambiguous → needs_attention/ambiguous, attempts unchanged (fresh)',
    row: row('pending', 0),
    verdict: 'ambiguous',
    expected: { status: 'needs_attention', attempts: 0, cause: 'ambiguous' },
  },
  {
    name: 'ambiguous never consumes budget even mid-retry',
    row: row('pending', 3, 'unreachable'),
    verdict: 'ambiguous',
    expected: { status: 'needs_attention', attempts: 3, cause: 'ambiguous' },
  },

  // ── 'unreachable' below the cap → pending, +1, unreachable. The failing
  //    attempt counts; the row keeps retrying.
  {
    name: 'unreachable below cap → pending, +1, unreachable (0→1)',
    row: row('pending', 0),
    verdict: 'unreachable',
    expected: { status: 'pending', attempts: 1, cause: 'unreachable' },
  },
  {
    name: 'unreachable one below cap → still pending (3→4 < 5)',
    row: row('pending', 3),
    verdict: 'unreachable',
    expected: { status: 'pending', attempts: 4, cause: 'unreachable' },
  },

  // ── 'unreachable' AT/beyond the cap → needs_attention/unreachable. The cap is
  //    an ACTIVE transition, so a row never sits pending-at-cap (§R F2).
  {
    name: 'unreachable reaching cap → needs_attention/unreachable (4→5 >= 5)',
    row: row('pending', 4),
    verdict: 'unreachable',
    expected: { status: 'needs_attention', attempts: 5, cause: 'unreachable' },
  },
  {
    name: 'unreachable beyond cap → needs_attention/unreachable (5→6)',
    row: row('pending', 5),
    verdict: 'unreachable',
    expected: { status: 'needs_attention', attempts: 6, cause: 'unreachable' },
  },

  // ── 'disabled' → nothing changes at all (no increment), whatever the current
  //    state. A global offline window must not burn a city's budget (D10).
  {
    name: 'disabled → unchanged mid-retry pending row (no increment)',
    row: row('pending', 2, 'unreachable'),
    verdict: 'disabled',
    expected: { status: 'pending', attempts: 2, cause: 'unreachable' },
  },
  {
    name: 'disabled → unchanged fresh pending row',
    row: row('pending', 0),
    verdict: 'disabled',
    expected: { status: 'pending', attempts: 0, cause: null },
  },
  {
    name: 'disabled → leaves a needs_attention row exactly as-is',
    row: row('needs_attention', 5, 'ambiguous'),
    verdict: 'disabled',
    expected: { status: 'needs_attention', attempts: 5, cause: 'ambiguous' },
  },
];

describe('GE-19 (BUG-85) §7 criterion 11 — nextGeocodeState table (ADL-55 §3.2)', () => {
  it.each(cases)('$name', ({ row: input, verdict, expected }) => {
    expect(nextGeocodeState(input, verdict)).toEqual(expected);
  });
});
