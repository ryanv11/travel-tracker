/**
 * Travel Tracker — Items Router
 *
 * Nested under /api/trips/:tripId/items (mounted in trips.ts with mergeParams: true).
 * Handles item CRUD with type-specific extension rows.
 * Implements lazy experience extension row creation (ADL-14) on PATCH.
 */

import { Router } from 'express';
import { eq, and } from 'drizzle-orm';
import {
  getDb,
  items,
  itemFlights,
  itemHotels,
  itemCarRentals,
  itemRestaurants,
  itemExperiences,
} from '../db/index.js';
import { asyncHandler } from '../middleware/error-handler.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import {
  CreateItemSchema,
  UpdateItemSchema,
  ListItemsQuerySchema,
} from '../validation/items.schemas.js';
import { NotFoundError, ValidationError } from '../errors.js';
import { assertNotLocked, ensureExperienceExtension } from '../services/items.service.js';
import { fetchItemsWithExtensions } from './items-helper.js';

const itemsRouter = Router({ mergeParams: true });
export default itemsRouter;

// ----------------------------------------------------------------
// GET /api/trips/:tripId/items
// ----------------------------------------------------------------
itemsRouter.get(
  '/',
  validateQuery(ListItemsQuerySchema),
  asyncHandler(async (req, res) => {
    const tripId = parseInt(req.params.tripId, 10);
    if (isNaN(tripId)) throw new NotFoundError('Trip');

    const { place_id, type, status } = req.query as {
      place_id?: number;
      type?: string;
      status?: string;
    };

    const db = getDb();
    const { and: drizzleAnd, eq: drizzleEq } = await import('drizzle-orm');

    // Build conditions
    const conditions = [drizzleEq(items.tripId, tripId)];
    if (place_id) conditions.push(drizzleEq(items.tripPlaceId, Number(place_id)));
    if (type) conditions.push(drizzleEq(items.itemType, type));
    if (status) conditions.push(drizzleEq(items.status, status));

    const result = await fetchItemsWithExtensions(drizzleAnd(...conditions));
    res.json(result);
  }),
);

