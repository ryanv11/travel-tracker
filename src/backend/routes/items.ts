/**
 * Travel Tracker — Items Router
 *
 * Nested under /api/trips/:tripId/items (mounted in trips.ts with mergeParams: true).
 * Handles item CRUD with type-specific extension rows.
 * Implements lazy experience extension row creation (ADL-14) on PATCH.
 *
 * ADL-18: All user-scoped queries go through itemRepository. No direct getDb()
 * calls for user-owned data.
 */

import { Router } from 'express';
import { asyncHandler } from '../middleware/error-handler.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import {
  CreateItemSchema,
  UpdateItemSchema,
  ListItemsQuerySchema,
} from '../validation/items.schemas.js';
import { NotFoundError, ValidationError } from '../errors.js';
import { assertNotLocked } from '../services/items.service.js';
import { itemRepository } from '../repositories/items.js';

const itemsRouter = Router({ mergeParams: true });
export default itemsRouter;

// ----------------------------------------------------------------
// GET /api/trips/:tripId/items
// ----------------------------------------------------------------
itemsRouter.get(
  '/',
  validateQuery(ListItemsQuerySchema),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const tripId = parseInt(req.params.tripId, 10);
    if (isNaN(tripId)) throw new NotFoundError('Trip');

    const { place_id, type, status } = req.query as {
      place_id?: number;
      type?: string;
      status?: string;
    };

    const result = await itemRepository.findByTrip(userId, tripId, { placeId: place_id, type, status });
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
    const userId = req.user!.id;
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

    const item = await itemRepository.create(
      userId,
      tripId,
      {
        tripPlaceId: body.trip_place_id ?? null,
        itemType: body.item_type,
        status: body.status ?? 'consider',
        notes: body.notes ?? null,
        isCarriedForward: !!body.is_carried_forward,
        carriedFromItemId: body.carried_from_item_id ?? null,
      },
      body,
    );

    res.status(201).json(item ?? null);
  }),
);

// ----------------------------------------------------------------
// PATCH /api/trips/:tripId/items/:itemId
// ----------------------------------------------------------------
itemsRouter.patch(
  '/:itemId',
  validateBody(UpdateItemSchema),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const tripId = parseInt(req.params.tripId, 10);
    const itemId = parseInt(req.params.itemId, 10);
    if (isNaN(tripId) || isNaN(itemId)) throw new NotFoundError('Item');

    await assertNotLocked(tripId);

    // Verify item exists and belongs to user
    const existing = await itemRepository.findRawByIdOrThrow(userId, tripId, itemId);

    const body = req.body;

    const result = await itemRepository.update(
      userId,
      tripId,
      itemId,
      {
        status: body.status,
        notes: body.notes,
      },
      body,
      existing.itemType,
    );

    res.json(result ?? null);
  }),
);

// ----------------------------------------------------------------
// DELETE /api/trips/:tripId/items/:itemId
// ----------------------------------------------------------------
itemsRouter.delete(
  '/:itemId',
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const tripId = parseInt(req.params.tripId, 10);
    const itemId = parseInt(req.params.itemId, 10);
    if (isNaN(tripId) || isNaN(itemId)) throw new NotFoundError('Item');

    await assertNotLocked(tripId);

    const deleted = await itemRepository.delete(userId, tripId, itemId);
    if (!deleted) throw new NotFoundError('Item');

    res.status(204).send();
  }),
);
