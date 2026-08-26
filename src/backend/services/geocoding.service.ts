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

import { and, asc, eq, lt } from 'drizzle-orm';
import { cities, getDb, regions, tripPlaces } from '../db/index.js';
import { citiesRepository } from '../repositories/cities.js';
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
 * ADL-56 §6b(2) / N5(b) — THE region-derivation rule for the D4 backfill, in one
 * place so both write sites (the create-path insert in `routes/cities.ts` and
 * `commitResolvedOrMerge` below) cannot drift apart.
 *
 * Returns the single distinct `region_iso` across the ELIGIBLE candidate set, or
 * null when the set does not name exactly one (zero → nothing to backfill from;
 * two or more → a region-AMBIGUOUS resolve, which §6 says backfills nothing
 * because it is a D1/D2 picker case and guessing there is what D12 rule-3 exists
 * to forbid).
 *
 * WHY NOT `best.regionIso` — the trap this function exists to close. The natural
 * implementation reads the region off the winning candidate, and it is wrong:
 * `classifyCandidates` returns `best = eligible[0]`, and `eligible[0]` can carry
 * a NULL `regionIso` while the resolve is still region-unambiguous. The real
 * captured shape is `eligible = [{regionIso: null}, {regionIso: 'AU-VIC'}]` —
 * `distinctRegionIsos` is `['AU-VIC']` (length 1, so the verdict is 'ok'), yet
 * `best.regionIso` is null. Deriving from `best` silently skips the backfill and
 * reproduces BUG-98 for exactly the rows it was meant to fix, with nothing red
 * anywhere. Derive from the SET, never from the winner.
 */
