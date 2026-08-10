/**
 * Travel Tracker — Map Shading Service
 *
 * Computes shading states from trip data at query time — nothing is stored.
 * Implements computeState() exactly per map-shading-spec.md §2.
 *
 * Country and region shading use bulk aggregate SQL queries for efficiency.
 * The shading config (6 rows per user) is cached in memory per userId and
 * invalidated on PATCH — see ADL-28 (AD-07) R2.
 *
 * OWNERSHIP (QUAL-43 Stage 3, ADL-53 §7 CORRECTION 2026-08-10)
 * ------------------------------------------------------------------
 * The four `trips`-ownership predicates in this file compose the chokepoint
 * `scopeToUser(trips, userId)` (repositories/scope.ts) rather than hand-writing
 * a raw column-equality test against the trips owner column. They were correct
 * before and are unchanged in behaviour — `scopeToUser` returns exactly the same
 * predicate the four sites spelled out by hand — but they now share
 * the single ownership definition every repository uses, so Phase-3 sharing
 * (ADL-53 D7) reaches this service too. This is a COMPOSITION, not a relocation:
 * the queries stay here.
 *
 * Three of the four compose into a LEFT JOIN's ON-clause, not a WHERE. That
 * placement is load-bearing and is preserved exactly: these are aggregate
 * queries driven `FROM countries`/`FROM regions`, so a country or region with no
 * matching trip must still produce a row (state `never_visited`). Moving the
 * ownership predicate from the ON-clause into a WHERE would turn each LEFT JOIN
 * into an effective INNER JOIN and silently drop every unvisited unit from the
 * map. Covered by `services/__tests__/shading.user-scope.test.ts`.
 */

import { and, eq, sql } from 'drizzle-orm';
import {
  cities,
  countries,
  getDb,
  regions,
  tripCountries,
  tripPlaces,
  trips,
} from '../db/index.js';
import { scopeToUser } from '../repositories/scope.js';
import { shadingConfigRepository } from '../repositories/shadingConfig.js';

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------

export interface ShadingResult {
  stateKey: string;
  colorHex: string | null;
  displayName: string;
}

export interface CountryShadingResult extends ShadingResult {
  countryCode: string;
}

export interface RegionShadingResult extends ShadingResult {
  regionId: number;
  regionName: string;
  iso3166_2: string;
}

type ShadingConfigMap = Map<string, { colorHex: string; displayName: string }>;

// ----------------------------------------------------------------
// In-memory config cache — per userId (ADL-28 R2)
// ----------------------------------------------------------------
//
// Pre-ADL-28 this was a single global Map keyed by stateKey alone, which
// meant one user's config PATCH invalidated (or worse, could have leaked
// into) every other user's cached view. It is now a Map of userId →
// ShadingConfigMap, invalidated per-user on PATCH.

const _configCache: Map<string, ShadingConfigMap> = new Map();

/** Load shading config from DB for userId and cache it in memory. Lazily seeds defaults on first access (see shadingConfigRepository). */
async function getConfigMap(userId: string): Promise<ShadingConfigMap> {
  const cached = _configCache.get(userId);
  if (cached) return cached;

  const rows = await shadingConfigRepository.findAll(userId);
  const configMap: ShadingConfigMap = new Map(
    rows.map((r) => [r.stateKey, { colorHex: r.colorHex, displayName: r.displayName }]),
  );
  _configCache.set(userId, configMap);
  return configMap;
}

/**
 * Invalidates the in-memory shading config cache.
 * Call this after any PATCH to /api/map/shading/config/:stateKey, passing
 * the userId whose config changed. Omit userId to clear every user's cache
 * (used by tests that need a full reset).
 */
export function invalidateConfigCache(userId?: string): void {
  if (userId) {
    _configCache.delete(userId);
  } else {
    _configCache.clear();
  }
}

// ----------------------------------------------------------------
// Core computation
// ----------------------------------------------------------------

/**
 * Computes the shading state key from trip counts.
 * Implements the priority logic from map-shading-spec.md §2 exactly.
 *
 * @param completedCount - Distinct trips with status 'review_pending' or 'locked'.
 * @param planningCount  - Distinct trips with status 'planning'.
 * @param hasActive      - Whether any trip with status 'active' includes this unit.
 */
