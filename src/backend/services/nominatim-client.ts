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
 *
 * BUG-75 v3 §B1/§D (2026-08-06): a second endpoint, `nominatimLookup` (Nominatim
 * `/lookup?osm_ids=`, canonicalize-by-id — F1), was added alongside `nominatimSearch`.
 * Both funnel through the SAME extracted `enqueue()` chokepoint function below —
 * one physical code path owns `chain`/`lastRequestAt`, so a second endpoint could
 * not silently become a second, uncoordinated egress site (the risk the delta
 * review's §D flagged as the one thing a careless build must not get wrong).
 */

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';
/**
 * BUG-75 v3 §B1(1) — the /lookup endpoint, canonicalize-by-id. A DIFFERENT
 * path from the search chokepoint above, but routed through the exact same
 * serialized `enqueue()` below — see the m-2 hardening note there.
 */
const NOMINATIM_LOOKUP_BASE = 'https://nominatim.openstreetmap.org/lookup';
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
  /** Nominatim class/type — carried metadata only; NOT the admission gate (BUG-76). */
  class?: string;
  type?: string;
  /**
   * BUG-76 — Nominatim's `addresstype` field (present under `format=json&
   * addressdetails=1`, the request shape this module always sends). THE
   * admission-gate discriminator (see `isAcceptedSettlement` below):
   * `type`/`class` cannot distinguish a city modelled as an OSM admin-boundary
   * relation (`type=administrative`) from a county or state (also
   * `type=administrative`), but `addresstype` can (`city` vs `county` vs
   * `state`). `undefined` when the caller's fixture predates this field.
   */
  addressType?: string;
  /**
   * BUG-75 v3 (§0/§2.3) — the carried identity pair. Optional (not `null`
   * defaulted to a required field) because some existing fixtures/callers in
   * this codebase predate BUG-75 and never populate it; a real Nominatim
   * response always includes both. `null` means the raw response omitted
   * the field; `undefined` means the caller's fixture never set it.
   */
  osmType?: 'node' | 'way' | 'relation' | null;
  osmId?: number | null;
  /**
   * BUG-75 v3 (M2 discriminator, §B1) — address.county, falling back to
   * address.state_district. Render/disambiguation aid only, NEVER a match
   * key (display_name/county are payload, not identity — v3 §0).
   */
  county?: string | null;
  /**
   * BUG-77 — address.state, the human-readable state/province NAME (e.g.
   * "Colorado"), distinct from `regionIso` (the ISO 3166-2 CODE, e.g.
   * "US-CO"). Render payload for the frontend picker only, never a match
   * key. `null` when the raw response omitted it.
   */
  stateName?: string | null;
  /**
   * BUG-77 — address.country, the human-readable country NAME (e.g. "United
   * States"), distinct from `countryCode` (the ISO 3166-1 alpha-2 code, e.g.
   * "US"). Render payload for the frontend picker only, never a match key.
   * `null` when the raw response omitted it.
   */
  countryName?: string | null;
}

interface RawNominatimResult {
  lat: string;
  lon: string;
  display_name?: string;
  name?: string;
  class?: string;
  type?: string;
  /** BUG-76 — the admission-gate discriminator; see NominatimCandidate.addressType. */
  addresstype?: string;
  /** BUG-75 v3 §B1/§2.1 — the carried identity pair, straight off Nominatim. */
  osm_type?: string;
  osm_id?: number;
  address?: {
    country_code?: string;
    'ISO3166-2-lvl4'?: string;
    /** BUG-75 v3 (M2 discriminator). */
    county?: string;
    /** BUG-75 v3 (M2 discriminator, fallback when county is absent). */
    state_district?: string;
    /** BUG-77 — human-readable state/province name (e.g. "Colorado"). */
    state?: string;
    /** BUG-77 — human-readable country name (e.g. "United States"). */
    country?: string;
  };
}

/**
 * BUG-76 (ADL-51 §3.1/§9.3) — the settlement discriminator, keyed on
 * Nominatim's `addresstype` field, NOT `type`/`class`. `type=administrative`
 * is shared by cities, counties, and states alike (both Denver CO and Cook
 * County are `type=administrative`, `place_rank=12` — AC-6 pins this),  so it
 * cannot discriminate; `addresstype` can (`city` vs `county` vs `state`).
 *
 * `census`/`statistical` (US Census/statistical artifacts) and `suburb`
 * (sub-municipal) are deliberately excluded — reversible/tunable per design
 * doc §9.4/§9.5, not a deep invariant. Do not blanket-add them back without
 * re-reading §9.5 (a naive add reintroduces an un-dedupable duplicate for
 * every place with both a statistical row and a settlement twin).
 */
const SETTLEMENT_ADDRESSTYPES = new Set(['city', 'town', 'village', 'hamlet', 'municipality']);

/**
 * BUG-76 (ADL-51 §3.4/§9.8) — THE single admission-gate predicate, shared by
 * both nominatimSearch (:230-ish) and nominatimLookup (:267-ish) so the two
 * call sites cannot drift apart again. Admits when the discriminator is
 * absent (legacy fixtures; a deliberately-picked /lookup id — §3.1) or is a
 * recognized settlement addresstype.
 */
