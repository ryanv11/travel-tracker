/**
 * Travel Tracker — Cities Router
 *
 * City search, creation, carry-forward query, and city-level item history.
 * Geocoding is attempted immediately on city creation; failures are silent (GE-12).
 */

import { and, asc, desc, eq, inArray, like, notInArray, sql } from 'drizzle-orm';
import { Router } from 'express';
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
import { NotFoundError, ValidationError } from '../errors.js';
import { asyncHandler } from '../middleware/error-handler.js';
import { requireOwner } from '../middleware/requireOwner.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { resolveCity } from '../services/geocoding.service.js';
import {
  CityItemsQuerySchema,
  CreateCitySchema,
  PatchCitySchema,
  SearchCitiesQuerySchema,
} from '../validation/cities.schemas.js';

export const citiesRouter = Router();

// ----------------------------------------------------------------
// GET /api/cities  (search)
// ----------------------------------------------------------------
citiesRouter.get(
  '/',
  validateQuery(SearchCitiesQuerySchema),
  asyncHandler(async (req, res) => {
    const { q, country_code } = req.query as { q: string; country_code?: string };

    const db = getDb();

    const conditions = [like(cities.name, `%${q}%`)];
    if (country_code) conditions.push(eq(cities.countryCode, country_code));

    const results = await db
      .select({
        id: cities.id,
        name: cities.name,
        country_code: cities.countryCode,
        region_id: cities.regionId,
        latitude: cities.latitude,
        longitude: cities.longitude,
        geocode_status: cities.geocodeStatus,
      })
      .from(cities)
      .where(and(...conditions))
      .orderBy(cities.name);

    res.json(results);
  }),
);

// ----------------------------------------------------------------
// POST /api/cities
// ADL-27 / HC-06: owner-only (city creation pollutes the global seed)
//
// BUG-33: find-or-create. GE-14 says the frontend should search before
// offering "add new city", but that's a UX nicety, not a guarantee — a
// case-mismatched query, a stale search-results list, or a double-submit
// can all reach this route for a city that already exists. This handler
// is the last line of defense against duplicate `cities` rows: it looks
// up an existing (name, country_code) match case-insensitively before
// ever inserting, and only inserts when genuinely not found. This holds
// regardless of whether the DB-level unique index (separate DB brief,
// same bug) has landed yet — defense in depth, not a dependency on it.
// ----------------------------------------------------------------
citiesRouter.post(
  '/',
  requireOwner,
  validateBody(CreateCitySchema),
  asyncHandler(async (req, res) => {
    const { name, country_code, region_id } = req.body;
    const db = getDb();

    // Verify country exists
    const countryRows = await db
      .select({ regionTierEnabled: countries.regionTierEnabled })
      .from(countries)
      .where(eq(countries.countryCode, country_code))
      .limit(1);
    if (!countryRows.length) throw new NotFoundError('Country');

    const { regionTierEnabled } = countryRows[0];

    // Correction 2: region_id is OPTIONAL even when region_tier_enabled = 1
    // But region_id MUST be NULL when region_tier_enabled = 0
    if (regionTierEnabled === 0 && region_id != null) {
      throw new ValidationError('region_id must not be provided for countries without region tier');
    }

    // If region_id is provided, verify it belongs to the country
    if (region_id != null) {
      const regionRows = await db
        .select({ id: regions.id })
        .from(regions)
        .where(and(eq(regions.id, region_id), eq(regions.countryCode, country_code)))
        .limit(1);
      if (!regionRows.length) throw new NotFoundError('Region');
    }

    // BUG-33: find-or-create — look up an existing city by (name, country_code),
    // case-insensitively, before inserting a new row. `name` arrives already
    // whitespace-trimmed by CreateCitySchema (zod .trim()).
    const existingRows = await db
      .select()
      .from(cities)
      .where(and(eq(cities.countryCode, country_code), sql`lower(${cities.name}) = lower(${name})`))
      .limit(1);

    if (existingRows.length) {
      // Existing city found — return it as-is (200, not 201: no row was created).
      // Deliberately does NOT overwrite region_id from the request; that's PATCH's job.
      const existing = existingRows[0];
      res.status(200).json({
        id: existing.id,
        name: existing.name,
        country_code: existing.countryCode,
        region_id: existing.regionId,
        latitude: existing.latitude,
        longitude: existing.longitude,
        geocode_status: existing.geocodeStatus,
      });
      return;
    }

    const now = new Date().toISOString();
    const inserted = await db
      .insert(cities)
      .values({
        name,
        countryCode: country_code,
        regionId: region_id ?? null,
        geocodeStatus: 'pending',
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const city = inserted[0];

    // Attempt geocoding immediately (fire-and-forget — GE-12)
    // resolveCity handles offline gracefully — never throws
    resolveCity(city.id).catch(() => {
      // Already handled internally — defensive catch
    });

    // Re-fetch to get updated geocode status (may have resolved synchronously in fast environments)
    const fresh = await db.select().from(cities).where(eq(cities.id, city.id)).limit(1);
    const result = fresh[0] ?? city;

    res.status(201).json({
      id: result.id,
      name: result.name,
      country_code: result.countryCode,
      region_id: result.regionId,
      latitude: result.latitude,
      longitude: result.longitude,
      geocode_status: result.geocodeStatus,
    });
  }),
);

// ----------------------------------------------------------------
// GET /api/cities/:id  (BUG-29)
// Read-only single-city fetch, used by the frontend geocode retry queue to
// poll geocode_status without issuing writes. Authenticated read (app-level
// requireAuth) — cities are global seed data, so no owner gate and no
// per-user scoping (matches GET /api/cities search). Never triggers
// geocoding (ADL-10) — the backend queue owns re-resolution.
// ----------------------------------------------------------------
citiesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const cityId = parseInt(String(req.params.id), 10);
    if (Number.isNaN(cityId)) throw new NotFoundError('City');

    const db = getDb();

    const rows = await db.select().from(cities).where(eq(cities.id, cityId)).limit(1);
    if (!rows.length) throw new NotFoundError('City');

    const city = rows[0];
    res.json({
      id: city.id,
      name: city.name,
      country_code: city.countryCode,
      region_id: city.regionId,
      latitude: city.latitude,
      longitude: city.longitude,
      geocode_status: city.geocodeStatus,
    });
  }),
);