export function computeState(
  completedCount: number,
  planningCount: number,
  hasActive: boolean,
): string {
  if (hasActive) return 'active'; // MP-06: overrides all other states
  if (completedCount >= 2 && planningCount > 0) return 'visited_multiple_planning';
  if (completedCount >= 2 && planningCount === 0) return 'visited_multiple';
  if (completedCount === 1 && planningCount > 0) return 'visited_once_planning';
  if (completedCount === 1 && planningCount === 0) return 'visited_once';
  if (completedCount === 0 && planningCount > 0) return 'planned';
  return 'never_visited';
}

/** Builds the full ShadingResult from a computed stateKey and the config cache. */
function buildResult(stateKey: string, config: ShadingConfigMap): ShadingResult {
  if (stateKey === 'never_visited') {
    return { stateKey, colorHex: null, displayName: 'Never visited' };
  }
  const cfg = config.get(stateKey);
  return {
    stateKey,
    colorHex: cfg?.colorHex ?? null,
    displayName: cfg?.displayName ?? stateKey,
  };
}

// ----------------------------------------------------------------
// Public API
// ----------------------------------------------------------------

/**
 * Computes the country shading state key.
 *
 * Any visit to any city in the country highlights the country at country zoom
 * level, regardless of whether the country has a region tier enabled.
 * Region-level detail is shown via the RegionLayer at zoom >= 4 (MAP-01).
 *
 * Exported for unit testing.
 */
export function computeCountryState(row: {
  regionTierEnabled: number;
  hasActive: number;
  completedCount: number;
  planningCount: number;
}): string {
  // Country is highlighted based on any visit to any city, regardless of region tier.
  // Region-level detail is shown via the RegionLayer at higher zoom (MAP-01).
  return computeState(
    Number(row.completedCount),
    Number(row.planningCount),
    Number(row.hasActive) === 1,
  );
}

/**
 * Returns a map of country_code → { hasActive, completedCount, planningCount }
 * derived from the trip_countries junction table (case (d): explicitly-tagged countries).
 * Scoped to the given userId.
 */
async function getTripCountriesStats(
  userId: string,
): Promise<Map<string, { hasActive: number; completedCount: number; planningCount: number }>> {
  const db = getDb();
  const rows = await db
    .select({
      countryCode: tripCountries.countryCode,
      hasActive: sql<number>`MAX(CASE WHEN ${trips.status} = 'active' THEN 1 ELSE 0 END)`,
      completedCount: sql<number>`COUNT(DISTINCT CASE WHEN ${trips.status} IN ('review_pending', 'locked') THEN ${trips.id} END)`,
      planningCount: sql<number>`COUNT(DISTINCT CASE WHEN ${trips.status} = 'planning' THEN ${trips.id} END)`,
    })
    .from(tripCountries)
    .leftJoin(trips, eq(trips.id, tripCountries.tripId))
    .where(scopeToUser(trips, userId))
    .groupBy(tripCountries.countryCode);
  return new Map(
    rows.map((r) => [
      r.countryCode,
      {
        hasActive: Number(r.hasActive),
        completedCount: Number(r.completedCount),
        planningCount: Number(r.planningCount),
      },
    ]),
  );
}

/** Drizzle select shape for country shading query (§4.1 Query A). */
const countrySelectShape = (co: typeof countries, t: typeof trips) => ({
  countryCode: co.countryCode,
  regionTierEnabled: co.regionTierEnabled,
  hasActive: sql<number>`MAX(CASE WHEN ${t.status} = 'active' THEN 1 ELSE 0 END)`,
  completedCount: sql<number>`COUNT(DISTINCT CASE WHEN ${t.status} IN ('review_pending', 'locked') THEN ${t.id} END)`,
  planningCount: sql<number>`COUNT(DISTINCT CASE WHEN ${t.status} = 'planning' THEN ${t.id} END)`,
});

/**
 * Returns shading state for every country.
 * Implements shading-spec.md §4.1 (v1.1 — two queries + application logic).
 * Scoped to the given userId so each user sees only their own trip data.
 */
