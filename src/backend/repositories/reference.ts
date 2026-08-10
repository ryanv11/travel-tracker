/**
 * Travel Tracker — Global Reference Repository (QUAL-43 Stage 3, ADL-53 §6)
 *
 * The DB access surface for the GLOBAL reference tables — `countries`,
 * `regions`, and the global-lookup reads against `cities`. These are the reads
 * that route handlers used to run inline via `getDb()`; relocating them here is
 * what lets the `getDb`-in-routes guard (ADL-53 §3 item 1) become a one-line
 * fail-closed grep.
 *
 * DELIBERATELY UNSCOPED — and that is the point.
 * ------------------------------------------------------------------
 * Every method here is intentionally NOT user-scoped, because none of these
 * tables is user data:
 *
 *   - `countries` / `regions` — global reference data (GE-04/GE-05), pre-seeded
 *     and readable by every authenticated user. Writes are owner-gated at the
 *     ROUTE layer (`requireOwner` on adminRouter), not by row ownership.
 *   - `cities` — global reference data too (`createdByUserId` is nullable,
 *     `ON DELETE SET NULL`; `schema.ts` — "cities are global reference data,
 *     not user data"). The city reads here are pure existence/detail lookups.
 *
 * So there is NO cross-tenant axis to protect on this surface, and adding a
 * `userId` predicate to any method below would be exactly as wrong as omitting
 * one from a user-owned read. `scope.ts`'s `UserOwnedTable` union enforces this
 * structurally: passing `countries`, `regions` or `cities` to `scopeToUser` is
 * a compile error by construction (ADL-53 §2).
 *
 * Where a caller DOES need ownership — e.g. `places.ts` re-pointing a place to
 * a corrected city — ownership is enforced separately on the *place* via
 * `placeRepository`, before the global city lookup runs. The two concerns stay
 * separate on purpose (ADL-53 §5.1, F3/D3: conflating them produces the vacuous
 * cross-tenant tests QUAL-22 warns about).
 *
 * Behaviour note: every query below was moved VERBATIM from its route handler
 * (`map.ts`, `admin.ts`, `places.ts`) — same projections, same predicates, same
 * ordering, same `.limit(1)`. HTTP concerns (404/validation) stay in the routes;
 * these methods return data or `null`.
 */

import { and, eq } from 'drizzle-orm';
import { cities, countries, getDb, regions } from '../db/index.js';
import type { Country, Region } from '../db/schema.js';

/**
 * The mutable slice of a country's region-tier configuration
 * (`PATCH /api/admin/countries/:countryCode`). `updatedAt` is always written;
 * the other two are applied only when the request supplied them, which is why
 * they are optional rather than nullable.
 */
export interface CountryConfigUpdate {
  updatedAt: string;
  regionTierEnabled?: number;
  regionTierLabel?: string | null;
}

/** A city joined to its (optional) region — the payload shape `POST /places` returns. */
export interface CityWithRegion {
  id: number;
  name: string;
  countryCode: string;
  regionId: number | null;
  regionName: string | null;
  regionIso: string | null;
  latitude: number | null;
  longitude: number | null;
  geocodeStatus: string;
}

