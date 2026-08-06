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
 *
 * BUG-75 v3 (2026-08-06) — city-identity carry channel additions:
 *   - resolveByOsmId (§B1/F1): canonicalize a carried OSM ref by ID via
 *     Nominatim /lookup, through the SAME chokepoint as nominatimSearch.
 *   - resolveCity's carried-ref branch (§B1(4)): a pending row that already
 *     carries an osm_type/osm_id is resolved deterministically via /lookup,
 *     not the constrained name search — the carried ref IS the query.
 *   - M-A (delta review, v2 §7 rule 2c restored): EVERY resolve — carried or
 *     name-search — stamps the winning candidate's osm_type/osm_id/
 *     display_name, not only carried-pick resolves. Otherwise a freshly
 *     resolved non-carried row is invisible to the resolved-by-OSM unique
 *     index and two users resolving the same non-ambiguous city land as
 *     duplicate NULL-osm_id rows (the exact BUG-33 class this feature closes).
 *   - M-B (delta review): a carried ref whose /lookup returns zero rows
 *     (stale/deleted/reclassified OSM object) is a THIRD case, distinct from
 *     disabled/error — on the pending-retry path (this file) it is terminal
 *     'unresolvable' (a deleted object will not come back as a settlement);
 *     the create path (cities.ts) treats the same signal as 'pending'
 *     instead, so a transient classification blip self-heals on retry.
 *   - M1/F3 (twin-merge): committing a resolve can collide with an
 *     already-resolved twin under the resolved-by-OSM unique index. The
 *     caught-violation branch repoints trip_places from the loser onto the
 *     surviving winner and removes the loser — converge to ONE row, never a
 *     500. (NOT wrapped in db.transaction(): a live probe against this
 *     project's libSQL :memory: test client showed db.transaction() nulls
 *     out the client's connection, breaking every subsequent query on it —
 *     see repositories/trips.ts's same finding. A single INSERT/UPDATE is
 *     already atomic w.r.t. the unique index in SQLite, so the catch +
 *     re-select-and-reuse/merge pattern is correct without an explicit
 *     transaction wrapper.)
 */

import { and, asc, eq, lt, sql } from 'drizzle-orm';
import { cities, getDb, regions, tripPlaces } from '../db/index.js';
import { isUniqueViolation } from './db-errors.js';
import {
  type NominatimCandidate,
  type NominatimSearchResult,
  nominatimLookup,
  nominatimSearch,
} from './nominatim-client.js';

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
 * BUG-75 v3 §B1 (F1) — maps node/way/relation to Nominatim's type-prefixed
 * `/lookup?osm_ids=` id form and runs it through the shared chokepoint.
 * Returns the full NominatimSearchResult (not collapsed) so callers can apply
 * ADL-46 D10's disabled/error/terminal classification — see resolveByOsmId
 * for the simpler candidate-or-null contract most callers want instead.
 */
async function lookupByOsmId(
  osmType: 'node' | 'way' | 'relation',
  osmId: number,
): Promise<NominatimSearchResult> {
  const prefix = osmType === 'node' ? 'N' : osmType === 'way' ? 'W' : 'R';
  return nominatimLookup([`${prefix}${osmId}`]);
}

/**
 * BUG-75 v3 §B1.2 (F1) — canonicalize a carried OSM ref by ID. The carried
 * ref IS the query — /lookup returns that exact object or nothing, so this
 * can never re-derive an ambiguous verdict for an already-chosen place.
 *
 * Returns candidate-or-null: null covers disabled/error/zero-rows alike,
 * which is the right granularity for the CREATE path (cities.ts) — offline
 * and a stale/reclassified carried id both degrade to the same 'pending'
 * outcome there (M-B). resolveCity below needs the finer distinction (a
 * disabled/error result must NOT be treated as the M-B terminal case), so it
 * calls lookupByOsmId directly instead of this wrapper.
 */
export async function resolveByOsmId(
  osmType: 'node' | 'way' | 'relation',
  osmId: number,
): Promise<NominatimCandidate | null> {
  if (!geocodingEnabled()) return null;
  const result = await lookupByOsmId(osmType, osmId);
  if (result.status !== 'ok') return null;
  return result.candidates[0] ?? null;
}

/**
 * BUG-75 v3 §B3/M1/F3 — commits a resolve (stamping the candidate's OSM ref
 * on EVERY resolve, M-A / v2 §7 rule 2c) with the caught-unique-violation →
 * merge fallback. This is the one place a resolve can collide with an
 * already-resolved twin under the resolved-by-OSM partial unique index
 * (`uniq_cities_osm_ref`) — the merge branch repoints trip_places from the
 * loser onto the surviving winner and removes the loser, so two users
 * resolving the same real place always converge to ONE row.
 */
