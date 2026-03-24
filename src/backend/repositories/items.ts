/**
 * Travel Tracker — Items Repository
 *
 * Per ADL-18, all user-scoped item queries go through this repository.
 * Ownership is verified by joining through items → trips → user_id.
 * Extension helpers delegate to the items.service for lock checks.
 */

import type { SQL } from 'drizzle-orm';
import { and, eq } from 'drizzle-orm';
import {
  getDb,
  itemCarRentals,
  itemExperiences,
  itemFlights,
  itemHotels,
  itemRestaurants,
  items,
} from '../db/index.js';
import type { Item } from '../db/schema.js';
import { NotFoundError } from '../errors.js';
import { fetchItemsWithExtensions } from '../routes/items-helper.js';
import { ensureExperienceExtension } from '../services/items.service.js';

// ----------------------------------------------------------------
// Repository
// ----------------------------------------------------------------

export const itemRepository = {
  /**
   * Returns all items for a trip (scoped to userId) with extension fields.
   * Optionally filters by placeId, itemType, or status.
   */
  async findByTrip(
    userId: string,
    tripId: number,
    filters?: {
      placeId?: number;
      type?: string;
      status?: string;
      sortBy?: 'rating';
      sortOrder?: 'asc' | 'desc';
      minRating?: number;
    },
  ): Promise<Record<string, unknown>[]> {
    const { and: drizzleAnd, eq: drizzleEq } = await import('drizzle-orm');

    const conditions: SQL[] = [drizzleEq(items.tripId, tripId), drizzleEq(items.userId, userId)];
    if (filters?.placeId) conditions.push(drizzleEq(items.tripPlaceId, Number(filters.placeId)));
    if (filters?.type) conditions.push(drizzleEq(items.itemType, filters.type));
    if (filters?.status) conditions.push(drizzleEq(items.status, filters.status));

    return fetchItemsWithExtensions(drizzleAnd(...conditions), {
      sortBy: filters?.sortBy,
      sortOrder: filters?.sortOrder,
      minRating: filters?.minRating,
    });
  },

  /**
   * Returns a single item with extensions, scoped to userId via trip ownership.
   * Returns null if not found or not owned.
   */
  async findById(userId: string, itemId: number): Promise<Record<string, unknown> | null> {
    const { and: drizzleAnd, eq: drizzleEq } = await import('drizzle-orm');
    const results = await fetchItemsWithExtensions(
      drizzleAnd(drizzleEq(items.id, itemId), drizzleEq(items.userId, userId)),
    );
    return results[0] ?? null;
  },

  /**
   * Verifies item exists and belongs to a trip owned by userId.
   * Returns the raw Item row (base table only).
   * Throws NotFoundError if not found or not owned.
   */
  async findRawByIdOrThrow(userId: string, tripId: number, itemId: number): Promise<Item> {
    const db = getDb();
    const rows = await db
      .select()
      .from(items)
      .where(and(eq(items.id, itemId), eq(items.tripId, tripId), eq(items.userId, userId)))
      .limit(1);
    if (!rows.length) throw new NotFoundError('Item');
    return rows[0];
  },

  /**
   * Creates a new item on a trip owned by userId. Returns the created item
   * with extension fields merged in.
   */
  async create(
    userId: string,
    tripId: number,
    data: {
      tripPlaceId?: number | null;
      itemType: string;
      status?: string;
      notes?: string | null;
      isCarriedForward?: boolean;
      carriedFromItemId?: number | null;
    },
    extensionBody: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const db = getDb();
    const now = new Date().toISOString();

    const inserted = await db
      .insert(items)
      .values({
        tripId,
        tripPlaceId: data.tripPlaceId ?? null,
        itemType: data.itemType,
        status: data.status ?? 'consider',
        notes: data.notes ?? null,
        isCarriedForward: data.isCarriedForward ? 1 : 0,
        carriedFromItemId: data.carriedFromItemId ?? null,
        userId,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const item = inserted[0];
    await insertExtension(item.id, data.itemType, extensionBody);

    const { eq: drizzleEq } = await import('drizzle-orm');
    const result = await fetchItemsWithExtensions(drizzleEq(items.id, item.id));
    return result[0];
  },

  /**
   * Updates an item's base fields and extension row.
   * Verifies ownership via userId + tripId.
   * Returns the updated item with extensions, or null if not found.
   */
  async update(
    userId: string,
    tripId: number,
    itemId: number,
    data: {
      status?: string;
      notes?: string | null;
    },
    extensionBody: Record<string, unknown>,
    itemType: string,
  ): Promise<Record<string, unknown> | null> {
    const db = getDb();
    const now = new Date().toISOString();

    const baseUpdates: Partial<typeof items.$inferInsert> = { updatedAt: now };
    if (data.status !== undefined) baseUpdates.status = data.status;
    if (data.notes !== undefined) baseUpdates.notes = data.notes;

    await db
      .update(items)
      .set(baseUpdates)
      .where(and(eq(items.id, itemId), eq(items.tripId, tripId), eq(items.userId, userId)));

    await updateExtension(itemType, itemId, extensionBody);

    const { eq: drizzleEq } = await import('drizzle-orm');
    const result = await fetchItemsWithExtensions(drizzleEq(items.id, itemId));
    return result[0] ?? null;
  },

  /**
   * Deletes an item. Verifies ownership via userId + tripId.
   * Returns true if deleted, false if not found or not owned.
   */
  async delete(userId: string, tripId: number, itemId: number): Promise<boolean> {
    const db = getDb();
    const deleted = await db
      .delete(items)
      .where(and(eq(items.id, itemId), eq(items.tripId, tripId), eq(items.userId, userId)))
      .returning({ id: items.id });
    return deleted.length > 0;
  },
};

// ----------------------------------------------------------------
// Extension row helpers (internal to this repository)
// ----------------------------------------------------------------

/** Inserts the type-specific extension row for a new item. */
async function insertExtension(
  itemId: number,
  itemType: string,
  body: Record<string, unknown>,
): Promise<void> {
  const db = getDb();

  switch (itemType) {
    case 'flight':
      await db.insert(itemFlights).values({
        itemId,
        airline: (body.airline as string) ?? null,
        flightNumber: (body.flight_number as string) ?? null,
        departureAirport: (body.departure_airport as string) ?? null,
        arrivalAirport: (body.arrival_airport as string) ?? null,
        departureDatetime: (body.departure_datetime as string) ?? null,
        arrivalDatetime: (body.arrival_datetime as string) ?? null,
        bookingReference: (body.booking_reference as string) ?? null,
        seat: (body.seat as string) ?? null,
      });
      break;
    case 'hotel':
      await db.insert(itemHotels).values({
        itemId,
        propertyName: (body.property_name as string) ?? null,
        address: (body.address as string) ?? null,
        checkInDate: (body.check_in_date as string) ?? null,
        checkOutDate: (body.check_out_date as string) ?? null,
        bookingReference: (body.booking_reference as string) ?? null,
        confirmationNumber: (body.confirmation_number as string) ?? null,
        // rating and post_visit_notes NOT set on create
      });
      break;
    case 'car_rental':
      await db.insert(itemCarRentals).values({
        itemId,
        provider: (body.provider as string) ?? null,
        pickupLocation: (body.pickup_location as string) ?? null,
        dropoffLocation: (body.dropoff_location as string) ?? null,
        pickupDatetime: (body.pickup_datetime as string) ?? null,
        dropoffDatetime: (body.dropoff_datetime as string) ?? null,
        bookingReference: (body.booking_reference as string) ?? null,
        vehicleClass: (body.vehicle_class as string) ?? null,
      });
      break;
    case 'restaurant':
      await db.insert(itemRestaurants).values({
        itemId,
        name: (body.name as string) ?? null,
        neighbourhoodArea: (body.neighbourhood_area as string) ?? null,
        cuisineType: (body.cuisine_type as string) ?? null,
        source: (body.source as string) ?? null,
        // rating and post_visit_notes NOT set on create
      });
      break;
    case 'experience':
      // ADL-14: lazy creation on first rating — do not create row on insert
      break;
    default:
      break;
  }
}

/** Updates the type-specific extension row for an existing item. */
async function updateExtension(
  itemType: string,
  itemId: number,
  body: Record<string, unknown>,
): Promise<void> {
  const db = getDb();

  switch (itemType) {
    case 'flight': {
      const upd: Partial<typeof itemFlights.$inferInsert> = {};
      if (body.airline !== undefined) upd.airline = body.airline as string;
      if (body.flight_number !== undefined) upd.flightNumber = body.flight_number as string;
      if (body.departure_airport !== undefined)
        upd.departureAirport = body.departure_airport as string;
      if (body.arrival_airport !== undefined) upd.arrivalAirport = body.arrival_airport as string;
      if (body.departure_datetime !== undefined)
        upd.departureDatetime = body.departure_datetime as string;
      if (body.arrival_datetime !== undefined)
        upd.arrivalDatetime = body.arrival_datetime as string;
      if (body.booking_reference !== undefined)
        upd.bookingReference = body.booking_reference as string;
      if (body.seat !== undefined) upd.seat = body.seat as string;
      if (Object.keys(upd).length) {
        await db.update(itemFlights).set(upd).where(eq(itemFlights.itemId, itemId));
      }
      break;
    }
    case 'hotel': {
      const upd: Partial<typeof itemHotels.$inferInsert> = {};
      if (body.property_name !== undefined) upd.propertyName = body.property_name as string;
      if (body.address !== undefined) upd.address = body.address as string;
      if (body.check_in_date !== undefined) upd.checkInDate = body.check_in_date as string;
      if (body.check_out_date !== undefined) upd.checkOutDate = body.check_out_date as string;
      if (body.booking_reference !== undefined)
        upd.bookingReference = body.booking_reference as string;
      if (body.confirmation_number !== undefined)
        upd.confirmationNumber = body.confirmation_number as string;
      if (body.rating !== undefined) upd.rating = body.rating as number;
      if (body.post_visit_notes !== undefined) upd.postVisitNotes = body.post_visit_notes as string;
      if (Object.keys(upd).length) {
        await db.update(itemHotels).set(upd).where(eq(itemHotels.itemId, itemId));
      }
      break;
    }
    case 'car_rental': {
      const upd: Partial<typeof itemCarRentals.$inferInsert> = {};
      if (body.provider !== undefined) upd.provider = body.provider as string;
      if (body.pickup_location !== undefined) upd.pickupLocation = body.pickup_location as string;
      if (body.dropoff_location !== undefined)
        upd.dropoffLocation = body.dropoff_location as string;
      if (body.pickup_datetime !== undefined) upd.pickupDatetime = body.pickup_datetime as string;
      if (body.dropoff_datetime !== undefined)
        upd.dropoffDatetime = body.dropoff_datetime as string;
      if (body.booking_reference !== undefined)
        upd.bookingReference = body.booking_reference as string;
      if (body.vehicle_class !== undefined) upd.vehicleClass = body.vehicle_class as string;
      if (Object.keys(upd).length) {
        await db.update(itemCarRentals).set(upd).where(eq(itemCarRentals.itemId, itemId));
      }
      break;
    }
    case 'restaurant': {
      const upd: Partial<typeof itemRestaurants.$inferInsert> = {};
      if (body.name !== undefined) upd.name = body.name as string;
      if (body.neighbourhood_area !== undefined)
        upd.neighbourhoodArea = body.neighbourhood_area as string;
      if (body.cuisine_type !== undefined) upd.cuisineType = body.cuisine_type as string;
      if (body.source !== undefined) upd.source = body.source as string;
      if (body.rating !== undefined) upd.rating = body.rating as number;
      if (body.post_visit_notes !== undefined) upd.postVisitNotes = body.post_visit_notes as string;
      if (Object.keys(upd).length) {
        await db.update(itemRestaurants).set(upd).where(eq(itemRestaurants.itemId, itemId));
      }
      break;
    }
    case 'experience': {
      // Lazy extension row creation (ADL-14)
      if (body.rating !== undefined || body.post_visit_notes !== undefined) {
        await ensureExperienceExtension(itemId);
        const upd: Partial<typeof itemExperiences.$inferInsert> = {};
        if (body.rating !== undefined) upd.rating = body.rating as number;
        if (body.post_visit_notes !== undefined)
          upd.postVisitNotes = body.post_visit_notes as string;
        if (Object.keys(upd).length) {
          await db.update(itemExperiences).set(upd).where(eq(itemExperiences.itemId, itemId));
        }
      }
      break;
    }
    default:
      break;
  }
}
