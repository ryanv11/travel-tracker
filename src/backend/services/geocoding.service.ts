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
   * - 'ambiguous'  — the eligible candidates disagree about `region_iso`, or a
   *                  region the user selected could not be confirmed; the
   *                  caller must NOT guess (D14). See `reason`.
   * - 'unresolved' — the geocoder answered with no usable candidate.
   * - 'disabled'   — GEOCODING_ENABLED=false or a recoverable error; degrade to pending.
   */
  status: 'ok' | 'ambiguous' | 'unresolved' | 'disabled';
  candidates: NominatimCandidate[];
  best?: NominatimCandidate;
  /**
   * Why an 'ambiguous' verdict was reached. Not persisted anywhere — exists so
   * logging (and a future frontend contract) can tell the two ambiguity
   * classes apart without a breaking change later. ADL-46 F1/F2 ruling §2.2/§2.3.
   */
  reason?: 'multi-region' | 'region-unconfirmed';
}

/**
 * Countries a candidate is permitted to come from — upper-cased ISO 3166-1
 * alpha-2. An EMPTY set means UNCONSTRAINED. Today every caller passes a set
 * of one; a future trip-declared-countries lookup would pass many.
 * ADL-46 F1/F2 ruling §2.2.
 */
export type PermittedCountries = ReadonlySet<string>;

/** Verdict returned by {@link classifyCandidates}. ADL-46 F1/F2 ruling §2.2. */
export type CandidateVerdict =
  | { status: 'ok'; best: NominatimCandidate; eligible: NominatimCandidate[] }
  | {
      status: 'ambiguous';
      /** Why we are not choosing. Not persisted; drives logging and the follow-on. */
      reason: 'multi-region' | 'region-unconfirmed';
      regionIsos: string[];
      eligible: NominatimCandidate[];
    }
  | { status: 'unresolved'; eligible: [] };

/** Distinct, upper-cased, non-null `regionIso` values across the given candidates. */
function distinctRegionIsos(candidates: NominatimCandidate[]): string[] {
  return [
    ...new Set(
      candidates
        .filter((c): c is NominatimCandidate & { regionIso: string } => c.regionIso != null)
        .map((c) => c.regionIso.toUpperCase()),
    ),
  ];
}

/**
 * ADL-46 F1/F2 ruling (2026-08-01), §2.1-§2.2 — THE single shared classifier.
 * Both decision sites (`resolveCityName`'s create path and `resolveCity`'s
 * queue/on-create-trigger path) call this and only this; there is exactly one
 * answer to "is this ambiguous?" in the codebase.
 *
 * "Ambiguous" means more than one DISTINCT non-null `region_iso` among the
 * eligible candidates — NOT candidate count. Nominatim routinely returns one
 * real city at several administrative granularities (`city` + `municipality`,
 * both surviving the settlement-type filter) sharing one `region_iso`;
 * counting hits would mark nearly every city ambiguous, which is strictly
 * worse than the bug this fixes (geocoding.service.ts:99-101, pre-fix).
 *
 * Algorithm — implemented in this order, per the ruling:
 *   1. Country eligibility: `permitted.size === 0` → unconstrained (all
 *      candidates eligible). Otherwise a candidate survives only if its
 *      `countryCode` is non-null AND in `permitted` — a candidate we cannot
 *      attribute to a country cannot confirm the user's country selection.
 *   2. Zero eligible → terminal 'unresolved'.
 *   3. A region was requested: any eligible candidate matching it → 'ok'
 *      (count is irrelevant — every match agrees with what the user chose);
 *      zero matches → 'ambiguous'/'region-unconfirmed' (R3: never resolve to
 *      a candidate outside the region the user explicitly selected).
 *   4. No region requested: >1 distinct eligible `region_iso` → 'ambiguous'/
 *      'multi-region'; otherwise → 'ok' (this covers both "one shared region"
 *      and the accepted "no candidate carries a region" guess limit).
 *
 * @param candidates          - Raw settlement candidates from Nominatim.
 * @param permitted           - Country codes the result must come from (empty = any).
 * @param requestedRegionIso  - The region the user explicitly selected, if any.
 */