export async function getAllCountryShading(userId: string): Promise<CountryShadingResult[]> {
  const db = getDb();
  const [config, tcStats] = await Promise.all([
    getConfigMap(userId),
    getTripCountriesStats(userId),
  ]);

  const rows = await db
    .select(countrySelectShape(countries, trips))
    .from(countries)
    .leftJoin(cities, eq(cities.countryCode, countries.countryCode))
    .leftJoin(tripPlaces, eq(tripPlaces.cityId, cities.id))
    .leftJoin(trips, and(eq(trips.id, tripPlaces.tripId), scopeToUser(trips, userId)))
    .groupBy(countries.countryCode, countries.regionTierEnabled);

  return rows.map((r) => {
    const tc = tcStats.get(r.countryCode);
    const merged = tc
      ? {
          ...r,
          hasActive: Math.max(Number(r.hasActive), tc.hasActive),
          completedCount: Math.max(Number(r.completedCount), tc.completedCount),
          planningCount: Math.max(Number(r.planningCount), tc.planningCount),
        }
      : r;
    const stateKey = computeCountryState(merged);
    return { countryCode: r.countryCode, ...buildResult(stateKey, config) };
  });
}

/**
 * Returns shading state for a single country.
 * Returns null if country does not exist.
 * Scoped to the given userId so each user sees only their own trip data.
 */
export async function getCountryShading(
  countryCode: string,
  userId: string,
): Promise<CountryShadingResult | null> {
  const db = getDb();
  const [config, tcStats] = await Promise.all([
    getConfigMap(userId),
    getTripCountriesStats(userId),
  ]);

  const rows = await db
    .select(countrySelectShape(countries, trips))
    .from(countries)
    .leftJoin(cities, eq(cities.countryCode, countries.countryCode))
    .leftJoin(tripPlaces, eq(tripPlaces.cityId, cities.id))
    .leftJoin(trips, and(eq(trips.id, tripPlaces.tripId), scopeToUser(trips, userId)))
    .where(eq(countries.countryCode, countryCode))
    .groupBy(countries.countryCode, countries.regionTierEnabled);

  if (!rows.length) return null;
  const r = rows[0];
  const tc = tcStats.get(r.countryCode);
  const merged = tc
    ? {
        ...r,
        hasActive: Math.max(Number(r.hasActive), tc.hasActive),
        completedCount: Math.max(Number(r.completedCount), tc.completedCount),
        planningCount: Math.max(Number(r.planningCount), tc.planningCount),
      }
    : r;
  const stateKey = computeCountryState(merged);
  return { countryCode: r.countryCode, ...buildResult(stateKey, config) };
}

/**
 * Returns shading state for all regions in a country.
 * Uses the bulk aggregate query from shading spec §5.1.
 * Scoped to the given userId so each user sees only their own trip data.
 */
export async function getRegionShading(
  countryCode: string,
  userId: string,
): Promise<RegionShadingResult[]> {
  const db = getDb();
  const config = await getConfigMap(userId);

  // Shading spec §5.1
  const rows = await db
    .select({
      regionId: regions.id,
      regionName: regions.name,
      iso3166_2: regions.iso3166_2,
      hasActive: sql<number>`MAX(CASE WHEN ${trips.status} = 'active' THEN 1 ELSE 0 END)`,
      completedCount: sql<number>`COUNT(DISTINCT CASE WHEN ${trips.status} IN ('review_pending', 'locked') THEN ${trips.id} END)`,
      planningCount: sql<number>`COUNT(DISTINCT CASE WHEN ${trips.status} = 'planning' THEN ${trips.id} END)`,
    })
    .from(regions)
    .leftJoin(cities, eq(cities.regionId, regions.id))
    .leftJoin(tripPlaces, eq(tripPlaces.cityId, cities.id))
    .leftJoin(trips, and(eq(trips.id, tripPlaces.tripId), scopeToUser(trips, userId)))
    .where(eq(regions.countryCode, countryCode))
    .groupBy(regions.id);

  return rows.map((r) => {
    const stateKey = computeState(
      Number(r.completedCount),
      Number(r.planningCount),
      Number(r.hasActive) === 1,
    );
    return {
      regionId: r.regionId,
      regionName: r.regionName,
      iso3166_2: r.iso3166_2,
      ...buildResult(stateKey, config),
    };
  });
}
