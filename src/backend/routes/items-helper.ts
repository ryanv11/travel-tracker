/**
 * Travel Tracker — Items Query Helper
 *
 * Shared logic for fetching items with all extension fields merged into a flat
 * response object. Used by both routes/items.ts and routes/trips.ts (nested items).
 */

import type { SQL } from 'drizzle-orm';
import { desc, eq } from 'drizzle-orm';
import {
  getDb,
  itemCarRentals,
  itemExperiences,
  itemFlights,
  itemHotels,
  itemRestaurants,
  items,
} from '../db/index.js';

// The full joined row shape returned by our select query
interface ItemRow {
  id: number;
  tripId: number;
  tripPlaceId: number | null;
  itemType: string;
  status: string;
  notes: string | null;
  isCarriedForward: number;
  carriedFromItemId: number | null;
  createdAt: string;
  updatedAt: string;
  // flight
  flightAirline: string | null;
  flightNumber: string | null;
  flightDepartureAirport: string | null;
  flightArrivalAirport: string | null;
  flightDepartureDatetime: string | null;
  flightArrivalDatetime: string | null;
  flightBookingReference: string | null;
  flightSeat: string | null;
  // hotel
  hotelPropertyName: string | null;
  hotelAddress: string | null;
  hotelCheckInDate: string | null;
  hotelCheckOutDate: string | null;
  hotelBookingReference: string | null;
  hotelConfirmationNumber: string | null;
  hotelRating: number | null;
  hotelPostVisitNotes: string | null;
  // car_rental
  carRentalProvider: string | null;
  carRentalPickupLocation: string | null;
  carRentalDropoffLocation: string | null;
  carRentalPickupDatetime: string | null;
  carRentalDropoffDatetime: string | null;
  carRentalBookingReference: string | null;
  carRentalVehicleClass: string | null;
  // restaurant
  restaurantName: string | null;
  restaurantNeighbourhoodArea: string | null;
  restaurantCuisineType: string | null;
  restaurantSource: string | null;
  restaurantRating: number | null;
  restaurantPostVisitNotes: string | null;
  // experience (lazy row — may be null)
  experienceRating: number | null;
  experiencePostVisitNotes: string | null;
}

/**
 * Fetches items from the database with all extension fields left-joined.
 * Returns flat objects with type-specific fields merged in.
 *
 * @param conditions - Drizzle WHERE conditions to apply (can be undefined for no filter).
 */
export async function fetchItemsWithExtensions(
  conditions?: SQL,
): Promise<Record<string, unknown>[]> {
  const db = getDb();

  const rows = await db
    .select({
      id: items.id,
      tripId: items.tripId,
      tripPlaceId: items.tripPlaceId,
      itemType: items.itemType,
      status: items.status,
      notes: items.notes,
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
    })
    .from(items)
    .leftJoin(itemFlights, eq(itemFlights.itemId, items.id))
    .leftJoin(itemHotels, eq(itemHotels.itemId, items.id))
    .leftJoin(itemCarRentals, eq(itemCarRentals.itemId, items.id))
    .leftJoin(itemRestaurants, eq(itemRestaurants.itemId, items.id))
    .leftJoin(itemExperiences, eq(itemExperiences.itemId, items.id))
    .where(conditions)
    .orderBy(desc(items.createdAt));

  return rows.map((r) => flattenItem(r as ItemRow));
}

/**
 * Flattens a joined item row into the API response shape.
 * Only includes extension fields relevant to the item's type.
 */
function flattenItem(row: ItemRow): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: row.id,
    trip_id: row.tripId,
    trip_place_id: row.tripPlaceId,
    item_type: row.itemType,
    status: row.status,
    notes: row.notes,
    is_carried_forward: row.isCarriedForward === 1,
    carried_from_item_id: row.carriedFromItemId,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };

  switch (row.itemType) {
    case 'flight':
      return {
        ...base,
        airline: row.flightAirline,
        flight_number: row.flightNumber,
        departure_airport: row.flightDepartureAirport,
        arrival_airport: row.flightArrivalAirport,
        departure_datetime: row.flightDepartureDatetime,
        arrival_datetime: row.flightArrivalDatetime,
        booking_reference: row.flightBookingReference,
        seat: row.flightSeat,
      };
    case 'hotel':
      return {
        ...base,
        property_name: row.hotelPropertyName,
        address: row.hotelAddress,
        check_in_date: row.hotelCheckInDate,
        check_out_date: row.hotelCheckOutDate,
        booking_reference: row.hotelBookingReference,
        confirmation_number: row.hotelConfirmationNumber,
        rating: row.hotelRating,
        post_visit_notes: row.hotelPostVisitNotes,
      };
    case 'car_rental':
      return {
        ...base,
        provider: row.carRentalProvider,
        pickup_location: row.carRentalPickupLocation,
        dropoff_location: row.carRentalDropoffLocation,
        pickup_datetime: row.carRentalPickupDatetime,
        dropoff_datetime: row.carRentalDropoffDatetime,
        booking_reference: row.carRentalBookingReference,
        vehicle_class: row.carRentalVehicleClass,
      };
    case 'restaurant':
      return {
        ...base,
        name: row.restaurantName,
        neighbourhood_area: row.restaurantNeighbourhoodArea,
        cuisine_type: row.restaurantCuisineType,
        source: row.restaurantSource,
        rating: row.restaurantRating,
        post_visit_notes: row.restaurantPostVisitNotes,
      };
    case 'experience':
      return {
        ...base,
        rating: row.experienceRating,
        post_visit_notes: row.experiencePostVisitNotes,
      };
    case 'note':
    default:
      return base;
  }
}
