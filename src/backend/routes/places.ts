/**
 * Travel Tracker — Places Router
 *
 * Nested under /api/trips/:tripId/places (mounted in trips.ts with mergeParams: true).
 * Handles place CRUD and place-level activity tagging.
 * All writes check locked trip status.
 */

import { Router } from 'express';
import { eq, and } from 'drizzle-orm';
import {
  getDb,
  trips,
  tripPlaces,
  cities,
  tripPlaceActivitiesMap,
  activities,
} from '../db/index.js';
import { asyncHandler } from '../middleware/error-handler.js';
import { validateBody } from '../middleware/validate.js';
import { CreatePlaceSchema, AddPlaceActivitySchema } from '../validation/places.schemas.js';
import { NotFoundError, LockError, ConflictError } from '../errors.js';

const placesRouter = Router({ mergeParams: true });
export default placesRouter;

/** Asserts trip exists and is not locked */
async function assertTripWritable(tripId: number): Promise<void> {
  const db = getDb();
  const rows = await db
    .select({ status: trips.status })
    .from(trips)
    .where(eq(trips.id, tripId))
    .limit(1);
  if (!rows.length) throw new NotFoundError('Trip');
  if (rows[0].status === 'locked') throw new LockError();
}

// ----------------------------------------------------------------
// GET /api/trips/:tripId/places
// ----------------------------------------------------------------
placesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const tripId = parseInt(req.params.tripId, 10);
    if (isNaN(tripId)) throw new NotFoundError('Trip');

    const db = getDb();
    const tripExists = await db.select({ id: trips.id }).from(trips).where(eq(trips.id, tripId)).limit(1);
    if (!tripExists.length) throw new NotFoundError('Trip');

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

    // Fetch place activities
    const placeIds = placesRows.map((p) => p.id);
    const placeActivities =
      placeIds.length > 0
        ? await db
            .select({
              tripPlaceId: tripPlaceActivitiesMap.tripPlaceId,
              id: activities.id,
              name: activities.name,
            })
            .from(tripPlaceActivitiesMap)
            .leftJoin(activities, eq(activities.id, tripPlaceActivitiesMap.activityId))
            .where(eq(tripPlaceActivitiesMap.tripPlaceId, placeIds[0]))
        : [];

    // For multiple placeIds, do a broader query
    const allPlaceActivities =
      placeIds.length > 1
        ? await db
            .select({
              tripPlaceId: tripPlaceActivitiesMap.tripPlaceId,
              id: activities.id,
              name: activities.name,
            })
            .from(tripPlaceActivitiesMap)
            .leftJoin(activities, eq(activities.id, tripPlaceActivitiesMap.activityId))
            .where(eq(tripPlaces.tripId, tripId))
        : placeActivities;

    const result = placesRows.map((p) => ({
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
      activities: allPlaceActivities
        .filter((a) => a.tripPlaceId === p.id)
        .map((a) => ({ id: a.id, name: a.name })),
    }));

    res.json(result);
  }),
);

// ----------------------------------------------------------------
// POST /api/trips/:tripId/places
// ----------------------------------------------------------------
placesRouter.post(
  '/',
  validateBody(CreatePlaceSchema),
  asyncHandler(async (req, res) => {
    const tripId = parseInt(req.params.tripId, 10);
    if (isNaN(tripId)) throw new NotFoundError('Trip');

    await assertTripWritable(tripId);

    const { city_id } = req.body;
    const db = getDb();

    // Verify city exists
    const cityRows = await db.select().from(cities).where(eq(cities.id, city_id)).limit(1);
    if (!cityRows.length) throw new NotFoundError('City');

    // Check for duplicate (trip_id, city_id) unique constraint
    const existing = await db
      .select({ id: tripPlaces.id })
      .from(tripPlaces)
      .where(and(eq(tripPlaces.tripId, tripId), eq(tripPlaces.cityId, city_id)))
      .limit(1);
    if (existing.length) throw new ConflictError('Trip already has this city');

    const now = new Date().toISOString();
    const inserted = await db
      .insert(tripPlaces)
      .values({ tripId, cityId: city_id, createdAt: now, updatedAt: now })
      .returning();

    const place = inserted[0];
    const city = cityRows[0];

    res.status(201).json({
      id: place.id,
      city_id: place.cityId,
      created_at: place.createdAt,
      city: {
        id: city.id,
        name: city.name,
        country_code: city.countryCode,
        region_id: city.regionId,
        latitude: city.latitude,
        longitude: city.longitude,
        geocode_status: city.geocodeStatus,
      },
      activities: [],
    });
  }),
);

