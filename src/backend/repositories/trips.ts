/**
 * Travel Tracker — Trips Repository
 *
 * Per ADL-18, all user-scoped trip queries go through this repository.
 * Every function scopes to userId — no user-owned row is returned or
 * mutated unless the userId matches.
 */

import { eq, desc, and, inArray } from 'drizzle-orm';
import {
  getDb,
  trips,
  tripCategoriesMap,
  tripCompanionsMap,
  tripActivitiesMap,
  tripCategories,
  companions,
  activities,
  tripPlaces,
  cities,
  countries,
  tripCountries,
} from '../db/index.js';
import type { Trip } from '../db/schema.js';
import { NotFoundError } from '../errors.js';

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------

export interface TripAssociations {
  categories: Array<{ id: number | null; name: string | null }>;
  companions: Array<{ id: number | null; name: string | null }>;
  activities: Array<{ id: number | null; name: string | null }>;
}

export interface TripFilters {
  status?: string;
  category_id?: number;
  activity_id?: number;
  country?: string;
}

// ----------------------------------------------------------------
// Repository
// ----------------------------------------------------------------

export const tripRepository = {
  /**
   * Returns all trips owned by userId, ordered by start_date desc.
   * Optional filters: status, category_id, activity_id.
   */
  async findAll(userId: string, filters?: TripFilters): Promise<Trip[]> {
    const db = getDb();

    let query = db
      .select()
      .from(trips)
      .where(eq(trips.userId, userId))
      .$dynamic();

    if (filters?.status) {
      query = query.where(and(eq(trips.userId, userId), eq(trips.status, filters.status)));
    }

    const allTrips = await query.orderBy(desc(trips.startDate));

    // Post-filter by category / activity (simpler than joins for this volume)
    let filtered = allTrips;

    if (filters?.category_id) {
      const catTrips = await db
        .select({ tripId: tripCategoriesMap.tripId })
        .from(tripCategoriesMap)
        .where(eq(tripCategoriesMap.categoryId, Number(filters.category_id)));
      const ids = new Set(catTrips.map((r) => r.tripId));
      filtered = filtered.filter((t) => ids.has(t.id));
    }

    if (filters?.activity_id) {
      const actTrips = await db
        .select({ tripId: tripActivitiesMap.tripId })
        .from(tripActivitiesMap)
        .where(eq(tripActivitiesMap.activityId, Number(filters.activity_id)));
      const ids = new Set(actTrips.map((r) => r.tripId));
      filtered = filtered.filter((t) => ids.has(t.id));
    }

    if (filters?.country) {
      const placeTrips = await db
        .select({ tripId: tripPlaces.tripId })
        .from(tripPlaces)
        .leftJoin(cities, eq(cities.id, tripPlaces.cityId))
        .where(eq(cities.countryCode, filters.country));
      const directTrips = await db
        .select({ tripId: tripCountries.tripId })
        .from(tripCountries)
        .where(eq(tripCountries.countryCode, filters.country));
      const ids = new Set([
        ...placeTrips.map((r) => r.tripId),
        ...directTrips.map((r) => r.tripId),
      ]);
      filtered = filtered.filter((t) => ids.has(t.id));
    }

    return filtered;
  },

  /**
   * Returns a single trip owned by userId, or null if not found / not owned.
   */
  async findById(userId: string, tripId: number): Promise<Trip | null> {
    const db = getDb();
    const rows = await db
      .select()
      .from(trips)
      .where(and(eq(trips.id, tripId), eq(trips.userId, userId)))
      .limit(1);
    return rows[0] ?? null;
  },

  /**
   * Finds a trip by ID and userId, throwing NotFoundError if not found.
   */
  async findByIdOrThrow(userId: string, tripId: number): Promise<Trip> {
    const trip = await this.findById(userId, tripId);
    if (!trip) throw new NotFoundError('Trip');
    return trip;
  },

  /**
   * Creates a new trip owned by userId. Returns the created trip row.
   */
  async create(
    userId: string,
    data: {
      name: string;
      startDate: string;
      endDate: string;
      photoAlbumRef?: string | null;
    },
  ): Promise<Trip> {
    const db = getDb();
    const now = new Date().toISOString();
    const inserted = await db
      .insert(trips)
      .values({
        name: data.name,
        startDate: data.startDate,
        endDate: data.endDate,
        photoAlbumRef: data.photoAlbumRef ?? null,
        userId,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return inserted[0];
  },

  /**
   * Updates a trip's scalar fields. Verifies ownership via userId.
   * Returns null if trip not found or not owned.
   */
  async update(
    userId: string,
    tripId: number,
    data: {
      name?: string;
      startDate?: string;
      endDate?: string;
      photoAlbumRef?: string | null;
      status?: string;
    },
  ): Promise<Trip | null> {
    const db = getDb();
    const now = new Date().toISOString();
    const updates: Partial<typeof trips.$inferInsert> = { updatedAt: now };
    if (data.name !== undefined) updates.name = data.name;
    if (data.startDate !== undefined) updates.startDate = data.startDate;
    if (data.endDate !== undefined) updates.endDate = data.endDate;
    if (data.photoAlbumRef !== undefined) updates.photoAlbumRef = data.photoAlbumRef;
    if (data.status !== undefined) updates.status = data.status;

    const updated = await db
      .update(trips)
      .set(updates)
      .where(and(eq(trips.id, tripId), eq(trips.userId, userId)))
      .returning();
    return updated[0] ?? null;
  },

  /**
   * Deletes a trip owned by userId.
   * Returns true if deleted, false if not found or not owned.
   */
  async delete(userId: string, tripId: number): Promise<boolean> {
    const db = getDb();
    const deleted = await db
      .delete(trips)
      .where(and(eq(trips.id, tripId), eq(trips.userId, userId)))
      .returning({ id: trips.id });
    return deleted.length > 0;
  },

  /**
   * Fetches categories, companions, and activities for a trip.
   * No userId scoping needed — associations are on junction tables that
   * cascade from the trip (which is already userId-scoped by the caller).
   */
  async getAssociations(tripId: number): Promise<TripAssociations> {
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
  },

  /**
   * Replaces all M2M associations for a trip (delete + reinsert).
   * Pass undefined for a collection to leave it unchanged.
   */
  async replaceAssociations(
    tripId: number,
    categoryIds?: number[],
    companionIds?: number[],
    activityIds?: number[],
  ): Promise<void> {
    const db = getDb();

    if (categoryIds !== undefined) {
      await db.delete(tripCategoriesMap).where(eq(tripCategoriesMap.tripId, tripId));
      if (categoryIds.length) {
        await db
          .insert(tripCategoriesMap)
          .values(categoryIds.map((id) => ({ tripId, categoryId: id })));
      }
    }
    if (companionIds !== undefined) {
      await db.delete(tripCompanionsMap).where(eq(tripCompanionsMap.tripId, tripId));
      if (companionIds.length) {
        await db
          .insert(tripCompanionsMap)
          .values(companionIds.map((id) => ({ tripId, companionId: id })));
      }
    }
    if (activityIds !== undefined) {
      await db.delete(tripActivitiesMap).where(eq(tripActivitiesMap.tripId, tripId));
      if (activityIds.length) {
        await db
          .insert(tripActivitiesMap)
          .values(activityIds.map((id) => ({ tripId, activityId: id })));
      }
    }
  },

  /**
   * Fetches trip_places with joined city data for a trip.
   * The trip is already userId-scoped by the caller.
   */
  async getPlaces(tripId: number) {
    const db = getDb();
    return db
      .select({
        id: tripPlaces.id,
        cityId: tripPlaces.cityId,
        createdAt: tripPlaces.createdAt,
        cityName: cities.name,
        cityCountryCode: cities.countryCode,
        cityCountryName: countries.name,
        cityRegionId: cities.regionId,
        cityLatitude: cities.latitude,
        cityLongitude: cities.longitude,
        cityGeocodeStatus: cities.geocodeStatus,
      })
      .from(tripPlaces)
      .leftJoin(cities, eq(cities.id, tripPlaces.cityId))
      .leftJoin(countries, eq(countries.countryCode, cities.countryCode))
      .where(eq(tripPlaces.tripId, tripId));
  },

  /**
   * Fetches the explicit country associations for a trip (from trip_countries).
   */
  async getCountries(tripId: number): Promise<{ country_code: string; name: string }[]> {
    const db = getDb();
    const rows = await db
      .select({ country_code: countries.countryCode, name: countries.name })
      .from(tripCountries)
      .leftJoin(countries, eq(countries.countryCode, tripCountries.countryCode))
      .where(eq(tripCountries.tripId, tripId))
      .orderBy(countries.name);
    return rows.map((r) => ({ country_code: r.country_code!, name: r.name! }));
  },

  /**
   * Replaces all country associations for a trip (delete + reinsert).
   */
  async setCountries(tripId: number, codes: string[]): Promise<void> {
    const db = getDb();
    await db.delete(tripCountries).where(eq(tripCountries.tripId, tripId));
    if (codes.length) {
      await db.insert(tripCountries).values(codes.map((c) => ({ tripId, countryCode: c })));
    }
  },

  /**
   * Adds country associations for a trip (insert-or-ignore).
   */
  async addCountries(tripId: number, codes: string[]): Promise<void> {
    if (!codes.length) return;
    const db = getDb();
    await db
      .insert(tripCountries)
      .values(codes.map((c) => ({ tripId, countryCode: c })))
      .onConflictDoNothing();
  },

  /**
   * Removes a single country association from a trip.
   * Returns true if a row was deleted, false if not found.
   */
  async removeCountry(tripId: number, code: string): Promise<boolean> {
    const db = getDb();
    const result = await db
      .delete(tripCountries)
      .where(and(eq(tripCountries.tripId, tripId), eq(tripCountries.countryCode, code)));
    return (result.rowsAffected ?? 0) > 0;
  },
};
