/**
 * Travel Tracker — Geocoding Service (Nominatim)
 *
 * Resolves city coordinates via Nominatim. ADL-10: strict usage-policy
 * compliance (1 req/s, identifying User-Agent, results stored permanently).
 *
 * ADL-46 (§5.1.1 / D7): ALL Nominatim egress now goes through the single
 * serialized chokepoint in nominatim-client.ts — this service no longer opens
 * its own fetch or runs an isOnline() HEAD probe (the probe doubled the request
 * rate; a failed search is caught and classified instead).
 *
 * ADL-46 (§4.4.1 / D10): failures are CLASSIFIED, not merely counted.
 *   - Terminal ("the geocoder answered: no match") → geocode_status = 'unresolvable',
 *     never retried, drops out of the pending partial index.
 *   - Recoverable (network/timeout/5xx/429) → stays 'pending', geocode_attempts++,
 *     retried until a cap.
 *   - Global (GEOCODING_ENABLED=false) → does NOT increment — one offline weekend
 *     must not burn every pending city's retry budget.
 *
 * All Nominatim errors are caught and logged — never propagated to API callers.
 * GE-12: offline-safe — city creation never depends on the geocoder.
 */

import { and, asc, eq, lt, sql } from 'drizzle-orm';
import { cities, getDb, regions } from '../db/index.js';
import { type NominatimCandidate, nominatimSearch } from './nominatim-client.js';

/** When GEOCODING_ENABLED=false, all geocoding is skipped (e.g. CI contract tests). */
const geocodingEnabled = (): boolean => process.env.GEOCODING_ENABLED !== 'false';

/**
 * ADL-46 D10: recoverable failures retry until this cap, then the row stays
 * 'pending' but is no longer re-selected by processQueue. Terminal ('no match')
 * rows never reach the cap — they become 'unresolvable' on the first answer.
 * Tunable; 5 chosen as a small safety net for the recoverable class.
 */
const GEOCODE_ATTEMPT_CAP = 5;

/** Result of a name→candidates resolution (resolve-then-create and the proxy). */
export interface CityResolution {
  /**
   * - 'ok'         — a single best candidate was determined (see `best`).
   * - 'ambiguous'  — two or more comparable settlement candidates survived the
   *                  country/region constraint; the caller must NOT guess (D14).
   * - 'unresolved' — the geocoder answered with no usable candidate.
   * - 'disabled'   — GEOCODING_ENABLED=false or a recoverable error; degrade to pending.
   */
  status: 'ok' | 'ambiguous' | 'unresolved' | 'disabled';
  candidates: NominatimCandidate[];
  best?: NominatimCandidate;
}

/**
 * Resolves a city NAME to geocoder candidates WITHOUT requiring a cities row.
 * Used by resolve-then-create (POST /api/cities) and the geocode proxy route.
 *
 * ADL-46 D12 (§4.3.1): the caller has already validated country_code (and often
 * region), so the lookup is CONSTRAINED by them and the lookup may never
 * override them:
 *   1. countrycodes filter from the validated country_code — removes the
 *      London-UK-vs-Ontario / Cambridge-UK-vs-MA classes entirely.
 *   2. where a region ISO is known, prefer the candidate whose subdivision matches.
 *   3. exactly one settlement candidate → 'ok'; two or more → 'ambiguous' (never
 *      guess — D14); zero → 'unresolved'.
 *
 * @param name       - The user-submitted city name.
 * @param countryCode- Validated ISO 3166-1 alpha-2 (e.g. 'US').
 * @param opts.regionIso - ISO 3166-2 subdivision (e.g. 'US-CO') to disambiguate.
 */
export async function resolveCityName(
  name: string,
  countryCode: string,
  opts: { regionIso?: string | null } = {},
): Promise<CityResolution> {
  if (!geocodingEnabled()) return { status: 'disabled', candidates: [] };

  const result = await nominatimSearch({
    q: name,
    countrycodes: countryCode.toLowerCase(),
    limit: '10',
  });

  if (result.status === 'disabled' || result.status === 'error') {
    // Global / recoverable — degrade to pending; the queue will retry the row.
    return { status: 'disabled', candidates: [] };
  }

  const candidates = result.candidates;
  if (!candidates.length) return { status: 'unresolved', candidates: [] };

  // D12 step 2: if the user gave a region, prefer the candidate whose ISO matches.
  if (opts.regionIso) {
    const regionMatches = candidates.filter(
      (c) => c.regionIso?.toUpperCase() === opts.regionIso!.toUpperCase(),
    );
    if (regionMatches.length === 1) {
      return { status: 'ok', best: regionMatches[0], candidates };
    }
    if (regionMatches.length > 1) {
      return { status: 'ambiguous', candidates: regionMatches };
    }
    // No region match — fall through to the general count.
  }

  if (candidates.length === 1) {
    return { status: 'ok', best: candidates[0], candidates };
  }
  // D14: two or more comparable candidates → ambiguous, do not guess.
  return { status: 'ambiguous', candidates };
}

