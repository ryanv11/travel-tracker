/**
 * Travel Tracker — Items Business Logic Service
 *
 * Handles carry-forward (IT-07), lazy experience extension rows (ADL-14),
 * and locked trip enforcement.
 */

import { eq, and, inArray } from 'drizzle-orm';
import {
  getDb,
  trips,
  items,
  itemRestaurants,
  itemHotels,
  itemFlights,
  itemCarRentals,
  itemExperiences,
} from '../db/index.js';
import { LockError, NotFoundError } from '../errors.js';

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------

interface CarryForwardParams {
  sourceCityId: number;
  targetTripId: number;
  targetTripPlaceId: number;
  sourceItemIds: number[];
}

// ----------------------------------------------------------------
// Lock guard
// ----------------------------------------------------------------

/**
 * Verifies the trip is not locked. Throws LockError (403) if it is.
 * Called by all write route handlers before any mutation.
 */
export async function assertNotLocked(tripId: number): Promise<void> {
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
// Lazy extension row (ADL-14)
// ----------------------------------------------------------------

/**
 * Ensures an item_experiences row exists for the given item.
 * Creates an empty row if it doesn't exist yet.
 * Called before updating rating or post_visit_notes on experience items.
 */
export async function ensureExperienceExtension(itemId: number): Promise<void> {
  const db = getDb();
  await db
    .insert(itemExperiences)
    .values({ itemId, rating: null, postVisitNotes: null })
    .onConflictDoNothing();
}

// ----------------------------------------------------------------
// Carry-forward (IT-07)
// ----------------------------------------------------------------

/**
 * Creates carry-forward copies of the specified items on the target trip/place.
 *
 * For each source item:
 * - Copies item_type and notes from the source
 * - Sets status = 'consider', is_carried_forward = 1, carried_from_item_id = sourceId
 * - Copies extension fields (e.g. restaurant name, cuisine) but NOT rating or post_visit_notes
 *
 * @returns The newly created item IDs.
 */
export async function executeCarryForward(
  params: CarryForwardParams,
): Promise<number[]> {
  const db = getDb();
  const { targetTripId, targetTripPlaceId, sourceItemIds } = params;

  if (!sourceItemIds.length) return [];

  // Load source items with their extension data
  const sourceItems = await db
    .select({
      id: items.id,
      itemType: items.itemType,
      notes: items.notes,
      // restaurant fields
      restaurantName: itemRestaurants.name,
      restaurantNeighbourhood: itemRestaurants.neighbourhoodArea,
      restaurantCuisine: itemRestaurants.cuisineType,
      restaurantSource: itemRestaurants.source,
      // hotel fields
      hotelPropertyName: itemHotels.propertyName,
      hotelAddress: itemHotels.address,
      hotelCheckIn: itemHotels.checkInDate,
      hotelCheckOut: itemHotels.checkOutDate,
      hotelBookingRef: itemHotels.bookingReference,
      hotelConfirmation: itemHotels.confirmationNumber,
    })
    .from(items)
    .leftJoin(itemRestaurants, eq(itemRestaurants.itemId, items.id))
    .leftJoin(itemHotels, eq(itemHotels.itemId, items.id))
    .where(inArray(items.id, sourceItemIds));

  const now = new Date().toISOString();
  const createdIds: number[] = [];

  for (const src of sourceItems) {
    // Insert base item
    const inserted = await db
      .insert(items)
      .values({
        tripId: targetTripId,
        tripPlaceId: targetTripPlaceId,
        itemType: src.itemType,
        status: 'consider',
        notes: src.notes,
        isCarriedForward: 1,
        carriedFromItemId: src.id,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: items.id });

    const newItemId = inserted[0].id;
    createdIds.push(newItemId);

    // Copy extension fields (NOT rating / post_visit_notes)
    if (src.itemType === 'restaurant') {
      await db.insert(itemRestaurants).values({
        itemId: newItemId,
        name: src.restaurantName,
        neighbourhoodArea: src.restaurantNeighbourhood,
        cuisineType: src.restaurantCuisine,
        source: src.restaurantSource,
        // rating and post_visit_notes intentionally omitted
      });
    } else if (src.itemType === 'hotel') {
      await db.insert(itemHotels).values({
        itemId: newItemId,
        propertyName: src.hotelPropertyName,
        address: src.hotelAddress,
        checkInDate: src.hotelCheckIn,
        checkOutDate: src.hotelCheckOut,
        bookingReference: src.hotelBookingRef,
        confirmationNumber: src.hotelConfirmation,
        // rating and post_visit_notes intentionally omitted
      });
    }
    // Flights, car_rentals, experiences, notes: no carry-forward extension data
  }

  return createdIds;
}