export const referenceRepository = {
  // ----------------------------------------------------------------
  // Countries
  // ----------------------------------------------------------------

  /** Every country, name-ordered. Global reference data — readable by any authenticated user. */
  async listCountries(): Promise<Country[]> {
    const db = getDb();
    return db.select().from(countries).orderBy(countries.name);
  },

  /** A single country by ISO 3166-1 alpha-2 code, or null. */
  async findCountryByCode(countryCode: string): Promise<Country | null> {
    const db = getDb();
    const rows = await db
      .select()
      .from(countries)
      .where(eq(countries.countryCode, countryCode))
      .limit(1);
    return rows[0] ?? null;
  },

  /**
   * The region-tier flag alone — the narrow projection three handlers need to
   * decide whether a country has a region tier (map country/region shading,
   * admin region creation). Returns null when the country does not exist, which
   * callers turn into a 404.
   */
  async findCountryRegionTier(countryCode: string): Promise<{ regionTierEnabled: number } | null> {
    const db = getDb();
    const rows = await db
      .select({ regionTierEnabled: countries.regionTierEnabled })
      .from(countries)
      .where(eq(countries.countryCode, countryCode))
      .limit(1);
    return rows[0] ?? null;
  },

  /**
   * Applies a region-tier config update and returns the updated row.
   * Callers verify the country exists first (so `.returning()` always yields a row).
   */
  async updateCountry(countryCode: string, updates: CountryConfigUpdate): Promise<Country> {
    const db = getDb();
    const updated = await db
      .update(countries)
      .set(updates)
      .where(eq(countries.countryCode, countryCode))
      .returning();
    return updated[0];
  },

  // ----------------------------------------------------------------
  // Regions
  // ----------------------------------------------------------------

  /** Every region of a country, name-ordered. */
  async listRegionsByCountry(countryCode: string): Promise<Region[]> {
    const db = getDb();
    return db
      .select()
      .from(regions)
      .where(eq(regions.countryCode, countryCode))
      .orderBy(regions.name);
  },

  /**
   * A region by id, constrained to a country — the constraint is what makes a
   * mismatched `/countries/:countryCode/regions/:regionId` pair a 404 rather
   * than a cross-country edit.
   */
  async findRegionInCountry(regionId: number, countryCode: string): Promise<Region | null> {
    const db = getDb();
    const rows = await db
      .select()
      .from(regions)
      .where(and(eq(regions.id, regionId), eq(regions.countryCode, countryCode)))
      .limit(1);
    return rows[0] ?? null;
  },

  /** Creates a region and returns it. Caller validates the country's region tier first. */
  async createRegion(
    countryCode: string,
    name: string,
    iso3166_2: string,
    now: string,
  ): Promise<Region> {
    const db = getDb();
    const inserted = await db
      .insert(regions)
      .values({ countryCode, name, iso3166_2, createdAt: now, updatedAt: now })
      .returning();
    return inserted[0];
  },

  /** Renames a region and returns it. Caller verifies existence first. */
  async updateRegionName(regionId: number, name: string, updatedAt: string): Promise<Region> {
    const db = getDb();
    const updated = await db
      .update(regions)
      .set({ name, updatedAt })
      .where(eq(regions.id, regionId))
      .returning();
    return updated[0];
  },

  // ----------------------------------------------------------------
  // Cities — global lookups (identity/find-or-create logic is Stage 2's
  // `citiesRepository`; these two are plain reference reads)
  // ----------------------------------------------------------------

  /**
   * A city with its region name/ISO left-joined.
   *
   * BUG-80: the LEFT JOIN is load-bearing — it is what lets `POST /places` return
   * the same city-shaped payload (`region_name`/`region_iso`) as every other route
   * touched by that fix. A region-less city (`regionId` null) still returns a row,
   * with null region fields.
   */
  async findCityWithRegion(cityId: number): Promise<CityWithRegion | null> {
    const db = getDb();
    const rows = await db
      .select({
        id: cities.id,
        name: cities.name,
        countryCode: cities.countryCode,
        regionId: cities.regionId,
        regionName: regions.name,
        regionIso: regions.iso3166_2,
        latitude: cities.latitude,
        longitude: cities.longitude,
        geocodeStatus: cities.geocodeStatus,
      })
      .from(cities)
      .leftJoin(regions, eq(regions.id, cities.regionId))
      .where(eq(cities.id, cityId))
      .limit(1);
    return rows[0] ?? null;
  },

  /**
   * Whether a city id exists. Used by `PATCH /places/:placeId` (ADL-46 D11) so a
   * bad `city_id` surfaces as a 404 instead of an FK error. Ownership of the
   * place itself is already enforced by `placeRepository` before this runs.
   */
  async cityExists(cityId: number): Promise<boolean> {
    const db = getDb();
    const rows = await db
      .select({ id: cities.id })
      .from(cities)
      .where(eq(cities.id, cityId))
      .limit(1);
    return rows.length > 0;
  },
};