/**
 * Attempts to resolve coordinates for a single EXISTING city row via Nominatim
 * (the geocode queue / on-create trigger path). Applies D10's classification.
 *
 * @param cityId - The cities.id to resolve.
 * @returns true if coordinates were resolved and saved, false otherwise.
 */
export async function resolveCity(cityId: number): Promise<boolean> {
  const db = getDb();

  const rows = await db
    .select({
      id: cities.id,
      name: cities.name,
      geocodeStatus: cities.geocodeStatus,
      countryCode: cities.countryCode,
      regionIso: regions.iso3166_2,
    })
    .from(cities)
    .leftJoin(regions, eq(regions.id, cities.regionId))
    .where(eq(cities.id, cityId))
    .limit(1);

  const city = rows[0];
  if (!city) {
    console.warn(`[GEO] City ${cityId} not found`);
    return false;
  }

  // Never re-query a resolved city (ADL-10). Unresolvable rows are terminal.
  if (city.geocodeStatus === 'resolved') return true;
  if (city.geocodeStatus === 'unresolvable') return false;

  // GEOCODING_ENABLED=false is a GLOBAL condition — do NOT increment attempts.
  if (!geocodingEnabled()) return false;

  const attemptedAt = new Date().toISOString();
  await db
    .update(cities)
    .set({ geocodeAttemptedAt: attemptedAt, updatedAt: attemptedAt })
    .where(eq(cities.id, cityId));

  const result = await nominatimSearch({
    q: city.name,
    countrycodes: city.countryCode.toLowerCase(),
    limit: '10',
  });

  if (result.status === 'disabled') {
    // Global — no increment (offline / disabled between the check above and here).
    return false;
  }

  if (result.status === 'error') {
    // Recoverable — increment the counter, stay pending, retry later (up to cap).
    await incrementAttempts(cityId);
    return false;
  }

  // result.status === 'ok' — the geocoder answered.
  const best = pickBest(result.candidates, city.regionIso);
  if (!best) {
    // TERMINAL: the geocoder answered with no usable match. Never retried (D10).
    const now = new Date().toISOString();
    await db
      .update(cities)
      .set({ geocodeStatus: 'unresolvable', geocodeAttemptedAt: now, updatedAt: now })
      .where(eq(cities.id, cityId));
    console.info(`[GEO] City ${cityId} (${city.name}) unresolvable — no match`);
    return false;
  }

  const resolvedAt = new Date().toISOString();
  await db
    .update(cities)
    .set({
      latitude: best.latitude,
      longitude: best.longitude,
      geocodeStatus: 'resolved',
      geocodeAttemptedAt: resolvedAt,
      updatedAt: resolvedAt,
    })
    .where(eq(cities.id, cityId));

  console.info(`[GEO] Resolved city ${cityId} (${city.name}): ${best.latitude}, ${best.longitude}`);
  return true;
}

/** Picks the region-matching candidate if a region ISO is known, else the first. */
function pickBest(
  candidates: NominatimCandidate[],
  regionIso: string | null,
): NominatimCandidate | undefined {
  if (!candidates.length) return undefined;
  if (regionIso) {
    const match = candidates.find((c) => c.regionIso?.toUpperCase() === regionIso.toUpperCase());
    if (match) return match;
  }
  return candidates[0];
}

/** ADL-46 D10: increment the recoverable-failure counter for a pending row. */
async function incrementAttempts(cityId: number): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();
  await db
    .update(cities)
    .set({
      geocodeAttempts: sql`${cities.geocodeAttempts} + 1`,
      geocodeAttemptedAt: now,
      updatedAt: now,
    })
    .where(eq(cities.id, cityId));
}

/**
 * Processes cities with geocode_status = 'pending' AND geocode_attempts < CAP.
 * Called on startup and every 15 minutes. Rate limiting is owned by the
 * chokepoint (nominatim-client), so this loop no longer sleeps itself.
 *
 * ADL-46 D10: the predicate excludes 'unresolvable' rows (terminal) and rows
 * that have exhausted their recoverable-retry budget — the partial index
 * idx_cities_geocode already drops 'unresolvable' rows, keeping the scan tight.
 */
export async function processQueue(): Promise<void> {
  const db = getDb();

  if (!geocodingEnabled()) {
    console.info('[GEO] Geocoding disabled (GEOCODING_ENABLED=false) — queue skipped');
    return;
  }

  const pending = await db
    .select({ id: cities.id, name: cities.name })
    .from(cities)
    .where(
      and(eq(cities.geocodeStatus, 'pending'), lt(cities.geocodeAttempts, GEOCODE_ATTEMPT_CAP)),
    )
    .orderBy(asc(cities.geocodeAttemptedAt));

  if (!pending.length) {
    console.info('[GEO] Geocoding queue empty — nothing to process');
    return;
  }

  console.info(`[GEO] Processing ${pending.length} pending cities`);

  for (const city of pending) {
    // Each call serializes through the chokepoint, which owns the 1.1s spacing
    // and lets interactive proxy lookups interleave rather than starve.
    await resolveCity(city.id);
  }

  console.info('[GEO] Geocoding queue processing complete');
}
