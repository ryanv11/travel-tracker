/**
 * Travel Tracker — Trips Router
 *
 * Handles all trip CRUD and status transition endpoints.
 * Items and places routers are nested here via mergeParams: true.
 *
 * Status transition rules (TR-06, TR-07) are enforced by validateTransition().
 * Locked trip writes return 403 LockError.
 */

import { Router } from 'express';
import { eq, desc, and, inArray } from 'drizzle-orm';
import {
  getDb,
  trips,
  items,
  tripCategoriesMap,
  tripCompanionsMap,
  tripActivitiesMap,
  tripCategories,
  companions,
  activities,
  tripPlaces,
  cities,
  tripPlaceActivitiesMap,
} from '../db/index.js';
import { asyncHandler } from '../middleware/error-handler.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import {
  CreateTripSchema,
  UpdateTripSchema,
  UpdateTripStatusSchema,
  ListTripsQuerySchema,
  DeleteTripParamsSchema,
} from '../validation/trips.schemas.js';
import { NotFoundError, LockError, ValidationError } from '../errors.js';
import { fetchItemsWithExtensions } from './items-helper.js';
import placesRouter from './places.js';
import itemsRouter from './items.js';

export const tripsRouter = Router();

// Mount nested routers with mergeParams: true (defined in those files)
tripsRouter.use('/:tripId/places', placesRouter);
tripsRouter.use('/:tripId/items', itemsRouter);

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

/** Allowed status transitions (TR-06, TR-07) */
const VALID_TRANSITIONS: Record<string, string[]> = {
  planning: ['active', 'review_pending'],
  active: ['review_pending'],
  review_pending: ['locked', 'planning'],
  locked: ['review_pending'],
};

function validateTransition(from: string, to: string): void {
  const allowed = VALID_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new ValidationError(`Invalid status transition from ${from} to ${to}`);
  }
}

/** Load a trip by ID or throw 404 */
async function getTripOrThrow(tripId: number) {
  const db = getDb();
  const rows = await db.select().from(trips).where(eq(trips.id, tripId)).limit(1);
  if (!rows.length) throw new NotFoundError('Trip');
  return rows[0];
}

/** Replace all many-to-many associations for a trip (delete + reinsert) */
async function replaceAssociations(
  tripId: number,
  categoryIds?: number[],
  companionIds?: number[],
  activityIds?: number[],
): Promise<void> {
  const db = getDb();

  if (categoryIds !== undefined) {
    await db.delete(tripCategoriesMap).where(eq(tripCategoriesMap.tripId, tripId));
    if (categoryIds.length) {
      await db.insert(tripCategoriesMap).values(
        categoryIds.map((id) => ({ tripId, categoryId: id })),
      );
    }
  }
  if (companionIds !== undefined) {
    await db.delete(tripCompanionsMap).where(eq(tripCompanionsMap.tripId, tripId));
    if (companionIds.length) {
      await db.insert(tripCompanionsMap).values(
        companionIds.map((id) => ({ tripId, companionId: id })),
      );
    }
  }
  if (activityIds !== undefined) {
    await db.delete(tripActivitiesMap).where(eq(tripActivitiesMap.tripId, tripId));
    if (activityIds.length) {
      await db.insert(tripActivitiesMap).values(
        activityIds.map((id) => ({ tripId, activityId: id })),
      );
    }
  }
}

/** Fetch categories, companions, activities for a trip */
async function getTripAssociations(tripId: number) {
  const db = getDb();
  const [cats, comps, acts] = await Promise.all([
    db
      .select({ id: tripCategories.id, name: tripCategories.name })
      .from(tripCategoriesMap)
      .leftJoin(tripCategories, eq(tripCategories.id, tripCategoriesMap.categoryId))
      .where(eq(tripCategoriesMap.tripId, tripId)),
    db
      .select({ id: companions.id, name: companions.name })
      .from(tripCompanionsMap)
      .leftJoin(companions, eq(companions.id, tripCompanionsMap.companionId))
      .where(eq(tripCompanionsMap.tripId, tripId)),
    db
      .select({ id: activities.id, name: activities.name })
      .from(tripActivitiesMap)
      .leftJoin(activities, eq(activities.id, tripActivitiesMap.activityId))
      .where(eq(tripActivitiesMap.tripId, tripId)),
  ]);
  return { categories: cats, companions: comps, activities: acts };
}

