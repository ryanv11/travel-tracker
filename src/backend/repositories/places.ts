/**
 * Travel Tracker — Places Repository
 *
 * Per ADL-18, all user-scoped place queries go through this repository.
 * Ownership is verified by joining through trip_places → trips → user_id.
 */

import { and, eq, inArray } from 'drizzle-orm';
import {
  activities,
  cities,
  getDb,
  items,
  regions,
  tripPlaceActivitiesMap,
  tripPlaces,
  trips,
} from '../db/index.js';
import type { TripPlace } from '../db/schema.js';
import { ConflictError, NotFoundError } from '../errors.js';
import { assertWritable as assertTripWritable, scopeToUser } from './scope.js';

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------

export interface PlaceWithCity {
  id: number;
  cityId: number;
  arrivedOn: string | null;
  departedOn: string | null;
  createdAt: string;
  city: {
    id: number;
    name: string | null;
    country_code: string | null;
    region_id: number | null;
    // BUG-80: this standalone endpoint (GET /api/trips/:tripId/places) had no
    // frontend consumer at the time of the fix (confirmed by two probes — a
    // repo-wide grep for a hook wrapping this path, and a full read of
    // usePlaces.ts) — added anyway, for the same reason GET /api/cities/:id
    // was fixed despite also having no direct region-rendering consumer: it
    // is a city-shaped payload, and the whole point of this brief is that
    // every one of them carries the same fields consistently rather than
    // some silently lagging until the next bug report.
    region_iso: string | null;
    region_name: string | null;
    latitude: number | null;
    longitude: number | null;
    geocode_status: string | null;
  };
  activities: Array<{ id: number | null; name: string | null }>;
}

// ----------------------------------------------------------------
// Repository
// ----------------------------------------------------------------

