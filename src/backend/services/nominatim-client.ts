/**
 * Travel Tracker — Nominatim Egress Chokepoint (ADL-46 §5.1.1 / D7)
 *
 * THE single point through which ALL Nominatim egress passes: the 15-minute
 * geocode queue (processQueue), resolve-then-create on every POST /api/cities,
 * and the user-interactive geocode proxy route. Before ADL-46 there were three
 * uncoordinated call sites sharing one User-Agent and one egress IP against a
 * 1 req/s per-application policy — consolidating egress without a chokepoint
 * strictly increases rate-limit exposure (a violation now blocks the whole app
 * rather than an anonymous browser).
 *
 * Design:
 *   - A single serialized promise chain enforces >= REQUEST_DELAY_MS between the
 *     START of consecutive requests, application-wide. One module owns the delay,
 *     not three callers each sleeping independently.
 *   - The isOnline() HEAD probe is deliberately NOT used here (§5.1.1): a probe
 *     before every search doubled the request rate to establish something the
 *     search itself reveals. A failed search is caught and reported as "no
 *     result / recoverable" by the caller instead.
 *   - GEOCODING_ENABLED=false (CI, ADL-10) short-circuits to an empty result with
 *     no egress and no queue delay.
 *
 * Interactive fairness (§5.1.1): interactive lookups (the proxy) are NOT starved
 * behind a long batch run because each request only waits for the single-slot
 * delay since the last request, not for a whole batch — processQueue awaits each
 * search through this same chokepoint, so an interactive request interleaves
 * naturally rather than queueing behind the entire pending set. D10's give-up
 * rule bounds how large the batch can ever get.
 */

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'TravelTracker/1.0 (personal-use-app)';
/** 100ms above Nominatim's 1 req/s policy (ADL-10). */
const REQUEST_DELAY_MS = 1100;
const REQUEST_TIMEOUT_MS = 5000;