// ----------------------------------------------------------------
// POST /api/trips/:tripId/items
// ----------------------------------------------------------------
itemsRouter.post(
  '/',
  validateBody(CreateItemSchema),
  asyncHandler(async (req, res) => {
    const tripId = parseInt(req.params.tripId, 10);
    if (isNaN(tripId)) throw new NotFoundError('Trip');

    await assertNotLocked(tripId);

    const body = req.body;

    // Validate carry-forward consistency (ADL-13) — also enforced by Zod
    if (body.is_carried_forward && !body.carried_from_item_id) {
      throw new ValidationError('carried_from_item_id required when is_carried_forward is true');
    }
    if (body.carried_from_item_id && !body.is_carried_forward) {
      throw new ValidationError('is_carried_forward must be true when carried_from_item_id is set');
    }

    const now = new Date().toISOString();
    const db = getDb();

    const inserted = await db
      .insert(items)
      .values({
        tripId,
        tripPlaceId: body.trip_place_id ?? null,
        itemType: body.item_type,
        status: body.status ?? 'consider',
        notes: body.notes ?? null,
        isCarriedForward: body.is_carried_forward ? 1 : 0,
        carriedFromItemId: body.carried_from_item_id ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const item = inserted[0];

    // Insert type-specific extension row (not for 'note' or 'experience' — ADL-14)
    await insertExtension(item.id, body.item_type, body);

    // Return full item with extension fields
    const { eq: drizzleEq } = await import('drizzle-orm');
    const result = await fetchItemsWithExtensions(drizzleEq(items.id, item.id));
    res.status(201).json(result[0] ?? null);
  }),
);

// ----------------------------------------------------------------
// PATCH /api/trips/:tripId/items/:itemId
// ----------------------------------------------------------------
itemsRouter.patch(
  '/:itemId',
  validateBody(UpdateItemSchema),
  asyncHandler(async (req, res) => {
    const tripId = parseInt(req.params.tripId, 10);
    const itemId = parseInt(req.params.itemId, 10);
    if (isNaN(tripId) || isNaN(itemId)) throw new NotFoundError('Item');

    await assertNotLocked(tripId);

    const db = getDb();
    const existing = await db
      .select()
      .from(items)
      .where(and(eq(items.id, itemId), eq(items.tripId, tripId)))
      .limit(1);
    if (!existing.length) throw new NotFoundError('Item');

    const item = existing[0];
    const body = req.body;
    const now = new Date().toISOString();

    // Update base item
    const baseUpdates: Partial<typeof items.$inferInsert> = { updatedAt: now };
    if (body.status !== undefined) baseUpdates.status = body.status;
    if (body.notes !== undefined) baseUpdates.notes = body.notes;

    await db.update(items).set(baseUpdates).where(eq(items.id, itemId));

    // Update extension row
    await updateExtension(item.itemType, itemId, body);

    const { eq: drizzleEq } = await import('drizzle-orm');
    const result = await fetchItemsWithExtensions(drizzleEq(items.id, itemId));
    res.json(result[0] ?? null);
  }),
);

// ----------------------------------------------------------------
// DELETE /api/trips/:tripId/items/:itemId
// ----------------------------------------------------------------
itemsRouter.delete(
  '/:itemId',
  asyncHandler(async (req, res) => {
    const tripId = parseInt(req.params.tripId, 10);
    const itemId = parseInt(req.params.itemId, 10);
    if (isNaN(tripId) || isNaN(itemId)) throw new NotFoundError('Item');

    await assertNotLocked(tripId);

    const db = getDb();
    const existing = await db
      .select({ id: items.id })
      .from(items)
      .where(and(eq(items.id, itemId), eq(items.tripId, tripId)))
      .limit(1);
    if (!existing.length) throw new NotFoundError('Item');

    // CASCADE in schema handles extension row deletion
    await db.delete(items).where(eq(items.id, itemId));

    res.status(204).send();
  }),
);

// ----------------------------------------------------------------
// Extension row helpers
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
        // rating and post_visit_notes NOT set on create (RV-03)
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
        // rating and post_visit_notes NOT set on create (RS-03)
      });
      break;
    case 'experience':
      // ADL-14: do NOT create extension row on create — lazy creation on first rating
      break;
    case 'note':
    default:
      // No extension table for notes
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
      if (body.departure_airport !== undefined) upd.departureAirport = body.departure_airport as string;
      if (body.arrival_airport !== undefined) upd.arrivalAirport = body.arrival_airport as string;
      if (body.departure_datetime !== undefined) upd.departureDatetime = body.departure_datetime as string;
      if (body.arrival_datetime !== undefined) upd.arrivalDatetime = body.arrival_datetime as string;
      if (body.booking_reference !== undefined) upd.bookingReference = body.booking_reference as string;
      if (body.seat !== undefined) upd.seat = body.seat as string;
      if (Object.keys(upd).length) await db.update(itemFlights).set(upd).where(eq(itemFlights.itemId, itemId));
      break;
    }
    case 'hotel': {
      const upd: Partial<typeof itemHotels.$inferInsert> = {};
      if (body.property_name !== undefined) upd.propertyName = body.property_name as string;
      if (body.address !== undefined) upd.address = body.address as string;
      if (body.check_in_date !== undefined) upd.checkInDate = body.check_in_date as string;
      if (body.check_out_date !== undefined) upd.checkOutDate = body.check_out_date as string;
      if (body.booking_reference !== undefined) upd.bookingReference = body.booking_reference as string;
      if (body.confirmation_number !== undefined) upd.confirmationNumber = body.confirmation_number as string;
      if (body.rating !== undefined) upd.rating = body.rating as number;
      if (body.post_visit_notes !== undefined) upd.postVisitNotes = body.post_visit_notes as string;
      if (Object.keys(upd).length) await db.update(itemHotels).set(upd).where(eq(itemHotels.itemId, itemId));
      break;
    }
    case 'car_rental': {
      const upd: Partial<typeof itemCarRentals.$inferInsert> = {};
      if (body.provider !== undefined) upd.provider = body.provider as string;
      if (body.pickup_location !== undefined) upd.pickupLocation = body.pickup_location as string;
      if (body.dropoff_location !== undefined) upd.dropoffLocation = body.dropoff_location as string;
      if (body.pickup_datetime !== undefined) upd.pickupDatetime = body.pickup_datetime as string;
      if (body.dropoff_datetime !== undefined) upd.dropoffDatetime = body.dropoff_datetime as string;
      if (body.booking_reference !== undefined) upd.bookingReference = body.booking_reference as string;
      if (body.vehicle_class !== undefined) upd.vehicleClass = body.vehicle_class as string;
      if (Object.keys(upd).length) await db.update(itemCarRentals).set(upd).where(eq(itemCarRentals.itemId, itemId));
      break;
    }
    case 'restaurant': {
      const upd: Partial<typeof itemRestaurants.$inferInsert> = {};
      if (body.name !== undefined) upd.name = body.name as string;
      if (body.neighbourhood_area !== undefined) upd.neighbourhoodArea = body.neighbourhood_area as string;
      if (body.cuisine_type !== undefined) upd.cuisineType = body.cuisine_type as string;
      if (body.source !== undefined) upd.source = body.source as string;
      if (body.rating !== undefined) upd.rating = body.rating as number;
      if (body.post_visit_notes !== undefined) upd.postVisitNotes = body.post_visit_notes as string;
      if (Object.keys(upd).length) await db.update(itemRestaurants).set(upd).where(eq(itemRestaurants.itemId, itemId));
      break;
    }
    case 'experience': {
      // Lazy extension row creation (ADL-14)
      if (body.rating !== undefined || body.post_visit_notes !== undefined) {
        await ensureExperienceExtension(itemId);
        const upd: Partial<typeof itemExperiences.$inferInsert> = {};
        if (body.rating !== undefined) upd.rating = body.rating as number;
        if (body.post_visit_notes !== undefined) upd.postVisitNotes = body.post_visit_notes as string;
        if (Object.keys(upd).length) {
          await db.update(itemExperiences).set(upd).where(eq(itemExperiences.itemId, itemId));
        }
      }
      break;
    }
    case 'note':
    default:
      break;
  }
}