async function commitResolvedOrMerge(
  cityId: number,
  candidate: NominatimCandidate,
): Promise<boolean> {
  const db = getDb();
  const resolvedAt = new Date().toISOString();
  try {
    await db
      .update(cities)
      .set({
        latitude: candidate.latitude,
        longitude: candidate.longitude,
        osmType: candidate.osmType ?? null,
        osmId: candidate.osmId ?? null,
        displayName: candidate.displayName ?? null,
        geocodeStatus: 'resolved',
        geocodeAttemptedAt: resolvedAt,
        updatedAt: resolvedAt,
      })
      .where(eq(cities.id, cityId));
    console.info(
      `[GEO] Resolved city ${cityId} (${candidate.name}): ${candidate.latitude}, ${candidate.longitude}`,
    );
    return true;
  } catch (err) {
    if (!isUniqueViolation(err) || candidate.osmType == null || candidate.osmId == null) {
      throw err;
    }
    return mergeIntoWinner(cityId, candidate.osmType, candidate.osmId);
  }
}

/**
 * BUG-75 v3 §B3/M1 — repoints trip_places from the loser city onto the
 * surviving winner (the row already holding this (osm_type, osm_id)) and
 * removes the loser. Degrades safely (leaves both rows in place, logs a
 * warning) if the repoint/delete itself cannot complete — e.g. a trip that
 * already has a trip_place for the winner city would collide with
 * uniq_trip_places_trip_city on repoint; never throws out of here.
 */
async function mergeIntoWinner(loserId: number, osmType: string, osmId: number): Promise<boolean> {
  const db = getDb();
  const winnerRows = await db
    .select({ id: cities.id })
    .from(cities)
    .where(and(eq(cities.osmType, osmType), eq(cities.osmId, osmId)))
    .limit(1);
  const winner = winnerRows[0];
  if (!winner) {
    // Should be unreachable — we only get here after catching a violation on
    // this exact ref — but defensive: never let a merge crash the caller.
    console.warn(
      `[GEO] Merge target vanished for osm ref ${osmType}:${osmId} (loser city ${loserId})`,
    );
    return false;
  }
  try {
    await db.update(tripPlaces).set({ cityId: winner.id }).where(eq(tripPlaces.cityId, loserId));
    await db.delete(cities).where(eq(cities.id, loserId));
  } catch (err) {
    console.warn(
      `[GEO] Merge repoint/delete incomplete for loser city ${loserId} -> winner ${winner.id}:`,
      (err as Error).message,
    );
  }
  return true;
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
      osmType: cities.osmType,
      osmId: cities.osmId,
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

  // BUG-75 v3 §B1(4)/F1 — a row carrying an osm ref is canonicalized
  // deterministically by /lookup, NOT the constrained name search: the
  // carried ref IS the query, so it can never re-derive an ambiguous verdict.
  if (city.osmType != null && city.osmId != null) {
    const osmType = city.osmType as 'node' | 'way' | 'relation';
    const result = await lookupByOsmId(osmType, city.osmId);

    if (result.status === 'disabled') {
      // Global — no increment.
      return false;
    }
    if (result.status === 'error') {
      // Recoverable — increment, stay pending, retry later (up to cap).
      await incrementAttempts(cityId);
      return false;
    }

    const candidate = result.candidates[0];
    if (!candidate) {
      // M-B (delta review): the carried object no longer resolves to a
      // settlement — deleted, or reclassified to a non-settlement type
      // (HTTP 200, zero/filtered rows). Distinct from disabled/error above.
      // TERMINAL: a deleted/reclassified OSM object will not come back as a
      // settlement — degrade safely (never a wrong-town pin), never retried
      // again, rather than looping pending forever.
      const now = new Date().toISOString();
      await db
        .update(cities)
        .set({ geocodeStatus: 'unresolvable', geocodeAttemptedAt: now, updatedAt: now })
        .where(eq(cities.id, cityId));
      console.info(
        `[GEO] City ${cityId} (${city.name}) unresolvable — carried osm ref no longer resolves to a settlement`,
      );
      return false;
    }

    return commitResolvedOrMerge(cityId, candidate);
  }

  // Non-carried — the existing name-search path. M-A (delta review, v2 §7
  // rule 2c): now ALSO stamps the winning candidate's osm ref on every
  // resolve, not only carried-pick resolves (via commitResolvedOrMerge
  // below) — otherwise a freshly-resolved row is invisible to the
  // resolved-by-OSM merge mechanism and two users resolving the same
  // non-ambiguous city land as duplicate NULL-osm_id rows.
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
  return commitResolvedOrMerge(cityId, verdict.best);
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
