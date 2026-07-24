/**
 * Travel Tracker — Companions Router
 *
 * ADL-28 (AD-08): companions are per-user, not an admin resource. requireAuth
 * (applied globally via app.use('/api/', requireAuth) in server.ts) is the
 * only gate — every handler is scoped to req.user!.id via companionRepository.
 * Soft-delete only (is_active = 0) — never hard-delete (AD-06), matching the
 * pattern the old admin list factory used.
 */

import { Router } from 'express';
import { ConflictError, NotFoundError, ValidationError } from '../errors.js';
import { asyncHandler } from '../middleware/error-handler.js';
import { validateBody } from '../middleware/validate.js';
import { companionRepository } from '../repositories/companions.js';
import { CreateCompanionSchema, UpdateCompanionSchema } from '../validation/companions.schemas.js';

export const companionsRouter = Router();

/** Serialize a raw Drizzle companion row to snake_case API shape. */
function serializeCompanion(row: {
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
// GET /api/companions — all (active + inactive) owned by the caller
// ----------------------------------------------------------------
// nosemgrep: travel-tracker.express-route-no-auth -- reason: requireAuth applied globally via app.use('/api/', requireAuth) in server.ts
companionsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const rows = await companionRepository.findAll(req.user!.id);
    res.json(rows.map(serializeCompanion));
  }),
);

// ----------------------------------------------------------------
// GET /api/companions/active — active only, owned by the caller
// ----------------------------------------------------------------
// nosemgrep: travel-tracker.express-route-no-auth -- reason: requireAuth applied globally via app.use('/api/', requireAuth) in server.ts
companionsRouter.get(
  '/active',
  asyncHandler(async (req, res) => {
    const rows = await companionRepository.findActive(req.user!.id);
    res.json(rows.map(serializeCompanion));
  }),
);

// ----------------------------------------------------------------
// POST /api/companions — create, owned by the caller
// ----------------------------------------------------------------
// nosemgrep: travel-tracker.express-route-no-auth -- reason: requireAuth applied globally via app.use('/api/', requireAuth) in server.ts
companionsRouter.post(
  '/',
  validateBody(CreateCompanionSchema),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { name } = req.body;

    // uniq_companions_user_name is scoped to (user_id, name) — two different
    // users may each have a companion named 'Partner' without conflict.
    const existing = await companionRepository.findAll(userId);
    if (existing.some((c) => c.name === name)) {
      throw new ConflictError(`Companion '${name}' already exists`);
    }

    const created = await companionRepository.create(userId, name);
    res.status(201).json(serializeCompanion(created));
  }),
);

// ----------------------------------------------------------------
// PATCH /api/companions/:id — update name or is_active, owned by the caller
// ----------------------------------------------------------------
// nosemgrep: travel-tracker.express-route-no-auth -- reason: requireAuth applied globally via app.use('/api/', requireAuth) in server.ts
companionsRouter.patch(
  '/:id',
  validateBody(UpdateCompanionSchema),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const id = parseInt(String(req.params.id), 10);
    if (Number.isNaN(id)) throw new NotFoundError('Companion');

    const { name, is_active } = req.body;
    const updated = await companionRepository.update(userId, id, {
      name,
      isActive: is_active !== undefined ? (is_active ? 1 : 0) : undefined,
    });
    if (!updated) throw new NotFoundError('Companion');

    res.json(serializeCompanion(updated));
  }),
);

// ----------------------------------------------------------------
// DELETE /api/companions/:id — soft-delete, owned by the caller
// ----------------------------------------------------------------
// nosemgrep: travel-tracker.express-route-no-auth -- reason: requireAuth applied globally via app.use('/api/', requireAuth) in server.ts
companionsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const id = parseInt(String(req.params.id), 10);
    if (Number.isNaN(id)) throw new NotFoundError('Companion');

    const existing = await companionRepository.findById(userId, id);
    if (!existing) throw new NotFoundError('Companion');
    if (existing.isActive === 0) {
      throw new ValidationError('Companion is already inactive');
    }

    const updated = await companionRepository.deactivate(userId, id);
    res.json(serializeCompanion(updated!));
  }),
);