export function classifyCandidates(
  candidates: NominatimCandidate[],
  permitted: PermittedCountries,
  requestedRegionIso: string | null,
): CandidateVerdict {
  const eligible =
    permitted.size === 0
      ? candidates
      : candidates.filter(
          (c) => c.countryCode != null && permitted.has(c.countryCode.toUpperCase()),
        );

  if (eligible.length === 0) {
    return { status: 'unresolved', eligible: [] };
  }

  if (requestedRegionIso != null) {
    const upperRequested = requestedRegionIso.toUpperCase();
    const matches = eligible.filter((c) => c.regionIso?.toUpperCase() === upperRequested);
    if (matches.length >= 1) {
      return { status: 'ok', best: matches[0], eligible };
    }
    return {
      status: 'ambiguous',
      reason: 'region-unconfirmed',
      regionIsos: distinctRegionIsos(eligible),
      eligible,
    };
  }

  const regionIsos = distinctRegionIsos(eligible);
  if (regionIsos.length > 1) {
    return { status: 'ambiguous', reason: 'multi-region', regionIsos, eligible };
  }
  return { status: 'ok', best: eligible[0], eligible };
}

/**
 * Resolves a city NAME to geocoder candidates WITHOUT requiring a cities row.
 * Used by resolve-then-create (POST /api/cities) and the geocode proxy route.
 *
 * ADL-46 D12 (§4.3.1): the caller has already validated country_code (and often
 * region), so the lookup is CONSTRAINED by them and the lookup may never
 * override them. ADL-46 F1/F2 ruling §2.3: the decision itself is delegated
 * entirely to {@link classifyCandidates}.
 *
 * @param name       - The user-submitted city name.
 * @param countryCode- Validated ISO 3166-1 alpha-2 (e.g. 'US'). Stays singular —
 *                     it is the user's ground truth (D12 rule 3); the SET used
 *                     for the eligibility check defaults to `{countryCode}`
 *                     unless the caller passes `permittedCountryCodes`.
 * @param opts.regionIso - ISO 3166-2 subdivision (e.g. 'US-CO') to disambiguate.
 * @param opts.permittedCountryCodes - Eligibility set for classifyCandidates;
 *   defaults to a set of one (`countryCode`). A future trip-declared-countries
 *   lookup passes a larger set here without changing anything else.
 */
export async function resolveCityName(
  name: string,
  countryCode: string,
  opts: { regionIso?: string | null; permittedCountryCodes?: PermittedCountries } = {},
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

  const permitted = opts.permittedCountryCodes ?? new Set([countryCode.toUpperCase()]);
  const verdict = classifyCandidates(result.candidates, permitted, opts.regionIso ?? null);

  if (verdict.status === 'unresolved') {
    return { status: 'unresolved', candidates: [] };
  }
  if (verdict.status === 'ambiguous') {
    return { status: 'ambiguous', candidates: verdict.eligible, reason: verdict.reason };
  }
  return { status: 'ok', best: verdict.best, candidates: verdict.eligible };
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

  // result.status === 'ok' — the geocoder answered. ADL-46 F1/F2 ruling §2.4:
  // this is F1 — the single shared classifier replaces the old `pickBest`,
  // which decided "is this ambiguous?" differently than resolveCityName did.
  const verdict = classifyCandidates(
    result.candidates,
    new Set([city.countryCode.toUpperCase()]),
    city.regionIso,
  );

  if (verdict.status === 'unresolved') {
    // TERMINAL: the geocoder answered with no usable match. Never retried (D10).
    const now = new Date().toISOString();
    await db
      .update(cities)
      .set({ geocodeStatus: 'unresolvable', geocodeAttemptedAt: now, updatedAt: now })
      .where(eq(cities.id, cityId));
    console.info(`[GEO] City ${cityId} (${city.name}) unresolvable — no match`);
    return false;
  }

  if (verdict.status === 'ambiguous') {
    // ADL-46 F1/F2 ruling §2.4/§2.5 (R2/R3/R4): the geocoder DID answer, but
    // could not confirm a single region — this is not a "no match" (D10's
    // 'unresolvable' does not apply) and it must not guess (D14). Consume the
    // existing geocode_attempts budget (a bounded question, re-askable if the
    // row's region_id later changes — R1 §3.3) and leave the row 'pending'.
    await incrementAttempts(cityId);
    console.info(
      `[GEO] City ${cityId} (${city.name}) ambiguous (${verdict.reason}): regions=${verdict.regionIsos.join(',')}`,
    );
    return false;
  }

  // verdict.status === 'ok'
  const best = verdict.best;
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
