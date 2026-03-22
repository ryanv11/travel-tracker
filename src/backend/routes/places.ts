/**
 * Travel Tracker — Places Router
 *
 * Nested under /api/trips/:tripId/places (mounted in trips.ts with mergeParams: true).
 * Handles place CRUD and place-level activity tagging.
 * All writes check locked trip status.
 *
 * ADL-18: User-scoped queries go through placeRepository. No direct getDb() calls
 * for user-owned data.
 */

import { and, eq, inArray } from 'drizzle-orm';
import { Router } from 'express';
import { cities, getDb, items, tripPlaceActivitiesMap, tripPlaces } from '../db/index.js';
import { ConflictError, NotFoundError, ValidationError } from '../errors.js';
import { asyncHandler } from '../middleware/error-handler.js';
import { validateBody } from '../middleware/validate.js';
import { placeRepository } from '../repositories/places.js';
import { assertNotLocked, executeCarryForward } from '../services/items.service.js';
import { CarryForwardBodySchema } from '../validation/items.schemas.js';
import { AddPlaceActivitySchema, CreatePlaceSchema } from '../validation/places.schemas.js';

const placesRouter = Router({ mergeParams: true });
export default placesRouter;

// ----------------------------------------------------------------
// GET /api/trips/:tripId/places
// ----------------------------------------------------------------
placesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const tripId = parseInt(String(req.params.tripId), 10);
    if (Number.isNaN(tripId)) throw new NotFoundError('Trip');

    const result = await placeRepository.findByTrip(userId, tripId);

    res.json(
      result.map((p) => ({
        id: p.id,
        city_id: p.cityId,
        created_at: p.createdAt,
        city: p.city,
        activities: p.activities,
      })),
    );
  }),
);

// ----------------------------------------------------------------
// POST /api/trips/:tripId/places
// ----------------------------------------------------------------
placesRouter.post(
  '/',
  validateBody(CreatePlaceSchema),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const tripId = parseInt(String(req.params.tripId), 10);
    if (Number.isNaN(tripId)) throw new NotFoundError('Trip');

    const { city_id } = req.body;
    const db = getDb();

    // Verify city exists
    const cityRows = await db.select().from(cities).where(eq(cities.id, city_id)).limit(1);
    if (!cityRows.length) throw new NotFoundError('City');

    // placeRepository.create verifies trip ownership + lock status + duplicate check
    const place = await placeRepository.create(userId, tripId, city_id);
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
    const userId = req.user!.id;
    const tripId = parseInt(String(req.params.tripId), 10);
    const placeId = parseInt(String(req.params.placeId), 10);
    if (Number.isNaN(tripId) || Number.isNaN(placeId)) throw new NotFoundError('Place');

    const deleted = await placeRepository.delete(userId, tripId, placeId);
    if (!deleted) throw new NotFoundError('Place');

    res.status(204).send();
  }),
);

// ----------------------------------------------------------------
// POST /api/trips/:tripId/places/:placeId/carry-forward  (C1 — IT-07 execution)
// ----------------------------------------------------------------
placesRouter.post(
  '/:placeId/carry-forward',
  validateBody(CarryForwardBodySchema),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const tripId = parseInt(String(req.params.tripId), 10);
    const placeId = parseInt(String(req.params.placeId), 10);
    if (Number.isNaN(tripId) || Number.isNaN(placeId)) throw new NotFoundError('Place');

    const db = getDb();

    // Verify placeId exists and belongs to tripId (also verifies trip ownership via userId)
    await placeRepository.assertWritable(userId, tripId);

    const placeRows = await db
      .select({ id: tripPlaces.id, cityId: tripPlaces.cityId })
      .from(tripPlaces)
      .where(and(eq(tripPlaces.id, placeId), eq(tripPlaces.tripId, tripId)))
      .limit(1);
    if (!placeRows.length) throw new NotFoundError('Place');

    const { cityId } = placeRows[0];

    // Verify target trip is not locked
    await assertNotLocked(tripId);

    // Verify all source item IDs exist and belong to the requesting user (SEC-02)
    const { source_item_ids: sourceItemIds } = req.body as { source_item_ids: number[] };
    const foundItems = await db
      .select({ id: items.id })
      .from(items)
      .where(and(inArray(items.id, sourceItemIds), eq(items.userId, userId)));

    if (foundItems.length !== sourceItemIds.length) {
      throw new ValidationError('One or more source_item_ids do not exist');
    }

    // Execute carry-forward
    const createdIds = await executeCarryForward({
      sourceCityId: cityId,
      targetTripId: tripId,
      targetTripPlaceId: placeId,
      sourceItemIds,
      userId,
    });

    res.status(201).json({
      created_item_ids: createdIds,
      count: createdIds.length,
    });
  }),
);

// ----------------------------------------------------------------
// POST /api/trips/:tripId/places/:placeId/activities
// ----------------------------------------------------------------
placesRouter.post(
  '/:placeId/activities',
  validateBody(AddPlaceActivitySchema),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const tripId = parseInt(String(req.params.tripId), 10);
    const placeId = parseInt(String(req.params.placeId), 10);
    if (Number.isNaN(tripId) || Number.isNaN(placeId)) throw new NotFoundError('Place');

    const { activity_id } = req.body;
    const db = getDb();

    // Verify place belongs to trip owned by user
    const place = await placeRepository.findById(userId, placeId);
    if (!place || place.tripId !== tripId) throw new NotFoundError('Place');

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

    await db
      .insert(tripPlaceActivitiesMap)
      .values({ tripPlaceId: placeId, activityId: activity_id });

    res.status(201).json({ trip_place_id: placeId, activity_id });
  }),
);

// ----------------------------------------------------------------
// DELETE /api/trips/:tripId/places/:placeId/activities/:activityId
// ----------------------------------------------------------------
placesRouter.delete(
  '/:placeId/activities/:activityId',
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const placeId = parseInt(String(req.params.placeId), 10);
    const activityId = parseInt(String(req.params.activityId), 10);
    if (Number.isNaN(placeId) || Number.isNaN(activityId)) throw new NotFoundError('Activity');

    // SEC-03: verify the place belongs to the requesting user before deleting
    const place = await placeRepository.findById(userId, placeId);
    if (!place) throw new NotFoundError('Place');

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
