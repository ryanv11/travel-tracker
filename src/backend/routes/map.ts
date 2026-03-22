/**
 * Travel Tracker — Map Shading Router
 *
 * Returns computed shading states for world map rendering.
 * All state computation is done by shading.service.ts at query time.
 * Config updates invalidate the in-memory config cache.
 */

import { eq } from 'drizzle-orm';
import { Router } from 'express';
import { countries, getDb, mapShadingConfig } from '../db/index.js';
import { NotFoundError, ValidationError } from '../errors.js';
import { asyncHandler } from '../middleware/error-handler.js';
import { validateBody } from '../middleware/validate.js';
import {
  getAllCountryShading,
  getCountryShading,
  getRegionShading,
  invalidateConfigCache,
} from '../services/shading.service.js';
import { UpdateShadingConfigSchema } from '../validation/map.schemas.js';

export const mapRouter = Router();

// ----------------------------------------------------------------
// GET /api/map/shading  — all countries
// ----------------------------------------------------------------
mapRouter.get(
  '/shading',
  asyncHandler(async (_req, res) => {
    const result = await getAllCountryShading();
    res.json(
      result.map((r) => ({
        country_code: r.countryCode,
        state_key: r.stateKey,
        color_hex: r.colorHex,
        display_name: r.displayName,
      })),
    );
  }),
);

// ----------------------------------------------------------------
// GET /api/map/shading/config  — all shading config rows
// ----------------------------------------------------------------
mapRouter.get(
  '/shading/config',
  asyncHandler(async (_req, res) => {
    const db = getDb();
    const rows = await db.select().from(mapShadingConfig);
    res.json(
      rows.map((r) => ({
        state_key: r.stateKey,
        display_name: r.displayName,
        color_hex: r.colorHex,
        updated_at: r.updatedAt,
      })),
    );
  }),
);

// ----------------------------------------------------------------
// PATCH /api/map/shading/config/:stateKey
// ----------------------------------------------------------------
mapRouter.patch(
  '/shading/config/:stateKey',
  validateBody(UpdateShadingConfigSchema),
  asyncHandler(async (req, res) => {
    const stateKey = String(req.params.stateKey);
    const db = getDb();

    const existing = await db
      .select()
      .from(mapShadingConfig)
      .where(eq(mapShadingConfig.stateKey, stateKey))
      .limit(1);
    if (!existing.length) throw new NotFoundError('Shading config');

    const { display_name, color_hex } = req.body;
    const updates: Partial<typeof mapShadingConfig.$inferInsert> = {
      updatedAt: new Date().toISOString(),
    };
    if (display_name !== undefined) updates.displayName = display_name;
    if (color_hex !== undefined) updates.colorHex = color_hex;

    const updated = await db
      .update(mapShadingConfig)
      .set(updates)
      .where(eq(mapShadingConfig.stateKey, stateKey))
      .returning();

    // Invalidate cache so next shading query picks up the new colours
    invalidateConfigCache();

    const r = updated[0];
    res.json({
      state_key: r.stateKey,
      display_name: r.displayName,
      color_hex: r.colorHex,
      updated_at: r.updatedAt,
    });
  }),
);

// ----------------------------------------------------------------
// GET /api/map/shading/countries/:countryCode  — single country + regions
// ----------------------------------------------------------------
mapRouter.get(
  '/shading/countries/:countryCode',
  asyncHandler(async (req, res) => {
    const countryCode = String(req.params.countryCode).toUpperCase();
    const db = getDb();

    const countryRow = await db
      .select({ regionTierEnabled: countries.regionTierEnabled })
      .from(countries)
      .where(eq(countries.countryCode, countryCode))
      .limit(1);
    if (!countryRow.length) throw new NotFoundError('Country');

    const shading = await getCountryShading(countryCode);
    if (!shading) throw new NotFoundError('Country');

    const regionShading =
      countryRow[0].regionTierEnabled === 1 ? await getRegionShading(countryCode) : [];

    res.json({
      country_code: shading.countryCode,
      state_key: shading.stateKey,
      color_hex: shading.colorHex,
      display_name: shading.displayName,
      regions: regionShading.map((r) => ({
        region_id: r.regionId,
        region_name: r.regionName,
        iso_3166_2: r.iso3166_2,
        state_key: r.stateKey,
        color_hex: r.colorHex,
        display_name: r.displayName,
      })),
    });
  }),
);

// ----------------------------------------------------------------
// GET /api/map/shading/regions/:countryCode  — all regions for country
// ----------------------------------------------------------------
mapRouter.get(
  '/shading/regions/:countryCode',
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

    const result = await getRegionShading(countryCode);

    res.json(
      result.map((r) => ({
        region_id: r.regionId,
        region_name: r.regionName,
        iso_3166_2: r.iso3166_2,
        state_key: r.stateKey,
        color_hex: r.colorHex,
        display_name: r.displayName,
      })),
    );
  }),
);