/** When GEOCODING_ENABLED=false, all egress is skipped (e.g. CI contract tests). */
function geocodingEnabled(): boolean {
  return process.env.GEOCODING_ENABLED !== 'false';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// The serialized queue: every request appends to this chain, so at most one
// Nominatim request is in flight at a time and consecutive requests are spaced
// by REQUEST_DELAY_MS. Module-level = process-wide (single egress IP).
let chain: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

/** A single settlement-type candidate parsed from a Nominatim response. */
export interface NominatimCandidate {
  displayName: string;
  /** The place name (the first comma-separated segment of display_name). */
  name: string;
  latitude: number;
  longitude: number;
  /** ISO 3166-1 alpha-2, upper-cased, if the response carried address details. */
  countryCode: string | null;
  /** ISO 3166-2 subdivision code (e.g. 'US-CO'), if present. */
  regionIso: string | null;
  /** Nominatim class/type — used to filter to settlements. */
  class?: string;
  type?: string;
}

interface RawNominatimResult {
  lat: string;
  lon: string;
  display_name?: string;
  name?: string;
  class?: string;
  type?: string;
  address?: {
    country_code?: string;
    'ISO3166-2-lvl4'?: string;
  };
}

const SETTLEMENT_TYPES = new Set(['city', 'town', 'village', 'hamlet', 'municipality']);

/**
 * Discriminated result of one search (ADL-46 D10 §4.4.1): the caller must
 * distinguish "the geocoder answered, and the answer was no match" (terminal)
 * from "the question was never actually answered" (recoverable) and from the
 * global GEOCODING_ENABLED=false / offline condition (must not count against a
 * per-city retry budget).
 */
export type NominatimSearchResult =
  /**
   * Geocoder answered. candidates may be empty — that is a terminal "no match".
   *
   * `truncated` (BUG-79, GitHub #379): true when the RAW response (before the
   * settlement-type/parse filter below discards anything) came back with at
   * least as many rows as the caller's requested `limit` — i.e. Nominatim may
   * have had more matches it didn't return. Computed from the pre-filter
   * count specifically because that count used to be discarded entirely once
   * `.filter()` ran, which made "one real region" and "one region that
   * survived truncation" indistinguishable to every caller. `false`/absent
   * when the caller passed no numeric `limit` (nothing to compare against) or
   * when the raw count came in under it — a response smaller than what was
   * asked for is, by definition, not truncated by our own request. Optional
   * (not every existing caller's test fixtures set it, and every consumer
   * treats an absent value the same as `false`) rather than forcing every
   * pre-existing `NominatimSearchResult` fixture in geocoding.service.test.ts
   * / cities.f1f2-ruling.test.ts (neither of which this fix touches) to grow
   * an unrelated field.
   */
  | { status: 'ok'; candidates: NominatimCandidate[]; truncated?: boolean }
  /** GEOCODING_ENABLED=false — a global condition, never a per-city failure. */
  | { status: 'disabled' }
  /** Network error, timeout, 5xx, 429, host unreachable — recoverable, retry. */
  | { status: 'error' };

/**
 * Runs one Nominatim search through the serialized chokepoint. Never throws.
 *
 * @param params - Query entries (q, countrycodes, limit, etc.). The module
 *                 always forces format=json and addressdetails=1.
 */
export async function nominatimSearch(
  params: Record<string, string>,
): Promise<NominatimSearchResult> {
  if (!geocodingEnabled()) return { status: 'disabled' };

  const run = async (): Promise<NominatimSearchResult> => {
    // Space requests: wait out the remainder of the delay window since the last
    // request START, application-wide.
    const elapsed = Date.now() - lastRequestAt;
    if (elapsed < REQUEST_DELAY_MS) {
      await sleep(REQUEST_DELAY_MS - elapsed);
    }
    lastRequestAt = Date.now();

    const search = new URLSearchParams({
      ...params,
      format: 'json',
      addressdetails: '1',
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const resp = await fetch(`${NOMINATIM_BASE}?${search}`, {
        headers: { 'User-Agent': USER_AGENT },
        signal: controller.signal,
      });
      if (!resp.ok) {
        // Recoverable (4xx/5xx/429) — caller keeps the row pending and retries.
        console.warn(`[GEO] Nominatim HTTP ${resp.status}`);
        return { status: 'error' };
      }
      const data = (await resp.json()) as RawNominatimResult[];
      // BUG-79: preserve the pre-filter signal before the settlement-type/
      // parse filter below discards it. Compared against the LIMIT WE
      // REQUESTED, not an assumed cap on Nominatim's side (its actual max is
      // unverified and irrelevant here) — if the raw response is at least as
      // large as what we asked for, there may be more matches beyond it.
      const requestedLimit = Number(params.limit);
      const truncated = Number.isFinite(requestedLimit) && data.length >= requestedLimit;
      const candidates = data
        .map(parseCandidate)
        .filter(
          (c): c is NominatimCandidate =>
            c !== null && (c.type == null || SETTLEMENT_TYPES.has(c.type)),
        );
      return { status: 'ok', candidates, truncated };
    } finally {
      clearTimeout(timer);
    }
  };

  // Append to the serialized chain; swallow errors so one failure never breaks
  // the chain for the next caller.
  const result = chain.then(run, run);
  chain = result.catch(() => undefined);
  try {
    return await result;
  } catch (err) {
    console.warn('[GEO] Nominatim request failed:', (err as Error).message);
    return { status: 'error' };
  }
}

function parseCandidate(raw: RawNominatimResult): NominatimCandidate | null {
  const lat = parseFloat(raw.lat);
  const lon = parseFloat(raw.lon);
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
  const displayName = raw.display_name ?? raw.name ?? '';
  const name = raw.name ?? displayName.split(',')[0]?.trim() ?? '';
  return {
    displayName,
    name,
    latitude: lat,
    longitude: lon,
    countryCode: raw.address?.country_code?.toUpperCase() ?? null,
    regionIso: raw.address?.['ISO3166-2-lvl4'] ?? null,
    class: raw.class,
    type: raw.type,
  };
}

/** Test-only: reset the serialized queue's timing state between suites. */
export function __resetChokepointForTests(): void {
  chain = Promise.resolve();
  lastRequestAt = 0;
}
