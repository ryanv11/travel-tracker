/**
 * Travel Tracker — Admin Router
 *
 * Manages instance-administration config: country region-tier config and region CRUD.
 * These are the tier-3 (instance administration) operations from ADL-46 D1.
 *
 * Auth model (BUG-61 / ADL-38): the router is owner-gated by default via a router-level
 * requireOwner guard, EXCEPT the two global reference-data GET routes (countries + regions),
 * which are registered above the guard and require only authentication. See the guard block
 * below for the fail-closed invariant.
 *
 * ADL-28 (AD-08): companions used to be registered here (`/api/admin/companions`) but are
 * no longer an admin/owner-only resource — they moved to their own router at
 * `/api/companions` (requireAuth only, userId-scoped). See routes/companions.ts.
 *
 * ADL-46 (AD-09, D3): trip categories and activities followed the same path — they were
 * per-user (tier 2), not instance administration, and a tier-2 resource on an owner-gated
 * admin router was the structural error behind BUG-63. They moved to their own routers at
 * `/api/categories` and `/api/activities` (requireAuth only, userId-scoped, lazily seeded).
 * See routes/categories.ts and routes/activities.ts. The old admin-list CRUD factory that
 * served both from here has been removed, NOT left as scaffolding (ADL-46 §9.1 / §9.3).
 * Note: `GET/POST/PATCH/DELETE /api/admin/categories` (and /activities) still return 403 for
 * a non-owner — router-level requireOwner runs before any route resolves, so a non-owner hits
 * the guard and gets 403; an owner now gets 404 (the routes no longer exist). This is the
 * fail-closed behaviour asserted by the access-matrix suite (ADL-46 §8.2 verified counterpoint).
 */

import { and, eq } from 'drizzle-orm';
import { Router } from 'express';
import { countries, getDb, regions } from '../db/index.js';
import { NotFoundError, ValidationError } from '../errors.js';
import { asyncHandler } from '../middleware/error-handler.js';
import { requireOwner } from '../middleware/requireOwner.js';
import { validateBody } from '../middleware/validate.js';
import {
  CreateRegionSchema,
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

// Categories and activities are intentionally NOT registered here.
// ADL-46 (AD-09, D3): they are per-user (tier 2) resources and moved to their
// own routers at /api/categories and /api/activities (requireAuth only,
// userId-scoped). Companions moved the same way under ADL-28 (AD-08). The old
// admin-list CRUD factory that served categories/activities from here was
// removed as part of this same release — no scaffolding left behind
// (ADL-46 §9.1 ordering constraint 1, §9.3).

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