/** Build the standard trip response shape (list item — minimal places for city pins) */
async function buildTripResponse(trip: typeof trips.$inferSelect) {
  const db = getDb();
  const [assoc, placesRows] = await Promise.all([
    getTripAssociations(trip.id),
    db
      .select({
        id: tripPlaces.id,
        cityId: tripPlaces.cityId,
        cityName: cities.name,
        cityCountryCode: cities.countryCode,
        cityRegionId: cities.regionId,
        cityLatitude: cities.latitude,
        cityLongitude: cities.longitude,
        cityGeocodeStatus: cities.geocodeStatus,
      })
      .from(tripPlaces)
      .leftJoin(cities, eq(cities.id, tripPlaces.cityId))
      .where(eq(tripPlaces.tripId, trip.id)),
  ]);

  const places = placesRows.map((p) => ({
    id: p.id,
    city_id: p.cityId,
    city: {
      id: p.cityId,
      name: p.cityName,
      country_code: p.cityCountryCode,
      region_id: p.cityRegionId,
      latitude: p.cityLatitude,
      longitude: p.cityLongitude,
      geocode_status: p.cityGeocodeStatus,
    },
  }));

  return {
    id: trip.id,
    name: trip.name,
    start_date: trip.startDate,
    end_date: trip.endDate,
    status: trip.status,
    photo_album_ref: trip.photoAlbumRef,
    created_at: trip.createdAt,
    updated_at: trip.updatedAt,
    ...assoc,
    places,
  };
}

// ----------------------------------------------------------------
// GET /api/trips
// ----------------------------------------------------------------
tripsRouter.get(
  '/',
  validateQuery(ListTripsQuerySchema),
  asyncHandler(async (req, res) => {
    const db = getDb();
    const { status, category_id, activity_id } = req.query as {
      status?: string;
      category_id?: number;
      activity_id?: number;
    };

    // Build base query — filters applied below
    let query = db.select().from(trips).$dynamic();

    if (status) query = query.where(eq(trips.status, status));

    const allTrips = await query.orderBy(desc(trips.startDate));

    // Post-filter by category/activity (simpler than joins for this volume)
    let filtered = allTrips;
    if (category_id) {
      const db2 = getDb();
      const catTrips = await db2
        .select({ tripId: tripCategoriesMap.tripId })
        .from(tripCategoriesMap)
        .where(eq(tripCategoriesMap.categoryId, Number(category_id)));
      const ids = new Set(catTrips.map((r) => r.tripId));
      filtered = filtered.filter((t) => ids.has(t.id));
    }
    if (activity_id) {
      const db2 = getDb();
      const actTrips = await db2
        .select({ tripId: tripActivitiesMap.tripId })
        .from(tripActivitiesMap)
        .where(eq(tripActivitiesMap.activityId, Number(activity_id)));
      const ids = new Set(actTrips.map((r) => r.tripId));
      filtered = filtered.filter((t) => ids.has(t.id));
    }

    const result = await Promise.all(filtered.map(buildTripResponse));
    res.json(result);
  }),
);

