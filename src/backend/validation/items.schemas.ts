/**
 * Travel Tracker — Item Validation Schemas
 * SEC-04: All item type-specific fields are optional on create (partial data allowed).
 */

import { z } from 'zod';
import { zItemStatus, zItemType, zOptionalString, zRating } from './common.js';

/** Fields shared by all item types */
const itemBase = {
  trip_place_id: z.number().int().positive().nullable().optional(),
  item_type: zItemType,
  status: zItemStatus.optional(),
  notes: zOptionalString,
  is_carried_forward: z.boolean().optional(),
  carried_from_item_id: z.number().int().positive().nullable().optional(),
};

/** Type-specific extension fields (all optional — partial data allowed) */
const extensionFields = {
  // flight
  airline: zOptionalString,
  flight_number: zOptionalString,
  departure_airport: zOptionalString,
  arrival_airport: zOptionalString,
  departure_datetime: zOptionalString,
  arrival_datetime: zOptionalString,
  booking_reference: zOptionalString,
  seat: zOptionalString,
  // hotel
  property_name: zOptionalString,
  address: zOptionalString,
  check_in_date: zOptionalString,
  check_out_date: zOptionalString,
  confirmation_number: zOptionalString,
  rating: zRating.optional(),
  post_visit_notes: zOptionalString,
  // car_rental
  provider: zOptionalString,
  pickup_location: zOptionalString,
  dropoff_location: zOptionalString,
  pickup_datetime: zOptionalString,
  dropoff_datetime: zOptionalString,
  vehicle_class: zOptionalString,
  // restaurant
  name: zOptionalString,
  neighbourhood_area: zOptionalString,
  cuisine_type: zOptionalString,
  source: zOptionalString,
  // experience / note: no additional fields
};

/** Schema for POST /api/trips/:tripId/items */
export const CreateItemSchema = z.object({ ...itemBase, ...extensionFields }).refine(
  (d) => {
    // is_carried_forward and carried_from_item_id must be consistent (ADL-13)
    if (d.is_carried_forward && !d.carried_from_item_id) return false;
    if (d.carried_from_item_id && !d.is_carried_forward) return false;
    return true;
  },
  {
    message: 'is_carried_forward and carried_from_item_id must be set together',
  },
);

/** Schema for PATCH /api/trips/:tripId/items/:itemId */
export const UpdateItemSchema = z.object({
  status: zItemStatus.optional(),
  notes: zOptionalString,
  ...extensionFields,
});

/** Schema for GET /api/trips/:tripId/items query params */
export const ListItemsQuerySchema = z.object({
  place_id: z.coerce.number().int().positive().optional(),
  type: zItemType.optional(),
  status: zItemStatus.optional(),
  sort_by: z.literal('rating').optional(),
  sort_order: z.enum(['asc', 'desc']).optional(),
  min_rating: z.coerce.number().int().min(1).max(5).optional(),
});

/** Schema for POST /api/trips/:tripId/places/:placeId/carry-forward (C1) */
export const CarryForwardBodySchema = z
  .object({
    source_item_ids: z.array(z.number().int().positive()).min(1),
  })
  .strict();
