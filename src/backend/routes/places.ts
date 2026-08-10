/**
 * Travel Tracker — Places Router
 *
 * Nested under /api/trips/:tripId/places (mounted in trips.ts with mergeParams: true).
 * Handles place CRUD and place-level activity tagging.
 * All write endpoints verify trip ownership first, then reject writes to locked
 * trips with LockError (403) — see BUG-27. Lock checks either go through
 * placeRepository.assertWritable (ownership + lock) or run assertNotLocked
 * AFTER an ownership check (assertNotLocked itself is not user-scoped).
 *
 * ADL-18: User-scoped queries go through a repository — placeRepository for
 * places and their activity tags, itemRepository for the carry-forward source
 * items, referenceRepository for global city lookups. QUAL-43 Stage 4
 * (ADL-53 §3 item 1) made that literal rather than aspirational: this file holds
 * no database handle at all, which is why the wording changed from the original
 * "no direct calls for user-owned data" — the route layer now cannot reach the
 * ORM, scoped or otherwise, and `scripts/scope-completeness-check.sh` enforces it.
 */

import { Router } from 'express';
import { ConflictError, NotFoundError, ValidationError } from '../errors.js';
import { asyncHandler } from '../middleware/error-handler.js';
import { validateBody } from '../middleware/validate.js';
import { activityRepository } from '../repositories/activities.js';
import { itemRepository } from '../repositories/items.js';
import { placeRepository } from '../repositories/places.js';
import { referenceRepository } from '../repositories/reference.js';
import { assertNotLocked, executeCarryForward } from '../services/items.service.js';
import { CarryForwardBodySchema } from '../validation/items.schemas.js';
import {
  AddPlaceActivitySchema,
  CreatePlaceSchema,
  UpdatePlaceDatesSchema,
} from '../validation/places.schemas.js';

const placesRouter = Router({ mergeParams: true });
export default placesRouter;

