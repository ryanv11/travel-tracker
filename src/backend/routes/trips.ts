/**
 * Travel Tracker — Trips Router
 *
 * Handles all trip CRUD and status transition endpoints.
 * Items and places routers are nested here via mergeParams: true.
 *
 * Status transition rules (TR-06, TR-07) are enforced by validateTransition().
 * Locked trip writes return 403 LockError.
 *
 * ADL-18: All user-scoped queries go through tripRepository. No direct getDb()
 * calls for user-owned data.
 */

import { Router } from 'express';
import { eq, inArray } from 'drizzle-orm';
import {
  getDb,
  activities,
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
import { tripRepository } from '../repositories/trips.js';
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

/** Build the standard trip response shape (list item — minimal places for city pins) */
async function buildTripResponse(
  trip: { id: number; name: string; startDate: string; endDate: string; status: string; photoAlbumRef: string | null; createdAt: string; updatedAt: string },
) {
  const [assoc, placesRows] = await Promise.all([
    tripRepository.getAssociations(trip.id),
    tripRepository.getPlaces(trip.id),
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
    const userId = req.user!.id;
    const { status, category_id, activity_id } = req.query as {
      status?: string;
      category_id?: number;
      activity_id?: number;
    };

    const allTrips = await tripRepository.findAll(userId, { status, category_id, activity_id });

    const result = await Promise.all(allTrips.map(buildTripResponse));
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
    const userId = req.user!.id;
    const { name, start_date, end_date, photo_album_ref, category_ids, companion_ids, activity_ids } =
      req.body;

    const trip = await tripRepository.create(userId, {
      name,
      startDate: start_date,
      endDate: end_date,
      photoAlbumRef: photo_album_ref,
    });

    await tripRepository.replaceAssociations(trip.id, category_ids ?? [], companion_ids ?? [], activity_ids ?? []);

    res.status(201).json(await buildTripResponse(trip));
  }),
);

// ----------------------------------------------------------------
// GET /api/trips/:id
// ----------------------------------------------------------------
tripsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const tripId = parseInt(req.params.id, 10);
    if (isNaN(tripId)) throw new NotFoundError('Trip');

    const trip = await tripRepository.findByIdOrThrow(userId, tripId);
    const assoc = await tripRepository.getAssociations(tripId);

    const db = getDb();

    // Load places with their cities
    const placesRows = await tripRepository.getPlaces(tripId);

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

    // Load all items for the trip with extension fields (scoped to userId)
    const { and: drizzleAnd, eq: drizzleEq } = await import('drizzle-orm');
    const { items } = await import('../db/index.js');
    const tripItemsCondition = drizzleAnd(
      drizzleEq(items.tripId, tripId),
      drizzleEq(items.userId, userId),
    );
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
    const userId = req.user!.id;
    const tripId = parseInt(req.params.id, 10);
    if (isNaN(tripId)) throw new NotFoundError('Trip');

    const trip = await tripRepository.findByIdOrThrow(userId, tripId);
    if (trip.status === 'locked') throw new LockError();

    const { name, start_date, end_date, photo_album_ref, category_ids, companion_ids, activity_ids } =
      req.body;

    const updated = await tripRepository.update(userId, tripId, {
      name,
      startDate: start_date,
      endDate: end_date,
      photoAlbumRef: photo_album_ref,
    });

    await tripRepository.replaceAssociations(tripId, category_ids, companion_ids, activity_ids);

    res.json(await buildTripResponse(updated!));
  }),
);

// ----------------------------------------------------------------
// PATCH /api/trips/:id/status
// ----------------------------------------------------------------
tripsRouter.patch(
  '/:id/status',
  validateBody(UpdateTripStatusSchema),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const tripId = parseInt(req.params.id, 10);
    if (isNaN(tripId)) throw new NotFoundError('Trip');

    const trip = await tripRepository.findByIdOrThrow(userId, tripId);
    const { status } = req.body;

    validateTransition(trip.status, status);

    const updated = await tripRepository.update(userId, tripId, { status });

    res.json(await buildTripResponse(updated!));
  }),
);

// ----------------------------------------------------------------
// PATCH /api/trips/:id/lock  (convenience alias)
// ----------------------------------------------------------------
tripsRouter.patch(
  '/:id/lock',
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const tripId = parseInt(req.params.id, 10);
    if (isNaN(tripId)) throw new NotFoundError('Trip');

    const trip = await tripRepository.findByIdOrThrow(userId, tripId);
    if (trip.status === 'locked') {
      throw new ValidationError('Trip is already locked');
    }

    validateTransition(trip.status, 'locked');

    const updated = await tripRepository.update(userId, tripId, { status: 'locked' });

    res.json(await buildTripResponse(updated!));
  }),
);

// ----------------------------------------------------------------
// PATCH /api/trips/:id/unlock  (convenience alias → review_pending)
// ----------------------------------------------------------------
tripsRouter.patch(
  '/:id/unlock',
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const tripId = parseInt(req.params.id, 10);
    if (isNaN(tripId)) throw new NotFoundError('Trip');

    const trip = await tripRepository.findByIdOrThrow(userId, tripId);
    if (trip.status !== 'locked') {
      throw new ValidationError('Trip is not locked');
    }

    const updated = await tripRepository.update(userId, tripId, { status: 'review_pending' });

    res.json(await buildTripResponse(updated!));
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
    const userId = req.user!.id;

    // Verify the trip exists and belongs to this user; throw 404 if not found
    await tripRepository.findByIdOrThrow(userId, tripId);

    // Delete the trip — CASCADE handles all related child records
    await tripRepository.delete(userId, tripId);

    // 204 No Content — no body on successful delete
    res.status(204).send();
  }),
);

export default tripsRouter;
