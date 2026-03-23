/**
 * Travel Tracker — Map Shading Service
 *
 * Computes shading states from trip data at query time — nothing is stored.
 * Implements computeState() exactly per map-shading-spec.md §2.
 *
 * Country and region shading use bulk aggregate SQL queries for efficiency.
 * The shading config (6 rows) is cached in memory and invalidated on PATCH.
 */

import { eq, sql } from 'drizzle-orm';
import {
  cities,
  countries,
  getDb,
  mapShadingConfig,
  regions,
  tripCountries,
  tripPlaces,
  trips,
} from '../db/index.js';

// ----------------------------------------------------------------
// Country shading — region coverage helper
// ----------------------------------------------------------------

interface RegionCoverage {
  totalRegions: number;
  visitedRegions: number;
}

/**
 * Returns a map of country_code → { totalRegions, visitedRegions }.
 * A region is "visited" when any trip_place exists for a city in that region,
 * regardless of trip status. Used for case (c) of the country shading rule
 * (shading-spec.md §4.0).
 */
async function getRegionCoverageMap(): Promise<Map<string, RegionCoverage>> {
  const db = getDb();
  const rows = await db
    .select({
      countryCode: regions.countryCode,
      totalRegions: sql<number>`COUNT(DISTINCT ${regions.id})`,
      visitedRegions: sql<number>`COUNT(DISTINCT CASE WHEN ${tripPlaces.id} IS NOT NULL THEN ${regions.id} END)`,
    })
    .from(regions)
    .leftJoin(cities, eq(cities.regionId, regions.id))
    .leftJoin(tripPlaces, eq(tripPlaces.cityId, cities.id))
    .groupBy(regions.countryCode);

  return new Map(
    rows.map((r) => [
      r.countryCode,
      { totalRegions: Number(r.totalRegions), visitedRegions: Number(r.visitedRegions) },
    ]),
  );
}

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
// In-memory config cache
// ----------------------------------------------------------------

let _configCache: ShadingConfigMap | null = null;

/** Load shading config from DB and cache it in memory. */
async function getConfigMap(): Promise<ShadingConfigMap> {
  if (_configCache) return _configCache;

  const db = getDb();
  const rows = await db.select().from(mapShadingConfig);
  _configCache = new Map(
    rows.map((r) => [r.stateKey, { colorHex: r.colorHex, displayName: r.displayName }]),
  );
  return _configCache;
}

/**
 * Invalidates the in-memory shading config cache.
 * Call this after any PATCH to /api/map/shading/config.
 */