export function singleDistinctRegionIso(eligible: NominatimCandidate[]): string | null {
  const isos = distinctRegionIsos(eligible);
  return isos.length === 1 ? isos[0] : null;
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
 *
 * ADL-56 D4 / §6b(1) — `regionBackfillId` is the PLACEMENT half of the region
 * backfill, and the placement is the whole point. It is applied ONLY inside the
 * try-block direct UPDATE, the branch that writes THIS row. The `catch` →
 * {@link mergeIntoWinner} branch repoints trip_places onto a PRE-EXISTING winner
 * and deletes this row — that winner is someone else's row and may hold a
 * user-SUPPLIED region, so backfilling there would overwrite a user value while
 * nominally "filling a blank", breaking D12 rule-3 on the one path where it is
 * least visible. Because the backfill rides the same single UPDATE statement as
 * the OSM stamp, a unique-violation rolls both back atomically and the merge
 * branch inherits nothing.
 *
 * Callers pass null (the default) whenever the row already carries a region, the
 * resolve is region-ambiguous, or the ISO has no seeded `regions` row — see
 * {@link deriveRegionBackfill}.
 */
async function commitResolvedOrMerge(
  cityId: number,
  candidate: NominatimCandidate,
  regionBackfillId: number | null = null,
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
        // GE-19 / ADL-55 §3.2: a resolved row carries no cause — clear any prior
        // 'unreachable' a recoverable attempt may have written before this one won.
        geocodeCause: null,
        // ADL-56 D4: spread, so a null backfill omits the column from the SET
        // entirely rather than writing NULL over whatever is there. Belt and
        // braces — the caller only ever produces a non-null id for a row whose
        // region_id is already NULL — but it makes "no backfill" mean "do not
        // touch the column" at the SQL layer too.
        ...(regionBackfillId != null ? { regionId: regionBackfillId } : {}),
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
 * ADL-56 D4 / §6 — decides whether a resolve backfills this row's blank region,
 * and to which seeded `regions.id`. Returns null for "do not touch the column",
 * which is the answer for every case except the narrow one D4 opens.
 *
 * The four gates, in the order they fail:
 *
 *  1. **A supplied region is never overwritten (D12 rule-3).** This is the
 *     boundary D4 REFINES rather than crosses. Rule-3 protects a value the user
 *     supplied — its motivating hazard is a geocoder overriding "Springfield,
 *     Missouri" with Illinois. NULL is the ABSENCE of a supplied value, so
 *     filling it is not an overwrite (PO-confirmed 2026-08-11, recorded in
 *     ADL-46 §4.3.1). Anything non-null is the user's ground truth and stops
 *     here.
 *  2. **Region-UNAMBIGUOUS resolves only** — see {@link singleDistinctRegionIso}
 *     for why this reads the eligible SET and not the winning candidate. A
 *     region-ambiguous resolve backfills nothing: it is a D1/D2 picker case, and
 *     guessing a region under ambiguity is precisely what rule-3 exists to
 *     forbid.
 *  3. **Region-tier countries only (§6).** A `region_id` on a country with
 *     `region_tier_enabled = 0` is a shape the POST route rejects outright, so
 *     the background resolver must not mint one either.
 *  4. **Best-effort, never blocking (GE-15 parity, §6).** An ISO with no seeded
 *     `regions` row — the BUG-30 incomplete-seed class — leaves `region_id` NULL
 *     and the city still resolves normally. A missing seed degrades the result;
 *     it never fails the resolve.
 */
async function deriveRegionBackfill(
  city: { regionId: number | null; countryCode: string },
  eligible: NominatimCandidate[],
): Promise<number | null> {
  if (city.regionId != null) return null;

  const iso = singleDistinctRegionIso(eligible);
  if (iso == null) return null;

  const country = await citiesRepository.findCountryRegionTier(city.countryCode);
  if (country?.regionTierEnabled !== 1) return null;

  const region = await citiesRepository.findRegionByIsoInCountry(iso, city.countryCode);
  return region?.id ?? null;
}

// ================================================================
// GE-19 / ADL-55 — the geocode STATUS LIFECYCLE (D1a / D5)
// ================================================================

/** The four persisted geocode statuses (schema `chk_cities_geocode_status`). */
export type GeocodeStatus = 'pending' | 'resolved' | 'unresolvable' | 'needs_attention';
/** The persisted cause discriminator (schema `chk_cities_geocode_cause`). */
export type GeocodeCause = 'ambiguous' | 'unreachable' | null;

/**
 * GE-19 / ADL-55 D1a — the classified outcome of ONE resolution attempt, reduced
 * to what the state machine needs. Produced inside `resolveCity` from whichever
 * geocoder path ran (name-search or carried-OSM `/lookup`) and fed to
 * {@link nextGeocodeState}. Distinct from {@link CandidateVerdict}, which decides
 * "which candidate, if any" one step earlier.
 *
 *   - 'ok'          — a single confident candidate; coordinates are committed
 *                     separately by `commitResolvedOrMerge` (which also clears cause).
 *   - 'no_match'    — the geocoder answered with zero usable candidates, OR a
 *                     carried OSM ref no longer resolves to a settlement (M-B).
 *                     Terminal 'unresolvable' (ADL-46 D10, unchanged).
 *   - 'ambiguous'   — eligible candidates disagree on region / the selected region
 *                     could not be confirmed. Deterministic, so terminal on the
 *                     FIRST verdict (D1a / OQ-3) — no retry is spent.
 *   - 'unreachable' — a recoverable failure (network/timeout/5xx/429). Counts the
 *                     attempt and retries below the cap; AT the cap it becomes
 *                     needs_attention rather than sitting pending-at-cap (§R F2).
 *   - 'disabled'    — GEOCODING_ENABLED=false / a global condition. Changes nothing
 *                     (no increment) — one offline window must not burn a city's
 *                     budget (ADL-46 D10).
 */
export type GeocodeLifecycleVerdict = 'ok' | 'no_match' | 'ambiguous' | 'unreachable' | 'disabled';

/** The current-row fields the state machine reads — nothing else is needed. */
export interface GeocodeStateInput {
  geocodeStatus: GeocodeStatus;
  geocodeAttempts: number;
  geocodeCause: GeocodeCause;
}

/** The persisted policy fields a resolution attempt writes back. */
export interface NextGeocodeState {
  status: GeocodeStatus;
  attempts: number;
  cause: GeocodeCause;
}

/**
 * GE-19 / ADL-55 D5 — THE geocode state machine (§3.2), extracted as a PURE
 * function so the entire lifecycle is an exhaustive table test with no DB and no
 * network (OP-35 criterion 11). Given the current row and one attempt's verdict,
 * it returns the `{status, attempts, cause}` to persist. All IO stays in
 * `resolveCity`: the 'ok' verdict is applied by `commitResolvedOrMerge`
 * (coordinates + OSM ref + the merge fallback); every other verdict is applied by
 * {@link applyGeocodeState} — a single UPDATE of exactly these three fields.
 *
 * Two deliberate changes vs. the pre-GE-19 behaviour (both in ADL-55 §3.2):
 *   - 'ambiguous' is TERMINAL on the first verdict (needs_attention/ambiguous),
 *     spending no further retry — the identical query returns the identical
 *     verdict, so retrying is waste. Re-askability is preserved by the re-open
 *     path (findOrUpgradeCity resets attempts when a region is supplied).
 *   - the cap is an ACTIVE transition (increment-then-check) rather than a passive
 *     `WHERE attempts < cap` drop, so a row never sits pending-at-cap forever.
 *
 * @param row     - The current geocode_status / _attempts / _cause of the row.
 * @param verdict - The classified outcome of this resolution attempt.
 */
export function nextGeocodeState(
  row: GeocodeStateInput,
  verdict: GeocodeLifecycleVerdict,
): NextGeocodeState {
  switch (verdict) {
    case 'ok':
      // Coordinates confirmed — attempts no longer matter once resolved; cause clears.
      return { status: 'resolved', attempts: row.geocodeAttempts, cause: null };
    case 'no_match':
      // Terminal: the geocoder answered "no usable match" (ADL-46 D10). Never retried.
      return { status: 'unresolvable', attempts: row.geocodeAttempts, cause: null };
    case 'ambiguous':
      // D1a / OQ-3: deterministic → terminal on the first verdict, no retry spent.
      return { status: 'needs_attention', attempts: row.geocodeAttempts, cause: 'ambiguous' };
    case 'unreachable': {
      // Recoverable: the failing attempt still counts. AT the cap the row becomes
      // needs_attention/unreachable; below it, it stays pending and retries.
      const attempts = row.geocodeAttempts + 1;
      return attempts >= GEOCODE_ATTEMPT_CAP
        ? { status: 'needs_attention', attempts, cause: 'unreachable' }
        : { status: 'pending', attempts, cause: 'unreachable' };
    }
    case 'disabled':
      // Global condition — change nothing at all (no increment). ADL-46 D10.
      return { status: row.geocodeStatus, attempts: row.geocodeAttempts, cause: row.geocodeCause };
  }
}

/**
 * GE-19 / ADL-55 D5 — persists a non-'ok' {@link nextGeocodeState} result: the
 * three policy fields plus the attempt timestamp, in one UPDATE. The 'ok' path
 * does NOT flow through here — `commitResolvedOrMerge` writes coordinates + the
 * OSM ref + the merge fallback and clears the cause itself.
 */
async function applyGeocodeState(cityId: number, next: NextGeocodeState): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();
  await db
    .update(cities)
    .set({
      geocodeStatus: next.status,
      geocodeAttempts: next.attempts,
      geocodeCause: next.cause,
      geocodeAttemptedAt: now,
      updatedAt: now,
    })
    .where(eq(cities.id, cityId));
}

/**
 * Attempts to resolve coordinates for a single EXISTING city row via Nominatim
 * (the geocode queue / on-create trigger path). Produces a lifecycle verdict and
 * applies it through {@link nextGeocodeState} (ADL-46 D10 + GE-19 / ADL-55 §3.2).
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
      geocodeAttempts: cities.geocodeAttempts,
      geocodeCause: cities.geocodeCause,
      countryCode: cities.countryCode,
      // ADL-56 D4: the backfill decision needs the raw region_id, not only the
      // joined ISO. They agree today (regions.iso_3166_2 is NOT NULL, so a
      // non-null region_id always yields a non-null regionIso), but reading the
      // column the rule is actually about keeps the gate honest if that ever
      // stops being true.
      regionId: cities.regionId,
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

  // Terminal / do-not-touch states, all returning without a write:
  //   resolved       — never re-queried (ADL-10).
  //   unresolvable   — terminal (ADL-46 D10).
  //   needs_attention— terminal, awaiting a user action (GE-19 / ADL-55 §R F3): a
  //                    re-processed row must NOT be re-resolved unbidden. The
  //                    re-open path (findOrUpgradeCity) is what returns it to
  //                    'pending' when the user supplies a region.
  if (city.geocodeStatus === 'resolved') return true;
  if (city.geocodeStatus === 'unresolvable') return false;
  if (city.geocodeStatus === 'needs_attention') return false;

  // GEOCODING_ENABLED=false is a GLOBAL condition — do NOT increment attempts.
  if (!geocodingEnabled()) return false;

  // The pure state machine reads exactly these three fields; capture them once
  // BEFORE the attempt so the cap decision uses the pre-attempt count.
  const stateRow: GeocodeStateInput = {
    geocodeStatus: city.geocodeStatus as GeocodeStatus,
    geocodeAttempts: city.geocodeAttempts,
    geocodeCause: city.geocodeCause as GeocodeCause,
  };

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
      // Recoverable — GE-19 / ADL-55 §R F2 (carried-OSM site): stay pending and
      // retry below the cap, transition to needs_attention/unreachable AT it.
      await applyGeocodeState(cityId, nextGeocodeState(stateRow, 'unreachable'));
      return false;
    }

    const candidate = result.candidates[0];
    if (!candidate) {
      // M-B (delta review): the carried object no longer resolves to a
      // settlement — deleted, or reclassified to a non-settlement type
      // (HTTP 200, zero/filtered rows). Distinct from disabled/error above.
      // TERMINAL 'unresolvable': a deleted/reclassified OSM object will not come
      // back as a settlement — degrade safely, never retried again.
      await applyGeocodeState(cityId, nextGeocodeState(stateRow, 'no_match'));
      console.info(
        `[GEO] City ${cityId} (${city.name}) unresolvable — carried osm ref no longer resolves to a settlement`,
      );
      return false;
    }

    // ADL-56 D4: the carried-ref path resolves ONE candidate by id, so it is
    // region-unambiguous by construction (§B1.2 — the carried ref IS the query).
    // A user who picked this place from the picker but left the region blank is
    // exactly the BUG-98 shape §6a path (A) expects to end up carrying a region.
    return commitResolvedOrMerge(cityId, candidate, await deriveRegionBackfill(city, [candidate]));
  }

  // Non-carried — the existing name-search path. M-A (delta review, v2 §7
  // rule 2c): commitResolvedOrMerge stamps the winning candidate's osm ref on
  // every resolve, not only carried-pick resolves — otherwise a freshly-resolved
  // row is invisible to the resolved-by-OSM merge mechanism and two users
  // resolving the same non-ambiguous city land as duplicate NULL-osm_id rows.
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
    // Recoverable — GE-19 / ADL-55 §R F2 (name-search site): stay pending and
    // retry below the cap, transition to needs_attention/unreachable AT it.
    await applyGeocodeState(cityId, nextGeocodeState(stateRow, 'unreachable'));
    return false;
  }

  // result.status === 'ok' — the geocoder answered. ADL-46 F1/F2 ruling §2.4:
  // the single shared classifier decides "which candidate, if any".
  const verdict = classifyCandidates(
    result.candidates,
    new Set([city.countryCode.toUpperCase()]),
    city.regionIso,
  );

  if (verdict.status === 'unresolved') {
    // TERMINAL 'unresolvable': the geocoder answered with no usable match (D10).
    await applyGeocodeState(cityId, nextGeocodeState(stateRow, 'no_match'));
    console.info(`[GEO] City ${cityId} (${city.name}) unresolvable — no match`);
    return false;
  }

  if (verdict.status === 'ambiguous') {
    // GE-19 D1a / OQ-3 (refines ADL-46 D10/F1): the geocoder DID answer but could
    // not confirm a single region — not a "no match" (D10 'unresolvable' does not
    // apply) and it must not guess (D14). The answer is DETERMINISTIC, so this is
    // terminal on the FIRST verdict: needs_attention/ambiguous, spending no
    // further retry (pre-GE-19 this consumed the budget and stayed 'pending').
    // Re-askability is preserved — the re-open path resets attempts when a region
    // is later supplied.
    await applyGeocodeState(cityId, nextGeocodeState(stateRow, 'ambiguous'));
    console.info(
      `[GEO] City ${cityId} (${city.name}) needs attention — ambiguous (${verdict.reason}): regions=${verdict.regionIsos.join(',')}`,
    );
    return false;
  }

  // verdict.status === 'ok'
  // ADL-56 D4/N5(b): derive the backfill from verdict.ELIGIBLE, never from
  // verdict.best — `best = eligible[0]` can carry a NULL regionIso while the
  // set names exactly one region (see singleDistinctRegionIso).
  return commitResolvedOrMerge(
    cityId,
    verdict.best,
    await deriveRegionBackfill(city, verdict.eligible),
  );
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
