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
  getDb,
  countries,
  cities,
  regions,
  tripPlaces,
  trips,
  mapShadingConfig,
} from '../db/index.js';

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
function buildResult(
  stateKey: string,
  config: ShadingConfigMap,
): ShadingResult {
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
 * Returns shading state for every country.
 * Uses the bulk aggregate query from shading spec §4.1.
 * A single query — do not loop per country.
 */
export async function getAllCountryShading(): Promise<CountryShadingResult[]> {
  const db = getDb();
  const config = await getConfigMap();

  // Shading spec §4.1 — one LEFT JOIN chain, GROUP BY country_code
  const rows = await db
    .select({
      countryCode: countries.countryCode,
      hasActive: sql<number>`MAX(CASE WHEN ${trips.status} = 'active' THEN 1 ELSE 0 END)`,
      completedCount: sql<number>`COUNT(DISTINCT CASE WHEN ${trips.status} IN ('review_pending', 'locked') THEN ${trips.id} END)`,
      planningCount: sql<number>`COUNT(DISTINCT CASE WHEN ${trips.status} = 'planning' THEN ${trips.id} END)`,
    })
    .from(countries)
    .leftJoin(cities, eq(cities.countryCode, countries.countryCode))
    .leftJoin(tripPlaces, eq(tripPlaces.cityId, cities.id))
    .leftJoin(trips, eq(trips.id, tripPlaces.tripId))
    .groupBy(countries.countryCode);

  return rows.map((r) => {
    const stateKey = computeState(
      Number(r.completedCount),
      Number(r.planningCount),
      Number(r.hasActive) === 1,
    );
    return { countryCode: r.countryCode, ...buildResult(stateKey, config) };
  });
}

/**
 * Returns shading state for a single country.
 * Returns null if country does not exist.
 */
export async function getCountryShading(
  countryCode: string,
): Promise<CountryShadingResult | null> {
  const db = getDb();
  const config = await getConfigMap();

  const rows = await db
    .select({
      countryCode: countries.countryCode,
      hasActive: sql<number>`MAX(CASE WHEN ${trips.status} = 'active' THEN 1 ELSE 0 END)`,
      completedCount: sql<number>`COUNT(DISTINCT CASE WHEN ${trips.status} IN ('review_pending', 'locked') THEN ${trips.id} END)`,
      planningCount: sql<number>`COUNT(DISTINCT CASE WHEN ${trips.status} = 'planning' THEN ${trips.id} END)`,
    })
    .from(countries)
    .leftJoin(cities, eq(cities.countryCode, countries.countryCode))
    .leftJoin(tripPlaces, eq(tripPlaces.cityId, cities.id))
    .leftJoin(trips, eq(trips.id, tripPlaces.tripId))
    .where(eq(countries.countryCode, countryCode))
    .groupBy(countries.countryCode);

  if (!rows.length) return null;
  const r = rows[0];
  const stateKey = computeState(
    Number(r.completedCount),
    Number(r.planningCount),
    Number(r.hasActive) === 1,
  );
  return { countryCode: r.countryCode, ...buildResult(stateKey, config) };
}

/**
 * Returns shading state for all regions in a country.
 * Uses the bulk aggregate query from shading spec §5.1.
 */
export async function getRegionShading(
  countryCode: string,
): Promise<RegionShadingResult[]> {
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