export function invalidateConfigCache(): void {
  _configCache = null;
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
 * Computes the country shading state key applying the v1.1 rule
 * (shading-spec.md §4.0):
 *
 *   (a) region_tier_enabled = 0 → shade on any visit (all-city stats)
 *   (c) all regions visited     → shade whole country (all-city stats)
 *   (b) unregioned cities exist → shade from those trips only
 *   otherwise                   → never_visited
 *
 * Exported for unit testing.
 */
export function computeCountryState(
  row: {
    regionTierEnabled: number;
    hasActive: number;
    completedCount: number;
    planningCount: number;
    hasActiveUnregioned: number;
    completedUnregioned: number;
    planningUnregioned: number;
  },
  coverage: RegionCoverage | undefined,
): string {
  if (!row.regionTierEnabled) {
    // Case (a): no region tier
    return computeState(
      Number(row.completedCount),
      Number(row.planningCount),
      Number(row.hasActive) === 1,
    );
  }

  const allRegionsVisited =
    coverage !== undefined &&
    coverage.totalRegions > 0 &&
    coverage.visitedRegions === coverage.totalRegions;

  if (allRegionsVisited) {
    // Case (c): every region visited — roll up to whole-country state
    return computeState(
      Number(row.completedCount),
      Number(row.planningCount),
      Number(row.hasActive) === 1,
    );
  }

  if (
    Number(row.completedUnregioned) > 0 ||
    Number(row.planningUnregioned) > 0 ||
    Number(row.hasActiveUnregioned) === 1
  ) {
    // Case (b): cities with no region assignment have trips
    return computeState(
      Number(row.completedUnregioned),
      Number(row.planningUnregioned),
      Number(row.hasActiveUnregioned) === 1,
    );
  }

  return 'never_visited';
}

/**
 * Returns a map of country_code → { hasActive, completedCount, planningCount }
 * derived from the trip_countries junction table (case (d): explicitly-tagged countries).
 */
async function getTripCountriesStats(): Promise<
  Map<string, { hasActive: number; completedCount: number; planningCount: number }>
> {
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
const countrySelectShape = (co: typeof countries, c: typeof cities, t: typeof trips) => ({
  countryCode: co.countryCode,
  regionTierEnabled: co.regionTierEnabled,
  // All-city stats
  hasActive: sql<number>`MAX(CASE WHEN ${t.status} = 'active' THEN 1 ELSE 0 END)`,
  completedCount: sql<number>`COUNT(DISTINCT CASE WHEN ${t.status} IN ('review_pending', 'locked') THEN ${t.id} END)`,
  planningCount: sql<number>`COUNT(DISTINCT CASE WHEN ${t.status} = 'planning' THEN ${t.id} END)`,
  // Unregioned-city stats (c.region_id IS NULL)
  hasActiveUnregioned: sql<number>`MAX(CASE WHEN ${c.regionId} IS NULL AND ${t.status} = 'active' THEN 1 ELSE 0 END)`,
  completedUnregioned: sql<number>`COUNT(DISTINCT CASE WHEN ${c.regionId} IS NULL AND ${t.status} IN ('review_pending', 'locked') THEN ${t.id} END)`,
  planningUnregioned: sql<number>`COUNT(DISTINCT CASE WHEN ${c.regionId} IS NULL AND ${t.status} = 'planning' THEN ${t.id} END)`,
});

/**
 * Returns shading state for every country.
 * Implements shading-spec.md §4.1 (v1.1 — two queries + application logic).
 */
export async function getAllCountryShading(): Promise<CountryShadingResult[]> {
  const db = getDb();
  const [config, coverage, tcStats] = await Promise.all([
    getConfigMap(),
    getRegionCoverageMap(),
    getTripCountriesStats(),
  ]);

  const rows = await db
    .select(countrySelectShape(countries, cities, trips))
    .from(countries)
    .leftJoin(cities, eq(cities.countryCode, countries.countryCode))
    .leftJoin(tripPlaces, eq(tripPlaces.cityId, cities.id))
    .leftJoin(trips, eq(trips.id, tripPlaces.tripId))
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
    const stateKey = computeCountryState(merged, coverage.get(r.countryCode));
    return { countryCode: r.countryCode, ...buildResult(stateKey, config) };
  });
}

/**
 * Returns shading state for a single country.
 * Returns null if country does not exist.
 */
export async function getCountryShading(countryCode: string): Promise<CountryShadingResult | null> {
  const db = getDb();
  const [config, coverage, tcStats] = await Promise.all([
    getConfigMap(),
    getRegionCoverageMap(),
    getTripCountriesStats(),
  ]);

  const rows = await db
    .select(countrySelectShape(countries, cities, trips))
    .from(countries)
    .leftJoin(cities, eq(cities.countryCode, countries.countryCode))
    .leftJoin(tripPlaces, eq(tripPlaces.cityId, cities.id))
    .leftJoin(trips, eq(trips.id, tripPlaces.tripId))
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
  const stateKey = computeCountryState(merged, coverage.get(r.countryCode));
  return { countryCode: r.countryCode, ...buildResult(stateKey, config) };
}

/**
 * Returns shading state for all regions in a country.
 * Uses the bulk aggregate query from shading spec §5.1.
 */
export async function getRegionShading(countryCode: string): Promise<RegionShadingResult[]> {
  const db = getDb();
  const config = await getConfigMap();

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
    .leftJoin(trips, eq(trips.id, tripPlaces.tripId))
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

/**
 * Returns shading state for a single city.
 * Uses the single-city query from shading spec §3.1.
 */
export async function getCityShading(cityId: number): Promise<ShadingResult> {
  const db = getDb();
  const config = await getConfigMap();

  // Shading spec §3.1
  const rows = await db
    .select({
      hasActive: sql<number>`MAX(CASE WHEN ${trips.status} = 'active' THEN 1 ELSE 0 END)`,
      completedCount: sql<number>`COUNT(DISTINCT CASE WHEN ${trips.status} IN ('review_pending', 'locked') THEN ${trips.id} END)`,
      planningCount: sql<number>`COUNT(DISTINCT CASE WHEN ${trips.status} = 'planning' THEN ${trips.id} END)`,
    })
    .from(tripPlaces)
    .leftJoin(trips, eq(trips.id, tripPlaces.tripId))
    .where(eq(tripPlaces.cityId, cityId));

  const r = rows[0] ?? { hasActive: 0, completedCount: 0, planningCount: 0 };
  const stateKey = computeState(
    Number(r.completedCount),
    Number(r.planningCount),
    Number(r.hasActive) === 1,
  );
  return buildResult(stateKey, config);
}