// ----------------------------------------------------------------
// PATCH /api/cities/:id  (C2)
// ADL-27 / SE-03: owner-only (city edits pollute the global seed)
// ----------------------------------------------------------------
citiesRouter.patch(
  '/:id',
  requireOwner,
  validateBody(PatchCitySchema),
  asyncHandler(async (req, res) => {
    const cityId = parseInt(String(req.params.id), 10);
    if (Number.isNaN(cityId)) throw new NotFoundError('City');

    const db = getDb();

    // Verify city exists
    const cityRows = await db.select().from(cities).where(eq(cities.id, cityId)).limit(1);
    if (!cityRows.length) throw new NotFoundError('City');

    const { region_id } = req.body as { region_id?: number | null };

    // If region_id is provided (non-null), verify the region exists
    if (region_id != null) {
      const regionRows = await db
        .select({ id: regions.id })
        .from(regions)
        .where(eq(regions.id, region_id))
        .limit(1);
      if (!regionRows.length) throw new ValidationError('region_id does not exist');
    }

    const now = new Date().toISOString();
    // Only update region_id if the field was present in the request body
    const setValues =
      'region_id' in req.body
        ? { regionId: region_id ?? null, updatedAt: now }
        : { updatedAt: now };

    const updated = await db.update(cities).set(setValues).where(eq(cities.id, cityId)).returning();

    const city = updated[0];
    res.json({
      id: city.id,
      name: city.name,
      country_code: city.countryCode,
      region_id: city.regionId,
      latitude: city.latitude,
      longitude: city.longitude,
      geocode_status: city.geocodeStatus,
    });
  }),
);

// ----------------------------------------------------------------
// GET /api/cities/:id/carry-forward  (IT-07)
// ----------------------------------------------------------------
citiesRouter.get(
  '/:id/carry-forward',
  asyncHandler(async (req, res) => {
    const cityId = parseInt(String(req.params.id), 10);
    if (Number.isNaN(cityId)) throw new NotFoundError('City');

    const db = getDb();

    // ER schema §6.2: next_time items for this city across the user's trips (ADL-18)
    const userId = req.user!.id;
    const rows = await db
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
          eq(trips.userId, userId),
          notInArray(items.itemType, ['flight', 'car_rental']),
        ),
      )
      .orderBy(desc(trips.endDate));

    res.json(
      rows.map((r) => ({
        id: r.id,
        item_type: r.itemType,
        status: r.status,
        notes: r.notes,
        source_trip_name: r.sourceTripName,
        source_trip_end_date: r.sourceTripEndDate,
        restaurant_name: r.restaurantName,
        hotel_property_name: r.hotelPropertyName,
      })),
    );
  }),
);

// ----------------------------------------------------------------
// GET /api/cities/:id/items  (IT-09)
// ----------------------------------------------------------------
citiesRouter.get(
  '/:id/items',
  validateQuery(CityItemsQuerySchema),
  asyncHandler(async (req, res) => {
    const cityId = parseInt(String(req.params.id), 10);
    if (Number.isNaN(cityId)) throw new NotFoundError('City');

    const userId = req.user!.id;
    const { type, min_rating, sort_by, sort_order } = req.query as {
      type?: string;
      min_rating?: number;
      sort_by?: 'rating';
      sort_order?: 'asc' | 'desc';
    };

    const db = getDb();

    // ER schema §6.1: completed items at this city — scoped to the requesting user (SEC-01)
    const conditions = [
      eq(tripPlaces.cityId, cityId),
      eq(items.userId, userId),
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
    const useRatingSort = !sort_by || sort_by === 'rating';
    const rows = await query.orderBy(
      useRatingSort
        ? sort_order === 'asc'
          ? asc(effectiveRatingSql)
          : desc(effectiveRatingSql)
        : desc(effectiveRatingSql),
    );

    // Apply min_rating filter in JS (simpler than raw SQL for this case)
    const filtered = min_rating
      ? rows.filter((r) => r.effectiveRating != null && r.effectiveRating >= Number(min_rating))
      : rows;

    res.json(
      filtered.map((r) => ({
        id: r.id,
        item_type: r.itemType,
        status: r.status,
        notes: r.notes,
        trip_name: r.tripName,
        trip_start_date: r.tripStartDate,
        restaurant_name: r.restaurantName,
        restaurant_rating: r.restaurantRating,
        restaurant_post_visit_notes: r.restaurantPostVisitNotes,
        hotel_property_name: r.hotelPropertyName,
        hotel_rating: r.hotelRating,
        hotel_post_visit_notes: r.hotelPostVisitNotes,
        experience_rating: r.experienceRating,
        experience_post_visit_notes: r.experiencePostVisitNotes,
      })),
    );
  }),
);