// ----------------------------------------------------------------
// POST /api/trips
// ----------------------------------------------------------------
tripsRouter.post(
  '/',
  validateBody(CreateTripSchema),
  asyncHandler(async (req, res) => {
    const db = getDb();
    const { name, start_date, end_date, photo_album_ref, category_ids, companion_ids, activity_ids } =
      req.body;

    const now = new Date().toISOString();
    const inserted = await db
      .insert(trips)
      .values({
        name,
        startDate: start_date,
        endDate: end_date,
        photoAlbumRef: photo_album_ref,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const trip = inserted[0];

    await replaceAssociations(trip.id, category_ids ?? [], companion_ids ?? [], activity_ids ?? []);

    res.status(201).json(await buildTripResponse(trip));
  }),
);

// ----------------------------------------------------------------
// GET /api/trips/:id
// ----------------------------------------------------------------
tripsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const tripId = parseInt(req.params.id, 10);
    if (isNaN(tripId)) throw new NotFoundError('Trip');

    const trip = await getTripOrThrow(tripId);
    const assoc = await getTripAssociations(tripId);

    const db = getDb();

    // Load places with their cities
    const placesRows = await db
      .select({
        id: tripPlaces.id,
        cityId: tripPlaces.cityId,
        createdAt: tripPlaces.createdAt,
        cityName: cities.name,
        cityCountryCode: cities.countryCode,
        cityRegionId: cities.regionId,
        cityLatitude: cities.latitude,
        cityLongitude: cities.longitude,
        cityGeocodeStatus: cities.geocodeStatus,
      })
      .from(tripPlaces)
      .leftJoin(cities, eq(cities.id, tripPlaces.cityId))
      .where(eq(tripPlaces.tripId, tripId));

    // Load place activities
    const placeIds = placesRows.map((p) => p.id);
    const placeActivities =
      placeIds.length > 0
        ? await db
            .select({
              tripPlaceId: tripPlaceActivitiesMap.tripPlaceId,
              activityId: activities.id,
              activityName: activities.name,
            })
            .from(tripPlaceActivitiesMap)
            .leftJoin(activities, eq(activities.id, tripPlaceActivitiesMap.activityId))
            .where(inArray(tripPlaceActivitiesMap.tripPlaceId, placeIds))
        : [];

    // Load all items for the trip with extension fields
    const tripItemsCondition = eq(items.tripId, tripId);
    const allItems = await fetchItemsWithExtensions(tripItemsCondition);

    // Assemble places
    const places = placesRows.map((p) => ({
      id: p.id,
      city_id: p.cityId,
      created_at: p.createdAt,
      city: {
        id: p.cityId,
        name: p.cityName,
        country_code: p.cityCountryCode,
        region_id: p.cityRegionId,
        latitude: p.cityLatitude,
        longitude: p.cityLongitude,
        geocode_status: p.cityGeocodeStatus,
      },
      activities: placeActivities
        .filter((a) => a.tripPlaceId === p.id)
        .map((a) => ({ id: a.activityId, name: a.activityName })),
      items: allItems.filter(
        (i) => (i as Record<string, unknown>).trip_place_id === p.id,
      ),
    }));

    res.json({
      id: trip.id,
      name: trip.name,
      start_date: trip.startDate,
      end_date: trip.endDate,
      status: trip.status,
      photo_album_ref: trip.photoAlbumRef,
      created_at: trip.createdAt,
      updated_at: trip.updatedAt,
      ...assoc,
      places,
    });
  }),
);

// ----------------------------------------------------------------
// PATCH /api/trips/:id
// ----------------------------------------------------------------
tripsRouter.patch(
  '/:id',
  validateBody(UpdateTripSchema),
  asyncHandler(async (req, res) => {
    const tripId = parseInt(req.params.id, 10);
    if (isNaN(tripId)) throw new NotFoundError('Trip');

    const trip = await getTripOrThrow(tripId);
    if (trip.status === 'locked') throw new LockError();

    const { name, start_date, end_date, photo_album_ref, category_ids, companion_ids, activity_ids } =
      req.body;

    const now = new Date().toISOString();
    const updates: Partial<typeof trips.$inferInsert> = { updatedAt: now };
    if (name !== undefined) updates.name = name;
    if (start_date !== undefined) updates.startDate = start_date;
    if (end_date !== undefined) updates.endDate = end_date;
    if (photo_album_ref !== undefined) updates.photoAlbumRef = photo_album_ref;

    const db = getDb();
    const updated = await db
      .update(trips)
      .set(updates)
      .where(eq(trips.id, tripId))
      .returning();

    await replaceAssociations(tripId, category_ids, companion_ids, activity_ids);

    res.json(await buildTripResponse(updated[0]));
  }),
);

