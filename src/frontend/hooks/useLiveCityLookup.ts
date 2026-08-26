/**
 * ADL-56 §3b (D8, B1-corrected) — the live geocode lookup that augments the
 * cached catalogue search, and THE single policy point that decides when it
 * fires (GE-21, BRD v3.22).
 *
 * ── WHY THIS EXISTS AS ITS OWN MODULE ────────────────────────────────────────
 * §3b item 7 requires the auto-fire trigger to sit at ONE isolated policy
 * point, so switching to the explicit-affordance fallback ("Search live for
 * more places") or throttling harder is a localized change rather than a
 * rewrite: the PO's "try it and roll back if it's an issue". That seam is
 * `LIVE_LOOKUP_MODE` below plus this hook's `mode`/`manualTriggered` options —
 * nothing else in either surface changes between `auto` and `manual`. The
 * merge, the P2 identity dedup and the select≠commit paths are identical in
 * both modes; only `enabled` moves.
 *
 * ── THE B1 RULE (the whole reason ADL-56 was amended twice) ───────────────────
 * The first OP-27 fresh-eyes review found that a "cached-first gate" — suppress
 * the live call when the cache already answers confidently — REINTRODUCES
 * BUG-97. A single cached row carries zero information about whether other real
 * places share the name, so "the only Newport in the catalogue" is
 * indistinguishable from "the only Newport that exists". There is therefore NO
 * cache-state input to this hook at all, by construction: it fires on the
 * settled query and nothing about the catalogue's answer can suppress it.
 *
 * ── WHAT BOUNDS IT INSTEAD (§3b items 1, 2, 4) ───────────────────────────────
 *   1. Debounced — the caller passes an ALREADY-debounced query (both surfaces
 *      use the same 300ms `DEBOUNCE_MS` their cached search uses), so it is one
 *      call per settled query, never one per keystroke.
 *   2. Minimum length 2 — the same gate `useCitySearch` applies.
 *   4. Per-query coalescing — React Query keyed by `(settledQuery, countrySet)`
 *      with an infinite `staleTime`, so returning to an already-fired settled
 *      query (type → delete → retype) serves the cached result and does not
 *      re-fire. At most one in-flight call per distinct key.
 * Together: at most ONE live call per distinct settled name. The multi-user
 * AGGREGATE Nominatim budget stays the parked D-33 thread, not designed here.
 *
 * ── STALENESS: LAST-QUERY-WINS (§3b item 6, mandatory) ───────────────────────
 * Because the call is bound to the settled query rather than to a click, a
 * response for a superseded query must never render. Keying by query is what
 * delivers that: the component always reads the CURRENT key's data, so a late
 * response for an abandoned query is simply never the active data — it cannot
 * mis-render even though it is still cached. This replaces the imperative
 * `lookupCityCountry(...).then(setState)` shape on `main`, which had no keying
 * whatsoever and let whichever promise resolved last win.
 *
 * ── REUSE ────────────────────────────────────────────────────────────────────
 * The transport is `lookupCityCountry` (hooks/useCities.ts) unchanged — its
 * retry policy and its BUG-73/BUG-74 `status` → `failed` mapping are exactly
 * what D5's S4-vs-S5 routing needs, so this hook adds keying and nothing else.
 */
import { useQuery } from '@tanstack/react-query';
import type { GeocodeCandidate } from '../types/api';
import { lookupCityCountry } from './useCities';

/** The two trigger policies §3b item 7 names. */
export type LiveLookupMode = 'auto' | 'manual';

/**
 * THE rollback seam. Flip to `'manual'` and the live lookup stops auto-firing:
 * callers then pass `manualTriggered` from an explicit "search online" control.
 * Read in exactly one place (this module's default), so the revert is this
 * constant plus rendering the control — never an unpick of the merge, the
 * dedup, or the selection model.
 */
export const LIVE_LOOKUP_MODE: LiveLookupMode = 'auto';

/** §3b item 2 — the same minimum the cached search applies. */
const MIN_QUERY_LENGTH = 2;

export interface LiveCityLookupState {
  /** Live candidates for the CURRENT settled query only (never a stale one). */
  candidates: GeocodeCandidate[];
  countryCode: string | null;
  regionIso: string | null;
  /** BUG-79 — the upstream response may have held more matches than shown. */
  truncated: boolean;
  /** D5 S5: retries exhausted, or the upstream geocoder errored / is disabled. */
  failed: boolean;
  /** NB-1: a lookup for the current settled query is in flight. */
  pending: boolean;
  /** The current settled query has reached a terminal outcome (D5 S3/S4/S5). */
  settled: boolean;
}

const IDLE: LiveCityLookupState = {
  candidates: [],
  countryCode: null,
  regionIso: null,
  truncated: false,
  failed: false,
  pending: false,
  settled: false,
};

/**
 * @param settledQuery - the ALREADY-debounced query. Passing a raw per-keystroke
 *   value would defeat §3b item 1 — the debounce is the caller's (both surfaces
 *   already hold one for their cached search, and reusing it is what keeps the
 *   two calls on the same settled value).
 * @param countryCodes - GE-20's trip-country filter, forwarded unchanged so the
 *   live half of the merged surface can no more escape the trip's countries
 *   than the cached half can.
 * @param options.mode - the rollback seam; defaults to `LIVE_LOOKUP_MODE`.
 * @param options.manualTriggered - in `manual` mode, whether the user has asked
 *   for the lookup. Ignored in `auto` mode.
 */
export function useLiveCityLookup(
  settledQuery: string,
  countryCodes: string[] = [],
  options: { mode?: LiveLookupMode; manualTriggered?: boolean } = {},
): LiveCityLookupState {
  const { mode = LIVE_LOOKUP_MODE, manualTriggered = false } = options;
  const query = settledQuery.trim();
  const codesParam = countryCodes.join(',');
  const enabled = query.length >= MIN_QUERY_LENGTH && (mode === 'auto' || manualTriggered);

  const { data, isFetching, isSuccess } = useQuery({
    // Keyed by value, exactly like `useCitySearch`'s ['cities','search',…] —
    // this is both the coalescing mechanism (item 4) and the last-query-wins
    // mechanism (item 6).
    queryKey: ['geocode', 'live', query, codesParam],
    queryFn: () => lookupCityCountry(query, countryCodes),
    enabled,
    // Item 4: a settled query already answered is never re-asked for the life
    // of the session. `lookupCityCountry` owns its own retry, so React Query's
    // retry stays off rather than multiplying the attempt count.
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    retry: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  if (!enabled) return IDLE;
  // `lookupCityCountry` resolves rather than throws (see its doc comment), so
  // an absent `data` means "not answered yet", not "failed".
  if (!data) return { ...IDLE, pending: isFetching };

  return {
    candidates: data.candidates ?? [],
    countryCode: data.countryCode ?? null,
    regionIso: data.regionIso ?? null,
    truncated: data.truncated ?? false,
    failed: data.failed,
    pending: isFetching,
    settled: isSuccess && !isFetching,
  };
}
