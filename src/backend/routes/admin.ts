/**
 * Travel Tracker — Admin Router
 *
 * Manages admin list tables (categories, activities, companions) and country/region config.
 * All admin list items use soft-delete (is_active = 0) — never hard-delete (AD-06).
 *
 * Auth model (BUG-61 / ADL-38): the router is owner-gated by default via a router-level
 * requireOwner guard, EXCEPT the two global reference-data GET routes (countries + regions),
 * which are registered above the guard and require only authentication. See the guard block
 * below for the fail-closed invariant.
 */

import { and, eq } from 'drizzle-orm';
import { Router } from 'express';
import { activities, companions, countries, getDb, regions, tripCategories } from '../db/index.js';
import { ConflictError, NotFoundError, ValidationError } from '../errors.js';
import { asyncHandler } from '../middleware/error-handler.js';
import { requireOwner } from '../middleware/requireOwner.js';
import { validateBody } from '../middleware/validate.js';
import {
  CreateAdminItemSchema,
  CreateRegionSchema,
  UpdateAdminItemSchema,
  UpdateCountrySchema,
  UpdateRegionSchema,
} from '../validation/admin.schemas.js';

export const adminRouter = Router();

// ================================================================
// Global reference-data READS — any authenticated user (BUG-61 / ADL-38)
//
// GE-04 / GE-05: countries and their region-tier config ship as global,
// pre-seeded defaults available to every user out of the box (same tier as
// AD-09 categories/activities) — NOT owner-configured, per-user data. The
// trip-create country picker (TripForm.tsx → useCountries) must therefore be
// readable by any authenticated account, or a non-owner cannot create a trip
// at all (the picker renders empty and 403s).
//
// These GET routes are registered BEFORE the router-level requireOwner guard
// below, so requireAuth (applied globally to /api/* in server.ts) is their
// only gate. The matching WRITE operations (PATCH country config, POST/PATCH
// regions) stay owner-only — they are registered AFTER the guard.
//
// FAIL-CLOSED INVARIANT: only reads of global reference data belong above the
// guard. Every write, and everything else, MUST stay below it so the router
// remains owner-gated by default — a newly added route is owner-only unless a
// future author deliberately moves it into this block. Do not add write routes
// or per-user data reads here.
//
// This is distinct from ADL-28 (BRD-AD07/AD08 per-user map-shading + companions):
// that work makes genuinely owner-only data work per-user via a userId FK; this
// is global, already-shared data that was wrongly gated as owner-only.
// ================================================================

// GET /api/admin/countries — global country list (read: any authenticated user)
adminRouter.get(
  '/countries',
  asyncHandler(async (_req, res) => {
    const db = getDb();
    const rows = await db.select().from(countries).orderBy(countries.name);
    res.json(
      rows.map((r) => ({
        country_code: r.countryCode,
        name: r.name,
        region_tier_enabled: r.regionTierEnabled === 1,
        region_tier_label: r.regionTierLabel,
      })),
    );
  }),
);

// GET /api/admin/countries/:countryCode/regions — global region list (read: any authenticated user)
adminRouter.get(
  '/countries/:countryCode/regions',
  asyncHandler(async (req, res) => {
    const countryCode = String(req.params.countryCode).toUpperCase();
    const db = getDb();

    const rows = await db
      .select()
      .from(regions)
      .where(eq(regions.countryCode, countryCode))
      .orderBy(regions.name);

    res.json(
      rows.map((r) => ({
        id: r.id,
        country_code: r.countryCode,
        name: r.name,
        iso_3166_2: r.iso3166_2,
        created_at: r.createdAt,
        updated_at: r.updatedAt,
      })),
    );
  }),
);

// ADL-27 / HC-04: everything registered BELOW this line requires owner status.
// The read/write split above (BUG-61 / ADL-38) is the sole, deliberate exception.
adminRouter.use(requireOwner);

// ----------------------------------------------------------------
// Admin list CRUD factory
// Generates identical CRUD for categories, activities, companions.
// ----------------------------------------------------------------

type AdminTable = typeof tripCategories | typeof activities | typeof companions;