// ----------------------------------------------------------------
// PATCH /api/trips/:id/status
// ----------------------------------------------------------------
tripsRouter.patch(
  '/:id/status',
  validateBody(UpdateTripStatusSchema),
  asyncHandler(async (req, res) => {
    const tripId = parseInt(req.params.id, 10);
    if (isNaN(tripId)) throw new NotFoundError('Trip');

    const trip = await getTripOrThrow(tripId);
    const { status } = req.body;

    validateTransition(trip.status, status);

    const db = getDb();
    const now = new Date().toISOString();
    const updated = await db
      .update(trips)
      .set({ status, updatedAt: now })
      .where(eq(trips.id, tripId))
      .returning();

    res.json(await buildTripResponse(updated[0]));
  }),
);

// ----------------------------------------------------------------
// PATCH /api/trips/:id/lock  (convenience alias)
// ----------------------------------------------------------------
tripsRouter.patch(
  '/:id/lock',
  asyncHandler(async (req, res) => {
    const tripId = parseInt(req.params.id, 10);
    if (isNaN(tripId)) throw new NotFoundError('Trip');

    const trip = await getTripOrThrow(tripId);
    if (trip.status === 'locked') {
      throw new ValidationError('Trip is already locked');
    }

    validateTransition(trip.status, 'locked');

    const db = getDb();
    const now = new Date().toISOString();
    const updated = await db
      .update(trips)
      .set({ status: 'locked', updatedAt: now })
      .where(eq(trips.id, tripId))
      .returning();

    res.json(await buildTripResponse(updated[0]));
  }),
);

// ----------------------------------------------------------------
// PATCH /api/trips/:id/unlock  (convenience alias → review_pending)
// ----------------------------------------------------------------
tripsRouter.patch(
  '/:id/unlock',
  asyncHandler(async (req, res) => {
    const tripId = parseInt(req.params.id, 10);
    if (isNaN(tripId)) throw new NotFoundError('Trip');

    const trip = await getTripOrThrow(tripId);
    if (trip.status !== 'locked') {
      throw new ValidationError('Trip is not locked');
    }

    const db = getDb();
    const now = new Date().toISOString();
    const updated = await db
      .update(trips)
      .set({ status: 'review_pending', updatedAt: now })
      .where(eq(trips.id, tripId))
      .returning();

    res.json(await buildTripResponse(updated[0]));
  }),
);

// ----------------------------------------------------------------
// DELETE /api/trips/:id
// ----------------------------------------------------------------

/**
 * Hard-delete a trip and all its related data.
 *
 * SQLite CASCADE handles removal of all child records:
 *   trip_categories_map, trip_companions_map, trip_activities_map (via trip_id)
 *   trip_places (via trip_id)
 *   trip_place_activities_map (via trip_place_id on trip_places)
 *   items (via trip_id)
 *   item_flights, item_hotels, item_car_rentals, item_restaurants, item_experiences
 *     (via item_id on items)
 *
 * Spec: FEAT-BD (COO 2026-03-11)
 * No soft-delete — trips are personal data owned entirely by the user (AD-06 applies
 * to admin list items only; trips are explicitly hard-deleted per spec).
 *
 * @param id - Path param: positive integer trip ID. Returns 400 if invalid.
 * @returns 204 No Content on success.
 * @returns 400 if id is not a positive integer.
 * @returns 404 if trip does not exist.
 */
tripsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    // Validate path param — id must be a positive integer
    const parseResult = DeleteTripParamsSchema.safeParse({ id: req.params.id });
    if (!parseResult.success) {
      res.status(400).json({ error: 'Trip not found' });
      return;
    }
    const tripId = parseResult.data.id;

    // Verify the trip exists; throw 404 if not found
    await getTripOrThrow(tripId);

    // Delete the trip — CASCADE handles all related child records
    const db = getDb();
    await db.delete(trips).where(eq(trips.id, tripId));

    // 204 No Content — no body on successful delete
    res.status(204).send();
  }),
);

export default tripsRouter;
