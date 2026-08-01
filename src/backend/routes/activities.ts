/**
 * Travel Tracker — Activities Router
 *
 * ADL-46 (AD-09, D3): activities are per-user, not an admin resource — they
 * moved out of /api/admin/* entirely (the structural error behind BUG-63) to
 * /api/activities, exactly as ADL-28 moved companions to /api/companions.
 * requireAuth (applied globally via app.use('/api/', requireAuth) in server.ts)
 * is the only gate — every handler is scoped to req.user!.id via
 * activityRepository. Soft-delete only (is_active = 0) — never hard-delete
 * (AD-06). Defaults are lazily seeded per-user on first access (read or write).
 */

import { Router } from 'express';
import { ConflictError, NotFoundError, ValidationError } from '../errors.js';
import { asyncHandler } from '../middleware/error-handler.js';
import { validateBody } from '../middleware/validate.js';
import { activityRepository } from '../repositories/activities.js';
import { CreateAdminItemSchema, UpdateAdminItemSchema } from '../validation/admin.schemas.js';

export const activitiesRouter = Router();

/** Serialize a raw Drizzle activity row to snake_case API shape. */
function serializeActivity(row: {
  id: number;
  name: string;
  isActive: number;
  createdAt: string;
  updatedAt: string;
}) {
  return {
    id: row.id,
    name: row.name,
    is_active: row.isActive === 1,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

// ----------------------------------------------------------------
// GET /api/activities — all (active + inactive) owned by the caller
// ----------------------------------------------------------------
// nosemgrep: travel-tracker.express-route-no-auth -- reason: requireAuth applied globally via app.use('/api/', requireAuth) in server.ts
activitiesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    await activityRepository.ensureSeeded(userId);
    const rows = await activityRepository.findAll(userId);
    res.json(rows.map(serializeActivity));
  }),
);

// ----------------------------------------------------------------
// GET /api/activities/active — active only, owned by the caller
// ----------------------------------------------------------------
// nosemgrep: travel-tracker.express-route-no-auth -- reason: requireAuth applied globally via app.use('/api/', requireAuth) in server.ts
activitiesRouter.get(
  '/active',
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    await activityRepository.ensureSeeded(userId);
    const rows = await activityRepository.findActive(userId);
    res.json(rows.map(serializeActivity));
  }),
);

// ----------------------------------------------------------------
// POST /api/activities — create, owned by the caller
// ----------------------------------------------------------------
// nosemgrep: travel-tracker.express-route-no-auth -- reason: requireAuth applied globally via app.use('/api/', requireAuth) in server.ts
activitiesRouter.post(
  '/',
  validateBody(CreateAdminItemSchema),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { name } = req.body;

    // Seed defaults first so a user whose very first action is a POST still
    // receives the default list alongside their custom entry (ADL-46 §3.2.1).
    await activityRepository.ensureSeeded(userId);

    // uniq_activities_user_name is scoped to (user_id, name) — two different
    // users may each have a 'Skiing' activity without conflict.
    const existing = await activityRepository.findAll(userId);
    if (existing.some((a) => a.name === name)) {
      throw new ConflictError(`Activity '${name}' already exists`);
    }

    const created = await activityRepository.create(userId, name);
    res.status(201).json(serializeActivity(created));
  }),
);

// ----------------------------------------------------------------
// PATCH /api/activities/:id — update name or is_active, owned by the caller
// ----------------------------------------------------------------
// nosemgrep: travel-tracker.express-route-no-auth -- reason: requireAuth applied globally via app.use('/api/', requireAuth) in server.ts
activitiesRouter.patch(
  '/:id',
  validateBody(UpdateAdminItemSchema),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const id = parseInt(String(req.params.id), 10);
    if (Number.isNaN(id)) throw new NotFoundError('Activity');

    const { name, is_active } = req.body;
    const updated = await activityRepository.update(userId, id, {
      name,
      isActive: is_active !== undefined ? (is_active ? 1 : 0) : undefined,
    });
    if (!updated) throw new NotFoundError('Activity');

    res.json(serializeActivity(updated));
  }),
);

// ----------------------------------------------------------------
// DELETE /api/activities/:id — soft-delete, owned by the caller
// ----------------------------------------------------------------
// nosemgrep: travel-tracker.express-route-no-auth -- reason: requireAuth applied globally via app.use('/api/', requireAuth) in server.ts
activitiesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const id = parseInt(String(req.params.id), 10);
    if (Number.isNaN(id)) throw new NotFoundError('Activity');

    const existing = await activityRepository.findById(userId, id);
    if (!existing) throw new NotFoundError('Activity');
    if (existing.isActive === 0) {
      throw new ValidationError('Activity is already inactive');
    }

    const updated = await activityRepository.deactivate(userId, id);
    res.json(serializeActivity(updated!));
  }),
);
