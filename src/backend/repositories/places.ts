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
  tripPlaceActivitiesMap,
  tripPlaces,
  trips,
} from '../db/index.js';
import type { TripPlace } from '../db/schema.js';
import { ConflictError, LockError, NotFoundError } from '../errors.js';

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
      .where(and(eq(trips.id, tripId), eq(trips.userId, userId)))
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
        cityLatitude: cities.latitude,
        cityLongitude: cities.longitude,
        cityGeocodeStatus: cities.geocodeStatus,
      })
      .from(tripPlaces)
      .leftJoin(cities, eq(cities.id, tripPlaces.cityId))
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
      .innerJoin(trips, and(eq(trips.id, tripPlaces.tripId), eq(trips.userId, userId)))
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

    await db.delete(tripPlaces).where(eq(tripPlaces.id, placeId));
    return true;
  },

  /**
   * Updates arrived_on/departed_on on a specific place.
   * Verifies the parent trip is writable and the place belongs to it.
   * Returns the updated TripPlace row.
   * Throws NotFoundError if the place doesn't exist on the given trip.
   */
  async updateDates(
    userId: string,
    tripId: number,
    placeId: number,
    arrivedOn?: string | null,
    departedOn?: string | null,
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
    const updated = await db
      .update(tripPlaces)
      .set({ arrivedOn: arrivedOn ?? null, departedOn: departedOn ?? null, updatedAt: now })
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
   */
  async assertWritable(userId: string, tripId: number): Promise<void> {
    const db = getDb();
    const rows = await db
      .select({ status: trips.status, userId: trips.userId })
      .from(trips)
      .where(eq(trips.id, tripId))
      .limit(1);
    if (!rows.length) throw new NotFoundError('Trip');
    if (rows[0].userId !== userId) throw new NotFoundError('Trip');
    if (rows[0].status === 'locked') throw new LockError();
  },
};