// ----------------------------------------------------------------
// DELETE /api/trips/:tripId/places/:placeId
// ----------------------------------------------------------------
placesRouter.delete(
  '/:placeId',
  asyncHandler(async (req, res) => {
    const tripId = parseInt(req.params.tripId, 10);
    const placeId = parseInt(req.params.placeId, 10);
    if (isNaN(tripId) || isNaN(placeId)) throw new NotFoundError('Place');

    await assertTripWritable(tripId);

    const db = getDb();
    const existing = await db
      .select({ id: tripPlaces.id })
      .from(tripPlaces)
      .where(and(eq(tripPlaces.id, placeId), eq(tripPlaces.tripId, tripId)))
      .limit(1);
    if (!existing.length) throw new NotFoundError('Place');

    // CASCADE in schema handles items and activity maps
    await db.delete(tripPlaces).where(eq(tripPlaces.id, placeId));

    res.status(204).send();
  }),
);

// ----------------------------------------------------------------
// POST /api/trips/:tripId/places/:placeId/activities
// ----------------------------------------------------------------
placesRouter.post(
  '/:placeId/activities',
  validateBody(AddPlaceActivitySchema),
  asyncHandler(async (req, res) => {
    const tripId = parseInt(req.params.tripId, 10);
    const placeId = parseInt(req.params.placeId, 10);
    if (isNaN(tripId) || isNaN(placeId)) throw new NotFoundError('Place');

    const { activity_id } = req.body;
    const db = getDb();

    // Verify place belongs to trip
    const place = await db
      .select({ id: tripPlaces.id })
      .from(tripPlaces)
      .where(and(eq(tripPlaces.id, placeId), eq(tripPlaces.tripId, tripId)))
      .limit(1);
    if (!place.length) throw new NotFoundError('Place');

    // Check duplicate
    const existing = await db
      .select({ tripPlaceId: tripPlaceActivitiesMap.tripPlaceId })
      .from(tripPlaceActivitiesMap)
      .where(
        and(
          eq(tripPlaceActivitiesMap.tripPlaceId, placeId),
          eq(tripPlaceActivitiesMap.activityId, activity_id),
        ),
      )
      .limit(1);
    if (existing.length) throw new ConflictError('Activity already tagged to this place');

    await db.insert(tripPlaceActivitiesMap).values({ tripPlaceId: placeId, activityId: activity_id });

    res.status(201).json({ trip_place_id: placeId, activity_id });
  }),
);

// ----------------------------------------------------------------
// DELETE /api/trips/:tripId/places/:placeId/activities/:activityId
// ----------------------------------------------------------------
placesRouter.delete(
  '/:placeId/activities/:activityId',
  asyncHandler(async (req, res) => {
    const placeId = parseInt(req.params.placeId, 10);
    const activityId = parseInt(req.params.activityId, 10);
    if (isNaN(placeId) || isNaN(activityId)) throw new NotFoundError('Activity');

    const db = getDb();
    await db
      .delete(tripPlaceActivitiesMap)
      .where(
        and(
          eq(tripPlaceActivitiesMap.tripPlaceId, placeId),
          eq(tripPlaceActivitiesMap.activityId, activityId),
        ),
      );

    res.status(204).send();
  }),
);
