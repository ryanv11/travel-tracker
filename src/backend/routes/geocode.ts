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
 *
 * BUG-79 (GitHub #379): the only frontend caller of this route today
 * (lookupCityCountry, useCities.ts) never supplies `country_code` — it's the
 * "discovery" lookup a country/region auto-fill runs BEFORE either is known,
 * so it cannot constrain by country the way the two other Nominatim call
 * sites (geocoding.service.ts, D12) already do. At the previous fixed
 * limit=10, a globally-ambiguous name (many Springfields worldwide) could
 * have its 10 slots spread across countries other than the one the user
 * actually meant, thinning the same-country region set down to a false
 * single survivor — indistinguishable from a genuinely unambiguous city
 * (Denver). Raising the discovery limit gives the existing D14 narrowing
 * (AddPlaceFlow.tsx) more same-country candidates to find, WITHOUT any
 * change to the request cadence — this is still exactly one upstream
 * request per keystroke-settle, only the `limit` value on that one request
 * changed. A country-constrained call keeps the original, already-narrow
 * limit — it doesn't have this problem, since `countrycodes` already
 * restricts Nominatim's search space.
 *
 * 40 was chosen for the discovery limit as a meaningfully larger, but not
 * extreme, value. Nominatim's actual maximum `limit` is not asserted here — do
 * NOT assume Nominatim is unreachable from this environment: it is allowlisted
 * (`.devcontainer/init-firewall.sh`) and reachable; probe if you need to confirm
 * a limit. The code does not assume 40 is honoured regardless: `truncated` below is
 * computed against whatever was actually requested, and everything downstream
 * (settlement filtering, D14 narrowing) already handles an arbitrary
 * candidate count. If the real cap is lower, Nominatim simply returns fewer
 * rows and the mechanism degrades to today's behaviour, not a crash.
 */

import { Router } from 'express';
import { asyncHandler } from '../middleware/error-handler.js';
import { validateQuery } from '../middleware/validate.js';
import { nominatimSearch } from '../services/nominatim-client.js';
import { GeocodeQuerySchema } from '../validation/geocode.schemas.js';

export const geocodeRouter = Router();

/** Unconstrained "discovery" lookup — no country_code supplied (BUG-79). */
const DISCOVERY_LIMIT = '40';
/** Already constrained by country — the original, narrower limit is fine. */
const CONSTRAINED_LIMIT = '10';

// ----------------------------------------------------------------
// GET /api/geocode?q=...&country_code=...&region_iso=...
// ----------------------------------------------------------------
// nosemgrep: travel-tracker.express-route-no-auth -- reason: requireAuth applied globally via app.use('/api/', requireAuth) in server.ts
geocodeRouter.get(
  '/',
  validateQuery(GeocodeQuerySchema),
  asyncHandler(async (req, res) => {
    const { q, country_code, region_iso, country_codes } = req.query as {
      q: string;
      country_code?: string;
      region_iso?: string;
      country_codes?: string[];
    };

    // GE-20 (ADL-54 D1/D2): country_code (singular, D12 create-time constraint)
    // and country_codes (plural, the trip's declared filter SET) are separate
    // params. Precedence when both are present (D1): the single explicit
    // country_code wins (narrower, user-confirmed) — never hit by any current
    // caller (discovery supplies the set, create supplies the single), but the
    // contract is stated so it's total.
    //
    // F1 (fresh-eyes, load-bearing): only forward `countrycodes` when the set
    // is NON-EMPTY. A present-but-empty country_codes ('' -> []) means
    // "not yet constrained" (PO Q1 ruling) and must fall through to the fully
    // unconstrained DISCOVERY path — forwarding `countrycodes=` (empty string)
    // would tell Nominatim "match no country", silently inverting that ruling.
    const effectiveCodes = country_code
      ? [country_code]
      : country_codes && country_codes.length > 0
        ? country_codes
        : null;

    // D2 limit tier: a single-country set keeps the original narrow
    // CONSTRAINED_LIMIT (countrycodes already restricts the search space to
    // one country). A multi-country set (>=2) uses DISCOVERY_LIMIT instead —
    // more countries means more legitimate same-name candidates to separate
    // in the picker, the same reasoning BUG-79 already established for the
    // fully-unconstrained case.
    const params: Record<string, string> = {
      q,
      limit: effectiveCodes && effectiveCodes.length === 1 ? CONSTRAINED_LIMIT : DISCOVERY_LIMIT,
    };
    if (effectiveCodes) params.countrycodes = effectiveCodes.join(',').toLowerCase();

    const result = await nominatimSearch(params);
    let candidates = result.status === 'ok' ? result.candidates : [];
    const truncated = result.status === 'ok' ? (result.truncated ?? false) : false;
    // BUG-74 (design doc §6/§9.9 AC-11/12/13): propagate the status the
    // client already computed instead of discarding it. Before this, 'error'
    // (Nominatim down), 'disabled' (GEOCODING_ENABLED=false), and 'ok' with a
    // genuine no-match all collapsed to an indistinguishable candidates:[] at
    // HTTP 200 — this is exactly why BUG-76 was invisible (Denver returned
    // candidates:[] at 200, identical to a real miss). Always HTTP 200; the
    // frontend distinguishes "our backend unreachable" (apiGet throws) from
    // "our backend answered, upstream geocoder is the problem" (status field)
    // — collapsing those into a non-2xx would lose that distinction. Additive
    // field — existing consumers that don't read `status` are unaffected.
    const status = result.status;

    // D12 step 2: if a region ISO was supplied and any candidate matches it,
    // narrow to those — but never fabricate a result when none match.
    if (region_iso) {
      const matches = candidates.filter(
        (c) => c.regionIso?.toUpperCase() === region_iso.toUpperCase(),
      );
      if (matches.length) candidates = matches;
    }

    res.json({
      // BUG-74 (NEW): 'ok' | 'error' | 'disabled', mirroring the client's
      // NominatimSearchResult union. Meaningful only when status==='ok' is
      // `candidates` a genuine (possibly empty) result — see the comment
      // above where `status` is captured.
      status,
      // Full candidate list (D14) — labelled by region for the selector.
      // BUG-75 v3 §1/§B1: osm_type/osm_id are the carried identity a picked
      // candidate's create request sends back (§2.3/§B1); display_name was
      // already surfaced. Never a match key on this side either — just
      // render/carry payload for the frontend CityPicker.
      candidates: candidates.map((c) => ({
        name: c.name,
        display_name: c.displayName,
        country_code: c.countryCode,
        region_iso: c.regionIso,
        latitude: c.latitude,
        longitude: c.longitude,
        osm_type: c.osmType ?? null,
        osm_id: c.osmId ?? null,
        // BUG-81 — structured NAMES (not codes) for a clean "City, State,
        // Country" picker row, distinct from the country_code/region_iso
        // codes above. county is disambiguation-only payload (never a match
        // key — same rule as county already carries on NominatimCandidate).
        // Presentation (label composition, collision-county rule, scroll
        // cap) is a FRONTEND follow-up, not built here.
        state: c.stateName ?? null,
        country: c.countryName ?? null,
        county: c.county ?? null,
      })),
      // GE-15 auto-populate convenience — the top candidate's country/region.
      country_code: candidates[0]?.countryCode ?? null,
      region_iso: candidates[0]?.regionIso ?? null,
      // BUG-79: true when Nominatim's raw response (before the settlement-type
      // filter above ever runs) was at least as large as the limit we asked
      // for — there may be candidates beyond it we never saw. The frontend
      // uses this to avoid presenting a narrowed-to-one-region result as
      // certain when it might just be truncated. Always false for a
      // country-constrained call in practice (10 is rarely hit once the
      // search space is already narrowed), computed the same way regardless.
      truncated,
    });
  }),
);
