/**
 * Travel Tracker — Items Router
 *
 * Nested under /api/trips/:tripId/items (mounted in trips.ts with mergeParams: true).
 * Handles item CRUD with type-specific extension rows.
 * Implements lazy experience extension row creation (ADL-14) on PATCH.
 *
 * ADL-18: All user-scoped queries go through itemRepository. QUAL-43 Stage 4
 * (ADL-53 §3 item 1) made that literal rather than aspirational: this file holds
 * no database handle at all, which is why the wording changed from the original
 * "no direct calls for user-owned data" — the route layer now cannot reach the
 * ORM, scoped or otherwise, and `scripts/scope-completeness-check.sh` enforces it.
 */

import { Router } from 'express';
import { NotFoundError, ValidationError } from '../errors.js';
import { asyncHandler } from '../middleware/error-handler.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { itemRepository } from '../repositories/items.js';
import {
  CreateItemSchema,
  ListItemsQuerySchema,
  UpdateItemSchema,
} from '../validation/items.schemas.js';

const itemsRouter = Router({ mergeParams: true });
export default itemsRouter;

// ----------------------------------------------------------------
// GET /api/trips/:tripId/items
// ----------------------------------------------------------------
// nosemgrep: travel-tracker.express-route-no-auth -- reason: requireAuth applied globally via app.use('/api/', requireAuth) in server.ts
itemsRouter.get(
  '/',
  validateQuery(ListItemsQuerySchema),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const tripId = parseInt(String(req.params.tripId), 10);
    if (Number.isNaN(tripId)) throw new NotFoundError('Trip');

    const { place_id, type, status, sort_by, sort_order, min_rating } = req.query as {
      place_id?: number;
      type?: string;
      status?: string;
      sort_by?: 'rating';
      sort_order?: 'asc' | 'desc';
      min_rating?: number;
    };

    const result = await itemRepository.findByTrip(userId, tripId, {
      placeId: place_id,
      type,
      status,
      sortBy: sort_by,
      sortOrder: sort_order,
      minRating: min_rating != null ? Number(min_rating) : undefined,
    });
    res.json(result);
  }),
);

// ----------------------------------------------------------------
// POST /api/trips/:tripId/items
// ----------------------------------------------------------------
// nosemgrep: travel-tracker.express-route-no-auth -- reason: requireAuth applied globally via app.use('/api/', requireAuth) in server.ts
itemsRouter.post(
  '/',
  validateBody(CreateItemSchema),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const tripId = parseInt(String(req.params.tripId), 10);
    if (Number.isNaN(tripId)) throw new NotFoundError('Trip');

    // Verify trip ownership before inserting (items carry no independent userId
    // scoping on create — cross-user writes must 404 here, not fall through).
    await itemRepository.assertWritable(userId, tripId);

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
        mapUrl: body.map_url ?? null,
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
// nosemgrep: travel-tracker.express-route-no-auth -- reason: requireAuth applied globally via app.use('/api/', requireAuth) in server.ts
itemsRouter.patch(
  '/:itemId',
  validateBody(UpdateItemSchema),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const tripId = parseInt(String(req.params.tripId), 10);
    const itemId = parseInt(String(req.params.itemId), 10);
    if (Number.isNaN(tripId) || Number.isNaN(itemId)) throw new NotFoundError('Item');

    // BUG-27: ownership check BEFORE lock check (audit invariant 17) —
    // assertWritable verifies trip existence + ownership (404) then lock (403)
    await itemRepository.assertWritable(userId, tripId);

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
        mapUrl: body.map_url,
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
// nosemgrep: travel-tracker.express-route-no-auth -- reason: requireAuth applied globally via app.use('/api/', requireAuth) in server.ts
itemsRouter.delete(
  '/:itemId',
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const tripId = parseInt(String(req.params.tripId), 10);
    const itemId = parseInt(String(req.params.itemId), 10);
    if (Number.isNaN(tripId) || Number.isNaN(itemId)) throw new NotFoundError('Item');

    // BUG-27: ownership check BEFORE lock check (audit invariant 17) —
    // assertWritable verifies trip existence + ownership (404) then lock (403)
    await itemRepository.assertWritable(userId, tripId);

    const deleted = await itemRepository.delete(userId, tripId, itemId);
    if (!deleted) throw new NotFoundError('Item');

    res.status(204).send();
  }),
);