function isAcceptedSettlement(candidate: NominatimCandidate): boolean {
  return candidate.addressType == null || SETTLEMENT_ADDRESSTYPES.has(candidate.addressType);
}

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
 * BUG-75 v3 §D / delta review m-2 — THE serialized chokepoint, physically
 * extracted (it used to live inline inside nominatimSearch, pre-BUG-75) so
 * every Nominatim call site — search AND lookup — enqueues its `run` closure
 * onto this ONE module-level `chain`/`lastRequestAt` pair. This is what makes
 * "same chokepoint, not a parallel fetch" a property of the code rather than
 * a convention a future caller could get wrong (the #1 risk the v3 delta
 * review's §D flagged for a careless build). Owns ONLY the delay-wait +
 * chain-append serialization; the fetch/parse/error-shaping is the caller's.
 */
function enqueue<T>(run: () => Promise<T>): Promise<T> {
  const timedRun = async (): Promise<T> => {
    // Space requests: wait out the remainder of the delay window since the last
    // request START, application-wide.
    const elapsed = Date.now() - lastRequestAt;
    if (elapsed < REQUEST_DELAY_MS) {
      await sleep(REQUEST_DELAY_MS - elapsed);
    }
    lastRequestAt = Date.now();
    return run();
  };

  // Append to the serialized chain; swallow errors so one failure never breaks
  // the chain for the next caller.
  const result = chain.then(timedRun, timedRun);
  chain = result.catch(() => undefined);
  return result;
}

/** Fetches one Nominatim URL with the shared timeout/User-Agent/abort handling.
 * Throws on a non-2xx response or a network/timeout failure — callers (both
 * nominatimSearch and nominatimLookup) catch this and translate it into their
 * own {status:'error'} result, matching this module's pre-BUG-75 behaviour. */
async function fetchNominatim(url: string): Promise<RawNominatimResult[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
    if (!resp.ok) {
      // Recoverable (4xx/5xx/429) — caller keeps the row pending and retries.
      console.warn(`[GEO] Nominatim HTTP ${resp.status}`);
      throw new Error(`Nominatim HTTP ${resp.status}`);
    }
    return (await resp.json()) as RawNominatimResult[];
  } finally {
    clearTimeout(timer);
  }
}

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

  const search = new URLSearchParams({ ...params, format: 'json', addressdetails: '1' });
  const url = `${NOMINATIM_BASE}?${search}`;

  try {
    const data = await enqueue(() => fetchNominatim(url));
    // BUG-79: preserve the pre-filter signal before the settlement-type/
    // parse filter below discards it. Compared against the LIMIT WE
    // REQUESTED, not an assumed cap on Nominatim's side (its actual max is
    // unverified and irrelevant here) — if the raw response is at least as
    // large as what we asked for, there may be more matches beyond it.
    const requestedLimit = Number(params.limit);
    const truncated = Number.isFinite(requestedLimit) && data.length >= requestedLimit;
    const candidates = data
      .map(parseCandidate)
      .filter((c): c is NominatimCandidate => c !== null && isAcceptedSettlement(c));
    return { status: 'ok', candidates, truncated };
  } catch (err) {
    console.warn('[GEO] Nominatim request failed:', (err as Error).message);
    return { status: 'error' };
  }
}

/**
 * BUG-75 v3 §B1 (F1) — canonicalize-by-id via Nominatim's `/lookup` endpoint,
 * through the SAME serialized chokepoint as nominatimSearch. Unlike a name
 * search, `/lookup` is queried BY the exact object(s) requested — it cannot
 * exclude the pick the way a constrained top-N name search can (the gap F1
 * closes; v3 §B1's live probe). No `truncated` concept: the response can
 * never exceed the ids requested.
 *
 * @param osmIds - Type-prefixed ids, e.g. `['N26700978', 'W123']`
 *                 (node→N, way→W, relation→R). Never throws.
 */
export async function nominatimLookup(osmIds: string[]): Promise<NominatimSearchResult> {
  if (!geocodingEnabled()) return { status: 'disabled' };
  if (osmIds.length === 0) return { status: 'ok', candidates: [] };

  const search = new URLSearchParams({
    osm_ids: osmIds.join(','),
    format: 'json',
    addressdetails: '1',
  });
  const url = `${NOMINATIM_LOOKUP_BASE}?${search}`;

  try {
    const data = await enqueue(() => fetchNominatim(url));
    const candidates = data
      .map(parseCandidate)
      .filter((c): c is NominatimCandidate => c !== null && isAcceptedSettlement(c));
    return { status: 'ok', candidates };
  } catch (err) {
    console.warn('[GEO] Nominatim lookup failed:', (err as Error).message);
    return { status: 'error' };
  }
}

function parseCandidate(raw: RawNominatimResult): NominatimCandidate | null {
  const lat = parseFloat(raw.lat);
  const lon = parseFloat(raw.lon);
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
  const displayName = raw.display_name ?? raw.name ?? '';
  const name = raw.name ?? displayName.split(',')[0]?.trim() ?? '';
  const osmType =
    raw.osm_type === 'node' || raw.osm_type === 'way' || raw.osm_type === 'relation'
      ? raw.osm_type
      : null;
  const osmId = typeof raw.osm_id === 'number' ? raw.osm_id : null;
  return {
    displayName,
    name,
    latitude: lat,
    longitude: lon,
    countryCode: raw.address?.country_code?.toUpperCase() ?? null,
    regionIso: raw.address?.['ISO3166-2-lvl4'] ?? null,
    class: raw.class,
    type: raw.type,
    addressType: raw.addresstype,
    osmType,
    osmId,
    county: raw.address?.county ?? raw.address?.state_district ?? null,
    stateName: raw.address?.state ?? null,
    countryName: raw.address?.country ?? null,
  };
}

/** Test-only: reset the serialized queue's timing state between suites. */
export function __resetChokepointForTests(): void {
  chain = Promise.resolve();
  lastRequestAt = 0;
}
