/**
 * Travel Tracker — Cities Repository (ADL-53 §4 / D3, QUAL-43 Stage 2)
 *
 * The DB access surface for cities: search (GE-16 containment), single-city
 * reads, the create / insert primitives, PATCH curation, the country/region
 * reference lookups the city create-path validates against, and the two
 * city-scoped user-owned reads (`GET /:id/carry-forward`, `GET /:id/items`).
 *
 * TWO AXES LIVE IN THIS FILE AND THEY ARE NOT THE SAME AXIS (ADL-53 D3/F3):
 *
 *   • `cities` is GLOBAL REFERENCE DATA (`schema.ts` — `created_by_user_id` is
 *     nullable, ON DELETE SET NULL). Its visibility axis is GE-16 CONTAINMENT
 *     — a `pending` row is visible only to its creator until it `resolved`s —
 *     which is a creator-visibility rule, NOT row ownership. It is therefore
 *     written directly against `cities.createdByUserId` and does not (and must
 *     not) compose the ownership chokepoint: `cities` is deliberately absent
 *     from `UserOwnedTable`, so passing it to `scopeToUser` is a compile error.
 *
 *   • The carry-forward and city-items reads join `trips` / `items`, which ARE
 *     user-owned. Those compose the chokepoint (`scopeToUser`) like every other
 *     user-owned query — cities' user-owned JOINS join the chokepoint even
 *     though the cities table itself does not.
 *
 * The identity / find-or-create algebra that sits on top of these primitives
 * lives in `../services/cityIdentityService.ts`, not here.
 */

import { and, asc, desc, eq, inArray, isNull, like, notInArray, or, sql } from 'drizzle-orm';
import {
  cities,
  countries,
  getDb,
  itemExperiences,
  itemHotels,
  itemRestaurants,
  items,
  regions,
  tripPlaces,
  trips,
} from '../db/index.js';
import { scopeToUser } from './scope.js';

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------

/** A full cities row, as returned by a select()/insert().returning(). */
export type CityRow = typeof cities.$inferSelect;

/** The insertable/updatable shape of a cities row. */
export type CityValues = typeof cities.$inferInsert;

export interface CitySearchFilters {
  q: string;
  countryCode?: string;
  countryCodes?: string[];
}

export interface CityItemsFilters {
  type?: string;
  minRating?: number;
  sortBy?: 'rating';
  sortOrder?: 'asc' | 'desc';
}

// ----------------------------------------------------------------
// Repository
// ----------------------------------------------------------------