/** Serialize a raw Drizzle admin list row to snake_case API shape. */
function serializeAdminItem(row: {
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

function createAdminListRouter(table: AdminTable, resourceName: string): Router {
  const router = Router();

  // GET / — all (active + inactive)
  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      const db = getDb();
      const rows = await db.select().from(table);
      res.json(rows.map(serializeAdminItem));
    }),
  );

  // GET /active — active only
  router.get(
    '/active',
    asyncHandler(async (_req, res) => {
      const db = getDb();
      const rows = await db.select().from(table).where(eq(table.isActive, 1));
      res.json(rows.map(serializeAdminItem));
    }),
  );

  // POST / — create
  router.post(
    '/',
    validateBody(CreateAdminItemSchema),
    asyncHandler(async (req, res) => {
      const { name } = req.body;
      const db = getDb();

      // Check uniqueness (table has UNIQUE constraint — catch the DB error too)
      const existing = await db
        .select({ id: table.id })
        .from(table)
        .where(eq(table.name, name))
        .limit(1);
      if (existing.length) throw new ConflictError(`${resourceName} '${name}' already exists`);

      const now = new Date().toISOString();
      const inserted = await db
        .insert(table)
        .values({ name, createdAt: now, updatedAt: now })
        .returning();
      res.status(201).json(serializeAdminItem(inserted[0]));
    }),
  );

  // PATCH /:id — update name or is_active
  router.patch(
    '/:id',
    validateBody(UpdateAdminItemSchema),
    asyncHandler(async (req, res) => {
      const id = parseInt(String(req.params.id), 10);
      if (Number.isNaN(id)) throw new NotFoundError(resourceName);

      const db = getDb();
      const existing = await db.select().from(table).where(eq(table.id, id)).limit(1);
      if (!existing.length) throw new NotFoundError(resourceName);

      const { name, is_active } = req.body;
      const now = new Date().toISOString();
      const updates: Record<string, unknown> = { updatedAt: now };
      if (name !== undefined) updates.name = name;
      if (is_active !== undefined) updates.isActive = is_active ? 1 : 0;

      const updated = await db.update(table).set(updates).where(eq(table.id, id)).returning();
      res.json(serializeAdminItem(updated[0]));
    }),
  );

  // DELETE /:id — soft-delete
  router.delete(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = parseInt(String(req.params.id), 10);
      if (Number.isNaN(id)) throw new NotFoundError(resourceName);

      const db = getDb();
      const existing = await db.select().from(table).where(eq(table.id, id)).limit(1);
      if (!existing.length) throw new NotFoundError(resourceName);
      if (existing[0].isActive === 0) {
        throw new ValidationError(`${resourceName} is already inactive`);
      }

      const now = new Date().toISOString();
      const updated = await db
        .update(table)
        .set({ isActive: 0, updatedAt: now })
        .where(eq(table.id, id))
        .returning();
      res.json(serializeAdminItem(updated[0]));
    }),
  );

  return router;
}

// Register admin list routers
adminRouter.use('/categories', createAdminListRouter(tripCategories, 'Category'));
adminRouter.use('/activities', createAdminListRouter(activities, 'Activity'));
adminRouter.use('/companions', createAdminListRouter(companions, 'Companion'));

// ----------------------------------------------------------------
// Country admin — WRITES (owner-only; below the requireOwner guard).
// The GET reads for countries/regions live above the guard (BUG-61 / ADL-38).
// ----------------------------------------------------------------

// PATCH /api/admin/countries/:countryCode
adminRouter.patch(
  '/countries/:countryCode',
  validateBody(UpdateCountrySchema),
  asyncHandler(async (req, res) => {
    const countryCode = String(req.params.countryCode).toUpperCase();
    const db = getDb();

    const existing = await db
      .select()
      .from(countries)
      .where(eq(countries.countryCode, countryCode))
      .limit(1);
    if (!existing.length) throw new NotFoundError('Country');

    const { region_tier_enabled, region_tier_label } = req.body;
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { updatedAt: now };

    if (region_tier_enabled !== undefined) {
      updates.regionTierEnabled = region_tier_enabled ? 1 : 0;
    }
    if (region_tier_label !== undefined) {
      updates.regionTierLabel = region_tier_label;
    }

    const updated = await db
      .update(countries)
      .set(updates)
      .where(eq(countries.countryCode, countryCode))
      .returning();

    const r = updated[0];
    res.json({
      country_code: r.countryCode,
      name: r.name,
      region_tier_enabled: r.regionTierEnabled === 1,
      region_tier_label: r.regionTierLabel,
    });
  }),
);

// POST /api/admin/countries/:countryCode/regions
adminRouter.post(
  '/countries/:countryCode/regions',
  validateBody(CreateRegionSchema),
  asyncHandler(async (req, res) => {
    const countryCode = String(req.params.countryCode).toUpperCase();
    const db = getDb();

    const countryRow = await db
      .select({ regionTierEnabled: countries.regionTierEnabled })
      .from(countries)
      .where(eq(countries.countryCode, countryCode))
      .limit(1);
    if (!countryRow.length) throw new NotFoundError('Country');

    if (countryRow[0].regionTierEnabled === 0) {
      throw new ValidationError('Country does not have region tier enabled');
    }

    const { name, iso3166_2 } = req.body;
    const now = new Date().toISOString();
    const inserted = await db
      .insert(regions)
      .values({ countryCode, name, iso3166_2, createdAt: now, updatedAt: now })
      .returning();

    const r = inserted[0];
    res.status(201).json({
      id: r.id,
      country_code: r.countryCode,
      name: r.name,
      created_at: r.createdAt,
      updated_at: r.updatedAt,
    });
  }),
);

// PATCH /api/admin/countries/:countryCode/regions/:regionId
adminRouter.patch(
  '/countries/:countryCode/regions/:regionId',
  validateBody(UpdateRegionSchema),
  asyncHandler(async (req, res) => {
    const countryCode = String(req.params.countryCode).toUpperCase();
    const regionId = parseInt(String(req.params.regionId), 10);
    if (Number.isNaN(regionId)) throw new NotFoundError('Region');

    const db = getDb();
    const existing = await db
      .select()
      .from(regions)
      .where(and(eq(regions.id, regionId), eq(regions.countryCode, countryCode)))
      .limit(1);
    if (!existing.length) throw new NotFoundError('Region');

    const { name } = req.body;
    const now = new Date().toISOString();
    const updated = await db
      .update(regions)
      .set({ name, updatedAt: now })
      .where(eq(regions.id, regionId))
      .returning();

    const r = updated[0];
    res.json({
      id: r.id,
      country_code: r.countryCode,
      name: r.name,
      created_at: r.createdAt,
      updated_at: r.updatedAt,
    });
  }),
);
