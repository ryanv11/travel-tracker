/**
 * Travel Tracker — Items Query Helper
 *
 * The shared read that fetches items with every extension table left-joined and
 * merged into a flat response object. Consumed by `itemRepository`.
 *
 * QUAL-43 Stage 4 (ADL-53 §5.1, §6). This module used to live in
 * `src/backend/routes/` and took only a `conditions` argument: every caller was
 * trusted to hand it a predicate that happened to include the item's owner, and
 * the read itself carried no scope at all. ADL-53 calls that the sharpest case
 * in the migration — a forgotten term in one caller was a silent cross-tenant
 * read, and `itemRepository` importing a query out of the route layer inverted
 * the dependency besides.
 *
 * Two things changed and they are the point of the relocation:
 *   1. It lives in `repositories/`, so the route layer no longer holds a
 *      database handle for items (ADL-53 §3 item 1).
 *   2. `userId` is a REQUIRED parameter and the ownership predicate is composed
 *      here, from the chokepoint (`ownedAnd` → `scopeToUser`). A caller can no
 *      longer forget the scope; omitting it is a compile error.
 */

import type { SQL } from 'drizzle-orm';
import { asc, desc, eq, sql } from 'drizzle-orm';
import {
  getDb,
  itemCarRentals,
  itemExperiences,
  itemFlights,
  itemHotels,
  itemRestaurants,
  items,
} from '../db/index.js';
// QUAL-49: item serialization lives with the other entity serializers. This
// module owns the QUERY; `serializeItem` owns the response shape.
import { type ItemRow, serializeItem } from '../serializers/item.js';
import { ownedAnd } from './scope.js';

/**
 * Fetches items owned by `userId` with all extension fields left-joined.
 * Returns flat objects with type-specific fields merged in.
 *
 * @param userId - The owner. REQUIRED (QUAL-43 Stage 4): the ownership predicate
 *   is composed here via `ownedAnd`, so no caller can produce an unscoped item
 *   read. `conditions` narrows within the caller's own rows — it never widens.
 * @param conditions - Further Drizzle WHERE conditions, ANDed after ownership
 *   (undefined for "all of this user's items").
 * @param opts - Optional sort and filter options.
 * @param opts.sortBy - If 'rating', sort by effective rating across type-specific tables.
 * @param opts.sortOrder - 'asc' or 'desc'. Defaults to 'desc' when sortBy is 'rating'.
 * @param opts.minRating - If set, only return items with effectiveRating >= minRating.
 */
export async function fetchItemsWithExtensions(
  userId: string,
  conditions?: SQL,
  opts?: { sortBy?: 'rating'; sortOrder?: 'asc' | 'desc'; minRating?: number },
): Promise<Record<string, unknown>[]> {
  const db = getDb();

  const effectiveRatingSql = sql<
    number | null
  >`COALESCE(${itemRestaurants.rating}, ${itemHotels.rating}, ${itemExperiences.rating})`;

  const rows = await db
    .select({
      id: items.id,
      tripId: items.tripId,
      tripPlaceId: items.tripPlaceId,
      itemType: items.itemType,
      status: items.status,
      notes: items.notes,
      mapUrl: items.mapUrl,
      isCarriedForward: items.isCarriedForward,
      carriedFromItemId: items.carriedFromItemId,
      createdAt: items.createdAt,
      updatedAt: items.updatedAt,
      flightAirline: itemFlights.airline,
      flightNumber: itemFlights.flightNumber,
      flightDepartureAirport: itemFlights.departureAirport,
      flightArrivalAirport: itemFlights.arrivalAirport,
      flightDepartureDatetime: itemFlights.departureDatetime,
      flightArrivalDatetime: itemFlights.arrivalDatetime,
      flightBookingReference: itemFlights.bookingReference,
      flightSeat: itemFlights.seat,
      hotelPropertyName: itemHotels.propertyName,
      hotelAddress: itemHotels.address,
      hotelCheckInDate: itemHotels.checkInDate,
      hotelCheckOutDate: itemHotels.checkOutDate,
      hotelBookingReference: itemHotels.bookingReference,
      hotelConfirmationNumber: itemHotels.confirmationNumber,
      hotelRating: itemHotels.rating,
      hotelPostVisitNotes: itemHotels.postVisitNotes,
      carRentalProvider: itemCarRentals.provider,
      carRentalPickupLocation: itemCarRentals.pickupLocation,
      carRentalDropoffLocation: itemCarRentals.dropoffLocation,
      carRentalPickupDatetime: itemCarRentals.pickupDatetime,
      carRentalDropoffDatetime: itemCarRentals.dropoffDatetime,
      carRentalBookingReference: itemCarRentals.bookingReference,
      carRentalVehicleClass: itemCarRentals.vehicleClass,
      restaurantName: itemRestaurants.name,
      restaurantNeighbourhoodArea: itemRestaurants.neighbourhoodArea,
      restaurantCuisineType: itemRestaurants.cuisineType,
      restaurantSource: itemRestaurants.source,
      restaurantRating: itemRestaurants.rating,
      restaurantPostVisitNotes: itemRestaurants.postVisitNotes,
      experienceRating: itemExperiences.rating,
      experiencePostVisitNotes: itemExperiences.postVisitNotes,
      effectiveRating: effectiveRatingSql,
    })
    .from(items)
    .leftJoin(itemFlights, eq(itemFlights.itemId, items.id))
    .leftJoin(itemHotels, eq(itemHotels.itemId, items.id))
    .leftJoin(itemCarRentals, eq(itemCarRentals.itemId, items.id))
    .leftJoin(itemRestaurants, eq(itemRestaurants.itemId, items.id))
    .leftJoin(itemExperiences, eq(itemExperiences.itemId, items.id))
    // The ownership predicate is composed here, not by the caller. This is the
    // query's ONLY terminal `.where()` — Drizzle's `.where()` overwrites rather
    // than appends (ADL-53 F3), so if a future edit branches this builder,
    // `ownedAnd` must appear in EVERY terminal `.where(...)`, not just the first.
    .where(ownedAnd(items, userId, conditions))
    .orderBy(
      opts?.sortBy === 'rating'
        ? opts.sortOrder === 'asc'
          ? asc(effectiveRatingSql)
          : desc(effectiveRatingSql)
        : desc(items.createdAt),
    );

  // Apply min_rating filter post-query (avoids duplicating SQL expression)
  const filtered =
    opts?.minRating != null
      ? rows.filter(
          (r) => (r.effectiveRating ?? null) != null && r.effectiveRating! >= opts.minRating!,
        )
      : rows;

  return filtered.map((r) => serializeItem(r as ItemRow));
}