export const citiesRepository = {
  /**
   * GE-16 city search. Returns the snake_case API row shape directly (the
   * search endpoint has no separate serializer).
   */
  async search(userId: string, filters: CitySearchFilters) {
    const db = getDb();
    const { q, countryCode, countryCodes } = filters;

    const conditions = [like(cities.name, `%${q}%`)];
    // GE-20 (ADL-54 D1/D2, fresh-eyes F4): country_code (singular, D12) and
    // country_codes (plural, the trip filter SET) are separate params.
    // Cities-path precedence contract (F4 — unspecified by the ADL, stated
    // here per the fresh-eyes recommendation): the single explicit
    // country_code wins when both are present, matching the geocode-path
    // precedence D1 already states. No current caller sends both (verified:
    // useCities.ts sends only `q`), so this branch is defensive totality,
    // not a live path.
    if (countryCode) {
      conditions.push(eq(cities.countryCode, countryCode));
    } else if (countryCodes && countryCodes.length > 0) {
      // F1 (fresh-eyes, load-bearing): only push inArray when the set is
      // NON-EMPTY. A present-but-empty country_codes ('' -> []) means
      // "not yet constrained" (PO Q1 ruling) and must fall through to no
      // filter at all — inArray(col, []) compiles to SQL `false`, which
      // would silently return zero rows and invert that ruling.
      conditions.push(inArray(cities.countryCode, countryCodes));
    }

    // ADL-46 GE-16 / D5 containment (§4.4): a 'pending' city is visible only in
    // its creator's own searches; it becomes globally visible once 'resolved'.
    // The IS NULL branch (F3) is load-bearing and permanent, not a legacy
    // artefact — ON DELETE SET NULL regenerates a NULL creator on every user
    // deletion, so a row that is pending AND has no known creator must be global
    // (seeded, pre-column, or creator-since-deleted), never invisible-to-everyone.
    // 'unresolvable' rows are NOT globally visible — they were never resolved, so
    // they stay creator-scoped (or global when the creator is NULL) exactly like
    // 'pending'. Only 'resolved' promotes a row to the shared catalogue.
    //
    // This is the GE-16 CREATOR-VISIBILITY axis on a global table, not row
    // ownership — see the header. It is deliberately not routed through the
    // ownership chokepoint.
    const containment = or(
      eq(cities.geocodeStatus, 'resolved'),
      eq(cities.createdByUserId, userId),
      isNull(cities.createdByUserId),
    );

    // BUG-72: enrich each row with the region's human-readable name and ISO
    // code so the frontend can render "city, state, country" instead of a
    // bare region_id integer (which the client cannot resolve across
    // countries — it only loads the region list for one selected country).
    // LEFT JOIN is load-bearing, not cosmetic: an INNER join would drop every
    // row with a NULL region_id (any city in a non-region-tier country, or a
    // region-tier city not yet assigned one) out of search results entirely,
    // silently narrowing the GE-16 containment result set above. region_id
    // itself stays in the response unchanged — existing consumers depend on it.
    return db
      .select({
        id: cities.id,
        name: cities.name,
        country_code: cities.countryCode,
        region_id: cities.regionId,
        region_name: regions.name,
        region_iso: regions.iso3166_2,
        latitude: cities.latitude,
        longitude: cities.longitude,
        geocode_status: cities.geocodeStatus,
      })
      .from(cities)
      .leftJoin(regions, eq(regions.id, cities.regionId))
      .where(and(...conditions, containment))
      .orderBy(cities.name);
  },

  /**
   * Single city by id, region-enriched (BUG-29 / BUG-80). Returns camelCase
   * columns; the route serializes.
   *
   * BUG-80: LEFT JOIN regions so this city-shaped payload also carries
   * region_name/region_iso, matching the search endpoint. LEFT, not INNER: a
   * NULL region_id (non-region-tier country, or a region-tier city not yet
   * assigned one) must still return the city row, not 404 it.
   */
  async findByIdWithRegion(cityId: number) {
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

  /** A full city row by id, or null. */
  async findById(cityId: number): Promise<CityRow | null> {
    const db = getDb();
    const rows = await db.select().from(cities).where(eq(cities.id, cityId)).limit(1);
    return rows[0] ?? null;
  },

  /** BUG-75 v3 §B2/B3 — an existing row already carrying this exact OSM ref, if any. */
  async findByOsmRef(
    osmType: string | null | undefined,
    osmId: number | null | undefined,
  ): Promise<CityRow | null> {
    if (osmType == null || osmId == null) return null;
    const db = getDb();
    const rows = await db
      .select()
      .from(cities)
      .where(and(eq(cities.osmType, osmType), eq(cities.osmId, osmId)))
      .limit(1);
    return rows[0] ?? null;
  },

  /**
   * ADL-46 D13 step 1 — exact match on the composite identity key
   * (name COLLATE NOCASE, country_code, COALESCE(region_id,0)), mirroring
   * uniq_cities_name_country_region_ci exactly.
   *
   * Creator- and status-blind ON PURPOSE: the unique index is unconditional, so
   * a filtered lookup would miss another user's row and the follow-on insert
   * would collide on it (ADL-46 F1/F2 ruling §3.1/§3.3 amendment 2).
   */
  async findByIdentityKey(
    name: string,
    countryCode: string,
    regionKey: number,
  ): Promise<CityRow | null> {
    const db = getDb();
    const rows = await db
      .select()
      .from(cities)
      .where(
        and(
          eq(cities.countryCode, countryCode),
          sql`${cities.name} = ${name} COLLATE NOCASE`,
          sql`COALESCE(${cities.regionId}, 0) = ${regionKey}`,
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  },

  /**
   * ADL-46 D13 step 2 — the region-less row this request may legitimately
   * adopt (the wildcard upgrade), or null.
   *
   * ADL-46 F1/F2 ruling §3.3 (R1): scoped to rows the caller may legitimately
   * MUTATE — `geocode_status IN ('pending','unresolvable')` (a whitelist, not
   * `<> 'resolved'`: it fails closed on a future status) AND
   * `(created_by_user_id = caller OR created_by_user_id IS NULL)`. A `resolved`
   * row is visible to the caller (GE-16) but must NOT be upgradeable —
   * read-through is global because the index is global; write-through is scoped
   * because nothing forces it to be. This is creator-scoping on global data
   * (see the header), not row ownership.
   */
  async findRegionlessUpgradeCandidate(
    name: string,
    countryCode: string,
    callerUserId: string,
  ): Promise<CityRow | null> {
    const db = getDb();
    const rows = await db
      .select()
      .from(cities)
      .where(
        and(
          eq(cities.countryCode, countryCode),
          sql`${cities.name} = ${name} COLLATE NOCASE`,
          isNull(cities.regionId),
          inArray(cities.geocodeStatus, ['pending', 'unresolvable']),
          or(eq(cities.createdByUserId, callerUserId), isNull(cities.createdByUserId)),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  },

  /**
   * ADL-46 D13 step 2b — rows matching (name, country_code) regardless of
   * region. Capped at 2: the caller only needs to distinguish "exactly one"
   * from "two or more" (single-match → reuse; ambiguous → create pending and
   * let D14 disambiguate).
   */
  async findByNameAndCountry(name: string, countryCode: string): Promise<CityRow[]> {
    const db = getDb();
    return db
      .select()
      .from(cities)
      .where(and(eq(cities.countryCode, countryCode), sql`${cities.name} = ${name} COLLATE NOCASE`))
      .limit(2);
  },

  /**
   * Raw INSERT of a city row, returning the inserted row(s).
   *
   * Deliberately NOT wrapped in `db.transaction()` (ADL-53 D8 — atomicity is
   * explicitly out of scope): a single INSERT is already atomic w.r.t. the
   * unique index in SQLite, and a live probe against this project's libSQL
   * :memory: test client showed `db.transaction()` nulls out the client's
   * connection, breaking every subsequent query on it (repositories/trips.ts
   * documents the same finding). Callers pair this with
   * `insertCityOrReuse` (cityIdentityService) for the caught-unique-violation
   * → re-select-and-reuse discipline.
   */
  async insert(values: CityValues): Promise<CityRow[]> {
    const db = getDb();
    return db.insert(cities).values(values).returning();
  },

  /** Updates a city row by id, returning the updated row(s). */
  async updateCity(cityId: number, setValues: Partial<CityValues>): Promise<CityRow[]> {
    const db = getDb();
    return db.update(cities).set(setValues).where(eq(cities.id, cityId)).returning();
  },

  // --------------------------------------------------------------
  // Reference lookups the city create/curate paths validate against.
  // Global tables (`countries` / `regions`) — no ownership axis.
  // --------------------------------------------------------------

  /** The country's region-tier flag, or null when the country does not exist. */
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
   * A region, confirmed to belong to `countryCode`, with its ISO code so the
   * geocoder lookup can be disambiguated by region (D12 step 2). Null when the
   * region does not exist or belongs to another country.
   */
  async findRegionInCountry(
    regionId: number,
    countryCode: string,
  ): Promise<{ id: number; iso: string | null } | null> {
    const db = getDb();
    const rows = await db
      .select({ id: regions.id, iso: regions.iso3166_2 })
      .from(regions)
      .where(and(eq(regions.id, regionId), eq(regions.countryCode, countryCode)))
      .limit(1);
    return rows[0] ?? null;
  },

  /** A region by id (existence check only), or null. */
  async findRegionById(regionId: number): Promise<{ id: number } | null> {
    const db = getDb();
    const rows = await db
      .select({ id: regions.id })
      .from(regions)
      .where(eq(regions.id, regionId))
      .limit(1);
    return rows[0] ?? null;
  },

  // --------------------------------------------------------------
  // City-scoped USER-OWNED reads (ADL-53 §5.1) — these compose the
  // ownership chokepoint. Cities are global; these joins are not.
  // --------------------------------------------------------------

  /**
   * IT-07 carry-forward — ER schema §6.2: next_time items for this city across
   * the requesting user's trips (ADL-18). Ownership is the `trips` join,
   * composed through the chokepoint.
   */
  async findCarryForwardItems(userId: string, cityId: number) {
    const db = getDb();
    return db
      .select({
        id: items.id,
        itemType: items.itemType,
        status: items.status,
        notes: items.notes,
        sourceTripName: trips.name,
        sourceTripEndDate: trips.endDate,
        restaurantName: itemRestaurants.name,
        hotelPropertyName: itemHotels.propertyName,
      })
      .from(items)
      .innerJoin(tripPlaces, eq(tripPlaces.id, items.tripPlaceId))
      .innerJoin(trips, eq(trips.id, tripPlaces.tripId))
      .leftJoin(itemRestaurants, eq(itemRestaurants.itemId, items.id))
      .leftJoin(itemHotels, eq(itemHotels.itemId, items.id))
      .where(
        and(
          eq(tripPlaces.cityId, cityId),
          eq(items.status, 'next_time'),
          scopeToUser(trips, userId),
          notInArray(items.itemType, ['flight', 'car_rental']),
        ),
      )
      .orderBy(desc(trips.endDate));
  },

  /**
   * IT-09 city item history — ER schema §6.1: completed items at this city,
   * scoped to the requesting user (SEC-01) through the chokepoint.
   */
  async findCityItems(userId: string, cityId: number, filters: CityItemsFilters) {
    const db = getDb();
    const { type, minRating, sortBy, sortOrder } = filters;

    const conditions = [
      eq(tripPlaces.cityId, cityId),
      scopeToUser(items, userId),
      inArray(items.itemType, ['restaurant', 'hotel', 'experience']),
      eq(items.status, 'completed'),
    ];
    if (type) conditions.push(eq(items.itemType, type));

    const effectiveRatingSql = sql<
      number | null
    >`COALESCE(${itemRestaurants.rating}, ${itemHotels.rating}, ${itemExperiences.rating})`;

    const query = db
      .select({
        id: items.id,
        itemType: items.itemType,
        status: items.status,
        notes: items.notes,
        tripName: trips.name,
        tripStartDate: trips.startDate,
        restaurantName: itemRestaurants.name,
        restaurantRating: itemRestaurants.rating,
        restaurantPostVisitNotes: itemRestaurants.postVisitNotes,
        hotelPropertyName: itemHotels.propertyName,
        hotelRating: itemHotels.rating,
        hotelPostVisitNotes: itemHotels.postVisitNotes,
        experienceRating: itemExperiences.rating,
        experiencePostVisitNotes: itemExperiences.postVisitNotes,
        // Computed rating for sort/filter — COALESCE across types
        effectiveRating: effectiveRatingSql,
      })
      .from(items)
      .innerJoin(tripPlaces, eq(tripPlaces.id, items.tripPlaceId))
      .innerJoin(trips, eq(trips.id, tripPlaces.tripId))
      .leftJoin(itemRestaurants, eq(itemRestaurants.itemId, items.id))
      .leftJoin(itemHotels, eq(itemHotels.itemId, items.id))
      .leftJoin(itemExperiences, eq(itemExperiences.itemId, items.id))
      .where(and(...conditions))
      .$dynamic();

    // Default: sort by rating DESC (existing behaviour). sort_by=rating makes it explicit;
    // sort_order=asc flips the direction.
    const useRatingSort = !sortBy || sortBy === 'rating';
    const rows = await query.orderBy(
      useRatingSort && sortOrder === 'asc' ? asc(effectiveRatingSql) : desc(effectiveRatingSql),
    );

    // Apply min_rating filter in JS (simpler than raw SQL for this case)
    return minRating
      ? rows.filter((r) => r.effectiveRating != null && r.effectiveRating >= Number(minRating))
      : rows;
  },
};
