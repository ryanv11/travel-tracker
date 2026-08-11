/**
 * Travel Tracker — Item serializer (QUAL-49)
 *
 * The single home for turning a joined item row into its snake_case API shape.
 * Every item-emitting endpoint already flows through here via
 * `fetchItemsWithExtensions` (items-helper.ts) — GET/POST/PATCH items and the
 * items nested under trips DETAIL. This module was extracted from items-helper.ts
 * unchanged so item serialization lives alongside the other entity serializers;
 * the query helper now imports `serializeItem`/`ItemRow` from here.
 *
 * The base fields are always present; the type-specific block is chosen by
 * `item_type`. A field persisted on an extension table but omitted from the
 * matching case below would be a silent field-drop — the same bug class QUAL-49
 * closes for cities and places.
 */

/** The full joined row shape produced by the items-with-extensions select. */
export interface ItemRow {
  id: number;
  tripId: number;
  tripPlaceId: number | null;
  itemType: string;
  status: string;
  notes: string | null;
  mapUrl: string | null;
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
  // computed
  effectiveRating: number | null;
}

/**
 * Flattens a joined item row into the API response shape.
 * Only includes extension fields relevant to the item's type.
 */
export function serializeItem(row: ItemRow): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: row.id,
    trip_id: row.tripId,
    trip_place_id: row.tripPlaceId,
    item_type: row.itemType,
    status: row.status,
    notes: row.notes,
    map_url: row.mapUrl,
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
    default:
      return base;
  }
}