// ----------------------------------------------------------------
// GET /api/trips/:tripId/places
// ----------------------------------------------------------------
// nosemgrep: travel-tracker.express-route-no-auth -- reason: requireAuth applied globally via app.use('/api/', requireAuth) in server.ts
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
        arrived_on: p.arrivedOn ?? null,
        departed_on: p.departedOn ?? null,
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
// nosemgrep: travel-tracker.express-route-no-auth -- reason: requireAuth applied globally via app.use('/api/', requireAuth) in server.ts
placesRouter.post(
  '/',
  validateBody(CreatePlaceSchema),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const tripId = parseInt(String(req.params.tripId), 10);
    if (Number.isNaN(tripId)) throw new NotFoundError('Trip');

    const { city_id, arrived_on, departed_on } = req.body;

    // Verify city exists. BUG-80: the repository read LEFT JOINs regions so this
    // response's city object also carries region_name/region_iso — same
    // city-shaped-payload consistency as every other route touched by this fix,
    // even though (per usePlaces.ts's useAddPlace) the frontend only reads
    // place.id/warnings off this response today and re-fetches trip detail for
    // display.
    const city = await referenceRepository.findCityWithRegion(city_id);
    if (!city) throw new NotFoundError('City');

    // placeRepository.create verifies trip ownership + lock status + duplicate check
    const place = await placeRepository.create(userId, tripId, city_id, arrived_on, departed_on);

    res.status(201).json({
      id: place.id,
      city_id: place.cityId,
      arrived_on: place.arrivedOn ?? null,
      departed_on: place.departedOn ?? null,
      created_at: place.createdAt,
      city: {
        id: city.id,
        name: city.name,
        country_code: city.countryCode,
        region_id: city.regionId,
        region_name: city.regionName,
        region_iso: city.regionIso,
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
// Removes a place from a trip (BUG-32). 204 on success; 404 if the place
// doesn't exist or isn't owned by the requesting user (via placeRepository's
// trip-ownership check); 403 if the parent trip is locked (BUG-27).
// Items previously logged under this place are reassigned to trip-level
// (trip_place_id = null), not deleted — see placeRepository.delete.
// nosemgrep: travel-tracker.express-route-no-auth -- reason: requireAuth applied globally via app.use('/api/', requireAuth) in server.ts
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
// PATCH /api/trips/:tripId/places/:placeId
// ----------------------------------------------------------------
// nosemgrep: travel-tracker.express-route-no-auth -- reason: requireAuth applied globally via app.use('/api/', requireAuth) in server.ts
placesRouter.patch(
  '/:placeId',
  validateBody(UpdatePlaceDatesSchema),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const tripId = parseInt(String(req.params.tripId), 10);
    const placeId = parseInt(String(req.params.placeId), 10);
    if (Number.isNaN(tripId) || Number.isNaN(placeId)) throw new NotFoundError('Place');

    const { arrived_on, departed_on, city_id } = req.body;

    // Ownership + lock verified before any read/mutation (audit invariant 17)
    await placeRepository.assertWritable(userId, tripId);

    const existing = await placeRepository.findById(userId, placeId);
    if (!existing || existing.tripId !== tripId) throw new NotFoundError('Place');

    // ADL-46 D11 (§4.4.2): re-pointing to a corrected city. Validate the target
    // city exists (global reference data — no owner/user scoping on cities), so a
    // bad city_id is a 404 rather than an FK error. Ownership is already enforced
    // on the place above, so this opens no new access surface.
    if (city_id !== undefined && city_id !== existing.cityId) {
      if (!(await referenceRepository.cityExists(city_id))) throw new NotFoundError('City');
    }

    // BUG-28: validate effective date order against the merged result — stored
    // values fill in for omitted fields (same pattern as trips PATCH / BUG-A).
    const effectiveArrivedOn = arrived_on !== undefined ? arrived_on : existing.arrivedOn;
    const effectiveDepartedOn = departed_on !== undefined ? departed_on : existing.departedOn;
    if (
      effectiveArrivedOn != null &&
      effectiveDepartedOn != null &&
      effectiveArrivedOn > effectiveDepartedOn
    ) {
      throw new ValidationError('departed_on must be on or after arrived_on');
    }

    const place = await placeRepository.updateDates(
      userId,
      tripId,
      placeId,
      arrived_on,
      departed_on,
      city_id,
    );

    res.json({
      id: place.id,
      trip_id: place.tripId,
      city_id: place.cityId,
      user_id: place.userId,
      arrived_on: place.arrivedOn ?? null,
      departed_on: place.departedOn ?? null,
      created_at: place.createdAt,
      updated_at: place.updatedAt,
    });
  }),
);

// ----------------------------------------------------------------
// POST /api/trips/:tripId/places/:placeId/carry-forward  (C1 — IT-07 execution)
// ----------------------------------------------------------------
// nosemgrep: travel-tracker.express-route-no-auth -- reason: requireAuth applied globally via app.use('/api/', requireAuth) in server.ts
placesRouter.post(
  '/:placeId/carry-forward',
  validateBody(CarryForwardBodySchema),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const tripId = parseInt(String(req.params.tripId), 10);
    const placeId = parseInt(String(req.params.placeId), 10);
    if (Number.isNaN(tripId) || Number.isNaN(placeId)) throw new NotFoundError('Place');

    // Verify placeId exists and belongs to tripId (also verifies trip ownership
    // via userId, then the lock). QUAL-43 Stage 4: assertWritable used to be a
    // separate call here followed by an inline read on a raw handle — it now
    // travels inside findInWritableTrip, in the same order, so the two cannot
    // drift apart.
    const place = await placeRepository.findInWritableTrip(userId, tripId, placeId);
    if (!place) throw new NotFoundError('Place');

    const { cityId } = place;

    // Verify target trip is not locked
    await assertNotLocked(tripId);

    // Verify all source item IDs exist and belong to the requesting user (SEC-02).
    // QUAL-43 Stage 4: the read moved into itemRepository and the ownership
    // predicate (composed from the chokepoint by Stage 3) travelled with it.
    const { source_item_ids: sourceItemIds } = req.body as { source_item_ids: number[] };
    const foundItemIds = await itemRepository.findOwnedIds(userId, sourceItemIds);

    if (foundItemIds.length !== sourceItemIds.length) {
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
// nosemgrep: travel-tracker.express-route-no-auth -- reason: requireAuth applied globally via app.use('/api/', requireAuth) in server.ts
placesRouter.post(
  '/:placeId/activities',
  validateBody(AddPlaceActivitySchema),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const tripId = parseInt(String(req.params.tripId), 10);
    const placeId = parseInt(String(req.params.placeId), 10);
    if (Number.isNaN(tripId) || Number.isNaN(placeId)) throw new NotFoundError('Place');

    const { activity_id } = req.body;

    // Verify place belongs to trip owned by user (ownership BEFORE lock check)
    const place = await placeRepository.findById(userId, placeId);
    if (!place || place.tripId !== tripId) throw new NotFoundError('Place');

    // ADL-46 §3.3 / F1(b): activities are per-user now, and the
    // trip_place_activities_map FK targets activities.id (no user dimension),
    // so SQLite cannot stop a caller tagging a place with ANOTHER user's
    // activity. Validate ownership in application code — the same 400 contract
    // replaceAssociations uses for trip-level associations. This is the half of
    // F1 that outlives the current table contents (a permanent write-path gap).
    const invalidActivityIds = await activityRepository.validateOwnership(userId, [activity_id]);
    if (invalidActivityIds.length) {
      throw new ValidationError(
        `Activity ID(s) not found or not owned by user: ${invalidActivityIds.join(', ')}`,
      );
    }

    // BUG-27: locked trips are read-only — activity tagging is a write
    await assertNotLocked(tripId);

    // Check duplicate. QUAL-43 Stage 4: both join-table operations moved into
    // placeRepository; the ownership assertion above (findById) did not move,
    // because it is what the relocated reads inherit their isolation from.
    if (await placeRepository.isActivityTagged(placeId, activity_id)) {
      throw new ConflictError('Activity already tagged to this place');
    }

    await placeRepository.addActivityTag(placeId, activity_id);

    res.status(201).json({ trip_place_id: placeId, activity_id });
  }),
);

// ----------------------------------------------------------------
// DELETE /api/trips/:tripId/places/:placeId/activities/:activityId
// ----------------------------------------------------------------
// nosemgrep: travel-tracker.express-route-no-auth -- reason: requireAuth applied globally via app.use('/api/', requireAuth) in server.ts
placesRouter.delete(
  '/:placeId/activities/:activityId',
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const placeId = parseInt(String(req.params.placeId), 10);
    const activityId = parseInt(String(req.params.activityId), 10);
    if (Number.isNaN(placeId) || Number.isNaN(activityId)) throw new NotFoundError('Activity');

    // SEC-03: verify the place belongs to the requesting user before deleting
    // (ownership BEFORE lock check — audit invariant 17)
    const place = await placeRepository.findById(userId, placeId);
    if (!place) throw new NotFoundError('Place');

    // BUG-27: locked trips are read-only — activity untagging is a write
    await assertNotLocked(place.tripId);

    await placeRepository.removeActivityTag(placeId, activityId);

    res.status(204).send();
  }),
);