export const placeRepository = {
  /**
   * Returns all places for a trip, verified to be owned by userId.
   * Throws NotFoundError if the trip doesn't exist or isn't owned by userId.
   */
  async findByTrip(userId: string, tripId: number): Promise<PlaceWithCity[]> {
    const db = getDb();

    // Verify trip ownership
    const tripRows = await db
      .select({ id: trips.id })
      .from(trips)
      .where(and(eq(trips.id, tripId), scopeToUser(trips, userId)))
      .limit(1);
    if (!tripRows.length) throw new NotFoundError('Trip');

    const placesRows = await db
      .select({
        id: tripPlaces.id,
        cityId: tripPlaces.cityId,
        arrivedOn: tripPlaces.arrivedOn,
        departedOn: tripPlaces.departedOn,
        createdAt: tripPlaces.createdAt,
        cityName: cities.name,
        cityCountryCode: cities.countryCode,
        cityRegionId: cities.regionId,
        cityRegionIso: regions.iso3166_2,
        cityRegionName: regions.name,
        cityLatitude: cities.latitude,
        cityLongitude: cities.longitude,
        cityGeocodeStatus: cities.geocodeStatus,
      })
      .from(tripPlaces)
      .leftJoin(cities, eq(cities.id, tripPlaces.cityId))
      .leftJoin(regions, eq(regions.id, cities.regionId))
      .where(eq(tripPlaces.tripId, tripId));

    const placeIds = placesRows.map((p) => p.id);
    const allPlaceActivities =
      placeIds.length > 0
        ? await db
            .select({
              tripPlaceId: tripPlaceActivitiesMap.tripPlaceId,
              id: activities.id,
              name: activities.name,
            })
            .from(tripPlaceActivitiesMap)
            .leftJoin(activities, eq(activities.id, tripPlaceActivitiesMap.activityId))
            .where(inArray(tripPlaceActivitiesMap.tripPlaceId, placeIds))
        : [];

    return placesRows.map((p) => ({
      id: p.id,
      cityId: p.cityId,
      arrivedOn: p.arrivedOn ?? null,
      departedOn: p.departedOn ?? null,
      createdAt: p.createdAt,
      city: {
        id: p.cityId,
        name: p.cityName,
        country_code: p.cityCountryCode,
        region_id: p.cityRegionId,
        region_iso: p.cityRegionIso ?? null,
        region_name: p.cityRegionName ?? null,
        latitude: p.cityLatitude,
        longitude: p.cityLongitude,
        geocode_status: p.cityGeocodeStatus,
      },
      activities: allPlaceActivities
        .filter((a) => a.tripPlaceId === p.id)
        .map((a) => ({ id: a.id, name: a.name })),
    }));
  },

  /**
   * Returns a single place row (raw TripPlace) if it belongs to a trip
   * owned by userId. Returns null if not found or not owned.
   */
  async findById(userId: string, placeId: number): Promise<TripPlace | null> {
    const db = getDb();
    const rows = await db
      .select({ p: tripPlaces })
      .from(tripPlaces)
      .innerJoin(trips, and(eq(trips.id, tripPlaces.tripId), scopeToUser(trips, userId)))
      .where(eq(tripPlaces.id, placeId))
      .limit(1);
    return rows[0]?.p ?? null;
  },

  /**
   * Creates a new place on a trip owned by userId.
   * Verifies the trip is writable (exists, owned, not locked) before inserting.
   * Throws ConflictError if the city already exists on the trip.
   */
  async create(
    userId: string,
    tripId: number,
    cityId: number,
    arrivedOn?: string | null,
    departedOn?: string | null,
  ): Promise<TripPlace> {
    await this.assertWritable(userId, tripId);

    const db = getDb();

    // Check for duplicate (trip_id, city_id) unique constraint
    const existing = await db
      .select({ id: tripPlaces.id })
      .from(tripPlaces)
      .where(and(eq(tripPlaces.tripId, tripId), eq(tripPlaces.cityId, cityId)))
      .limit(1);
    if (existing.length) throw new ConflictError('Trip already has this city');

    const now = new Date().toISOString();
    const inserted = await db
      .insert(tripPlaces)
      .values({
        tripId,
        cityId,
        userId,
        arrivedOn: arrivedOn ?? null,
        departedOn: departedOn ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return inserted[0];
  },

  /**
   * Deletes a place. Verifies the parent trip is writable and the place belongs to it.
   * Returns true if deleted, false if not found.
   *
   * BUG-32: items logged under this place (items.trip_place_id) are reassigned to
   * trip-level (trip_place_id = NULL) rather than cascade-deleted. NULL is already a
   * valid, meaningful state for trip_place_id — schema.ts documents it as "trip-level
   * items ... not tied to a specific city" — so this preserves logged items (flights,
   * hotels, ratings, notes) instead of silently destroying user data as a side effect
   * of removing a place from the itinerary. The reassignment and the place delete are
   * batched atomically via db.batch() (not db.transaction() — see
   * tripRepository.replaceAssociations for why transaction() is unsafe with libSQL
   * :memory: clients used in tests).
   */
  async delete(userId: string, tripId: number, placeId: number): Promise<boolean> {
    await this.assertWritable(userId, tripId);

    const db = getDb();
    const existing = await db
      .select({ id: tripPlaces.id })
      .from(tripPlaces)
      .where(and(eq(tripPlaces.id, placeId), eq(tripPlaces.tripId, tripId)))
      .limit(1);
    if (!existing.length) return false;

    await db.batch([
      db.update(items).set({ tripPlaceId: null }).where(eq(items.tripPlaceId, placeId)),
      db.delete(tripPlaces).where(eq(tripPlaces.id, placeId)),
    ]);
    return true;
  },

  /**
   * Updates arrived_on/departed_on on a specific place.
   * Verifies the parent trip is writable and the place belongs to it.
   * Returns the updated TripPlace row.
   * Throws NotFoundError if the place doesn't exist on the given trip.
   *
   * BUG-28: PATCH semantics — `undefined` (field omitted) leaves the stored
   * value unchanged; explicit `null` clears it. Matches tripRepository.update.
   */
  async updateDates(
    userId: string,
    tripId: number,
    placeId: number,
    arrivedOn?: string | null,
    departedOn?: string | null,
    cityId?: number,
  ): Promise<TripPlace> {
    await this.assertWritable(userId, tripId);

    const db = getDb();

    const existing = await db
      .select({ id: tripPlaces.id })
      .from(tripPlaces)
      .where(and(eq(tripPlaces.id, placeId), eq(tripPlaces.tripId, tripId)))
      .limit(1);
    if (!existing.length) throw new NotFoundError('Place');

    const now = new Date().toISOString();
    const updates: Partial<typeof tripPlaces.$inferInsert> = { updatedAt: now };
    if (arrivedOn !== undefined) updates.arrivedOn = arrivedOn;
    if (departedOn !== undefined) updates.departedOn = departedOn;
    // ADL-46 D11 (§4.4.2): re-point a place to a different city — the escape
    // hatch for a mistyped/wrong city. The correction happens at the PLACE level
    // (place ownership already checked), never by writing to a shared city row.
    // Items and place-level activity tags hang off trip_place_id, which does not
    // change, so re-pointing preserves them (unlike delete-and-re-add).
    if (cityId !== undefined) updates.cityId = cityId;

    const updated = await db
      .update(tripPlaces)
      .set(updates)
      .where(eq(tripPlaces.id, placeId))
      .returning();
    return updated[0];
  },

  /**
   * Asserts a trip exists, is owned by userId, and is not locked.
   * Throws NotFoundError (404) or LockError (403) as appropriate.
   *
   * Used directly by route handlers that need to verify writeability before
   * any nested operation (carry-forward, activity tagging, etc.).
   *
   * ADL-53 Stage 0 (F1): ownership is no longer re-derived here. It is delegated
   * to the chokepoint's assertion helper, which expresses it as an existence
   * check composed from `scopeToUser` — so this write gate and every read share
   * one definition of "owned". Behaviour is unchanged: a trip owned by another
   * user is indistinguishable from a missing one (404, opaque per SE-05), and a
   * non-owner never learns that a trip is locked.
   */
  async assertWritable(userId: string, tripId: number): Promise<void> {
    await assertTripWritable(userId, tripId);
  },
};
