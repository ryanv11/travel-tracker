/**
 * Travel Tracker — Map Shading Router
 *
 * Returns computed shading states for world map rendering.
 * All state computation is done by shading.service.ts at query time.
 * Config updates invalidate that user's in-memory config cache entry.
 *
 * ADL-28 (AD-07): shading config and shading reads are per-user, not
 * owner-only. requireAuth (applied globally via app.use('/api/', requireAuth)
 * in server.ts) is the only gate — every handler scopes to req.user!.id.
 */

import { Router } from 'express';
import { NotFoundError, ValidationError } from '../errors.js';
import { asyncHandler } from '../middleware/error-handler.js';
import { validateBody } from '../middleware/validate.js';
import { referenceRepository } from '../repositories/reference.js';
import { shadingConfigRepository } from '../repositories/shadingConfig.js';
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
// ADL-28 (AD-07): requireAuth only, scoped to req.user!.id
// ----------------------------------------------------------------
// nosemgrep: travel-tracker.express-route-no-auth -- reason: requireAuth applied globally via app.use('/api/', requireAuth) in server.ts
mapRouter.get(
  '/shading',
  asyncHandler(async (req, res) => {
    const result = await getAllCountryShading(req.user!.id);
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
// GET /api/map/shading/config  — all shading config rows for the caller
// ADL-28 (AD-07): requireAuth only, scoped to req.user!.id. Lazily seeds
// the caller's 6 default rows on first access (shadingConfigRepository).
// ----------------------------------------------------------------
// nosemgrep: travel-tracker.express-route-no-auth -- reason: requireAuth applied globally via app.use('/api/', requireAuth) in server.ts
mapRouter.get(
  '/shading/config',
  asyncHandler(async (req, res) => {
    const rows = await shadingConfigRepository.findAll(req.user!.id);
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
// ADL-28 (AD-07): requireAuth only, scoped to req.user!.id
// ----------------------------------------------------------------
// nosemgrep: travel-tracker.express-route-no-auth -- reason: requireAuth applied globally via app.use('/api/', requireAuth) in server.ts
mapRouter.patch(
  '/shading/config/:stateKey',
  validateBody(UpdateShadingConfigSchema),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const stateKey = String(req.params.stateKey);
    const { display_name, color_hex } = req.body;

    const updated = await shadingConfigRepository.update(userId, stateKey, {
      displayName: display_name,
      colorHex: color_hex,
    });
    if (!updated) throw new NotFoundError('Shading config');

    // Invalidate only this user's cache entry so next shading query picks up
    // the new colours — does not affect any other user's cached config.
    invalidateConfigCache(userId);

    res.json({
      state_key: updated.stateKey,
      display_name: updated.displayName,
      color_hex: updated.colorHex,
      updated_at: updated.updatedAt,
    });
  }),
);

// ----------------------------------------------------------------
// GET /api/map/shading/countries/:countryCode  — single country + regions
// ADL-28 (AD-07): requireAuth only, scoped to req.user!.id
// ----------------------------------------------------------------
// nosemgrep: travel-tracker.express-route-no-auth -- reason: requireAuth applied globally via app.use('/api/', requireAuth) in server.ts
mapRouter.get(
  '/shading/countries/:countryCode',
  asyncHandler(async (req, res) => {
    const countryCode = String(req.params.countryCode).toUpperCase();
    const userId = req.user!.id;

    const country = await referenceRepository.findCountryRegionTier(countryCode);
    if (!country) throw new NotFoundError('Country');

    const shading = await getCountryShading(countryCode, userId);
    if (!shading) throw new NotFoundError('Country');

    const regionShading =
      country.regionTierEnabled === 1 ? await getRegionShading(countryCode, userId) : [];

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
// ADL-28 (AD-07): requireAuth only, scoped to req.user!.id
// ----------------------------------------------------------------
// nosemgrep: travel-tracker.express-route-no-auth -- reason: requireAuth applied globally via app.use('/api/', requireAuth) in server.ts
mapRouter.get(
  '/shading/regions/:countryCode',
  asyncHandler(async (req, res) => {
    const countryCode = String(req.params.countryCode).toUpperCase();

    const country = await referenceRepository.findCountryRegionTier(countryCode);
    if (!country) throw new NotFoundError('Country');

    if (country.regionTierEnabled === 0) {
      throw new ValidationError('Country does not have region tier enabled');
    }

    const result = await getRegionShading(countryCode, req.user!.id);

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
