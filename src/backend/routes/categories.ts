/**
 * Travel Tracker — Categories Router
 *
 * ADL-46 (AD-09, D3): trip categories are per-user, not an admin resource —
 * they moved out of /api/admin/* entirely (the structural error behind BUG-63)
 * to /api/categories, exactly as ADL-28 moved companions to /api/companions.
 * requireAuth (applied globally via app.use('/api/', requireAuth) in server.ts)
 * is the only gate — every handler is scoped to req.user!.id via
 * tripCategoryRepository. Soft-delete only (is_active = 0) — never hard-delete
 * (AD-06). Defaults are lazily seeded per-user on first access (read or write).
 */

import { Router } from 'express';
import { ConflictError, NotFoundError, ValidationError } from '../errors.js';
import { asyncHandler } from '../middleware/error-handler.js';
import { validateBody } from '../middleware/validate.js';
import { tripCategoryRepository } from '../repositories/tripCategories.js';
import { CreateAdminItemSchema, UpdateAdminItemSchema } from '../validation/admin.schemas.js';

export const categoriesRouter = Router();

/** Serialize a raw Drizzle category row to snake_case API shape. */
function serializeCategory(row: {
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
// GET /api/categories — all (active + inactive) owned by the caller
// ----------------------------------------------------------------
// nosemgrep: travel-tracker.express-route-no-auth -- reason: requireAuth applied globally via app.use('/api/', requireAuth) in server.ts
categoriesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    await tripCategoryRepository.ensureSeeded(userId);
    const rows = await tripCategoryRepository.findAll(userId);
    res.json(rows.map(serializeCategory));
  }),
);

// ----------------------------------------------------------------
// GET /api/categories/active — active only, owned by the caller
// ----------------------------------------------------------------
// nosemgrep: travel-tracker.express-route-no-auth -- reason: requireAuth applied globally via app.use('/api/', requireAuth) in server.ts
categoriesRouter.get(
  '/active',
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    await tripCategoryRepository.ensureSeeded(userId);
    const rows = await tripCategoryRepository.findActive(userId);
    res.json(rows.map(serializeCategory));
  }),
);

// ----------------------------------------------------------------
// POST /api/categories — create, owned by the caller
// ----------------------------------------------------------------
// nosemgrep: travel-tracker.express-route-no-auth -- reason: requireAuth applied globally via app.use('/api/', requireAuth) in server.ts
categoriesRouter.post(
  '/',
  validateBody(CreateAdminItemSchema),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { name } = req.body;

    // Seed defaults first so a user whose very first action is a POST still
    // receives the default list alongside their custom entry (ADL-46 §3.2.1).
    await tripCategoryRepository.ensureSeeded(userId);

    // uniq_trip_categories_user_name is scoped to (user_id, name) — two
    // different users may each have a 'Ski Trip' category without conflict.
    const existing = await tripCategoryRepository.findAll(userId);
    if (existing.some((c) => c.name === name)) {
      throw new ConflictError(`Category '${name}' already exists`);
    }

    const created = await tripCategoryRepository.create(userId, name);
    res.status(201).json(serializeCategory(created));
  }),
);

// ----------------------------------------------------------------
// PATCH /api/categories/:id — update name or is_active, owned by the caller
// ----------------------------------------------------------------
// nosemgrep: travel-tracker.express-route-no-auth -- reason: requireAuth applied globally via app.use('/api/', requireAuth) in server.ts
categoriesRouter.patch(
  '/:id',
  validateBody(UpdateAdminItemSchema),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const id = parseInt(String(req.params.id), 10);
    if (Number.isNaN(id)) throw new NotFoundError('Category');

    const { name, is_active } = req.body;
    const updated = await tripCategoryRepository.update(userId, id, {
      name,
      isActive: is_active !== undefined ? (is_active ? 1 : 0) : undefined,
    });
    if (!updated) throw new NotFoundError('Category');

    res.json(serializeCategory(updated));
  }),
);

// ----------------------------------------------------------------
// DELETE /api/categories/:id — soft-delete, owned by the caller
// ----------------------------------------------------------------
// nosemgrep: travel-tracker.express-route-no-auth -- reason: requireAuth applied globally via app.use('/api/', requireAuth) in server.ts
categoriesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const id = parseInt(String(req.params.id), 10);
    if (Number.isNaN(id)) throw new NotFoundError('Category');

    const existing = await tripCategoryRepository.findById(userId, id);
    if (!existing) throw new NotFoundError('Category');
    if (existing.isActive === 0) {
      throw new ValidationError('Category is already inactive');
    }

    const updated = await tripCategoryRepository.deactivate(userId, id);
    res.json(serializeCategory(updated!));
  }),
);
