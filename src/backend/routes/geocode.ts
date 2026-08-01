/**
 * Travel Tracker — Geocode Proxy Router (ADL-46 D7 §5.1 / BUG-55)
 *
 * A first-party backend proxy for Nominatim lookups. Replaces the direct
 * browser fetch in useCities.ts, which could never be policy-compliant: the
 * Nominatim usage policy requires an identifying User-Agent, and `User-Agent`
 * is a forbidden header name in browser fetch() (silently dropped). The
 * server-side client sends a compliant User-Agent and — crucially — routes
 * through the single serialized egress chokepoint (nominatim-client), so the
 * 1 req/s per-application limit is actually enforceable across all callers
 * (§5.1.1). Removing the cross-origin call also makes the fix immune to the
 * QUAL-18 CSP environment-parity gap (there is no connect-src to allowlist).
 *
 * Serves two callers with one route:
 *   - GE-15 country auto-populate: the top candidate's country_code / region_iso.
 *   - ADL-46 D14 (§4.3.2): the full candidate list, so the frontend can populate
 *     the region selector rather than the backend guessing data[0].
 *
 * requireAuth (applied globally via app.use('/api/', requireAuth) in server.ts)
 * is the only gate — it is a first-party egress surface and must never be
 * callable anonymously. No userId scoping: this reads no user data (tier-1
 * reference lookup).
 */

import { Router } from 'express';
import { asyncHandler } from '../middleware/error-handler.js';
import { validateQuery } from '../middleware/validate.js';
import { nominatimSearch } from '../services/nominatim-client.js';
import { GeocodeQuerySchema } from '../validation/geocode.schemas.js';

export const geocodeRouter = Router();

// ----------------------------------------------------------------
// GET /api/geocode?q=...&country_code=...&region_iso=...
// ----------------------------------------------------------------
// nosemgrep: travel-tracker.express-route-no-auth -- reason: requireAuth applied globally via app.use('/api/', requireAuth) in server.ts
geocodeRouter.get(
  '/',
  validateQuery(GeocodeQuerySchema),
  asyncHandler(async (req, res) => {
    const { q, country_code, region_iso } = req.query as {
      q: string;
      country_code?: string;
      region_iso?: string;
    };

    const params: Record<string, string> = { q, limit: '10' };
    if (country_code) params.countrycodes = country_code.toLowerCase();

    const result = await nominatimSearch(params);
    let candidates = result.status === 'ok' ? result.candidates : [];

    // D12 step 2: if a region ISO was supplied and any candidate matches it,
    // narrow to those — but never fabricate a result when none match.
    if (region_iso) {
      const matches = candidates.filter(
        (c) => c.regionIso?.toUpperCase() === region_iso.toUpperCase(),
      );
      if (matches.length) candidates = matches;
    }

    res.json({
      // Full candidate list (D14) — labelled by region for the selector.
      candidates: candidates.map((c) => ({
        name: c.name,
        display_name: c.displayName,
        country_code: c.countryCode,
        region_iso: c.regionIso,
        latitude: c.latitude,
        longitude: c.longitude,
      })),
      // GE-15 auto-populate convenience — the top candidate's country/region.
      country_code: candidates[0]?.countryCode ?? null,
      region_iso: candidates[0]?.regionIso ?? null,
    });
  }),
);
