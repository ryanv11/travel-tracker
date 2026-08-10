/**
 * Travel Tracker — Cities Router
 *
 * City search, creation, carry-forward query, and city-level item history.
 * Geocoding is attempted immediately on city creation; failures are silent (GE-12).
 *
 * ADL-53 §4 / D3 (QUAL-43 Stage 2): the handlers here are thin. Every query
 * lives in `citiesRepository`; the identity / find-or-create algebra lives in
 * `cityIdentityService`. This file opens no database handle of its own — every
 * query is a repository call (ADL-53 D5).
 * What remains in the handlers is request/response shape plus the
 * resolve-then-create geocode ORCHESTRATION, which OQ-3 deliberately kept out
 * of the identity service.
 */

import { Router } from 'express';
import { NotFoundError, ValidationError } from '../errors.js';
import { asyncHandler } from '../middleware/error-handler.js';
import { requireOwner } from '../middleware/requireOwner.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { citiesRepository } from '../repositories/cities.js';
import {
  createOrReuseCarriedCity,
  findOrUpgradeCity,
  insertCityOrReuse,
} from '../services/cityIdentityService.js';
import { resolveCity, resolveCityName } from '../services/geocoding.service.js';
import {
  CityItemsQuerySchema,
  CreateCitySchema,
  PatchCitySchema,
  SearchCitiesQuerySchema,
} from '../validation/cities.schemas.js';

export const citiesRouter = Router();

// ----------------------------------------------------------------
// GET /api/cities  (search)
// ----------------------------------------------------------------
citiesRouter.get(
  '/',
  validateQuery(SearchCitiesQuerySchema),
  asyncHandler(async (req, res) => {
    const { q, country_code, country_codes } = req.query as {
      q: string;
      country_code?: string;
      country_codes?: string[];
    };
    const userId = req.user!.id;

    const results = await citiesRepository.search(userId, {
      q,
      countryCode: country_code,
      countryCodes: country_codes,
    });

    res.json(results);
  }),
);

/** Serialize a city row to the snake_case API shape. */
function serializeCity(row: {
  id: number;
  name: string;
  countryCode: string;
  regionId: number | null;
  latitude: number | null;
  longitude: number | null;
  geocodeStatus: string;
}) {
  return {
    id: row.id,
    name: row.name,
    country_code: row.countryCode,
    region_id: row.regionId,
    latitude: row.latitude,
    longitude: row.longitude,
    geocode_status: row.geocodeStatus,
  };
}

// ----------------------------------------------------------------
// POST /api/cities
// ADL-46 D4/D5/GE-16: city CREATION is a constrained, service-validated
// create-on-demand available to ANY authenticated user (requireAuth only) —
// NOT owner-only. City CURATION (PATCH) stays owner-only (tier 1 write split,
// §4.1). The old `requireOwner` gate conflated the two.
//
// Resolve-then-create (§4.3): the row is built from the geocoder's CANONICAL
// response where one is available, so 'Denverr' / 'denver co' / 'DEN' converge
// onto one row rather than only exact case-folds. D12 (§4.3.1): the lookup is
// CONSTRAINED by the user's already-validated country (and region where given)
// and may NEVER override them; unresolvable / offline / ambiguous input still
// creates a 'pending' row from the user's text (GE-12 — creation never depends
// on the geocoder), creator-private until it resolves (§4.4 containment).
//
// D13 (§4.2.1): identity is (name, country_code, COALESCE(region_id,0)); the
// three-step find-or-create (findOrUpgradeCity + the reverse-ambiguity branch)
// is what keeps this from re-opening BUG-33 by silently creating duplicates.
// ----------------------------------------------------------------
citiesRouter.post(
  '/',
  validateBody(CreateCitySchema),
  asyncHandler(async (req, res) => {
    const { name, country_code, region_id, osm_type, osm_id, display_name } = req.body;
    const userId = req.user!.id;

    // Verify country exists
    const country = await citiesRepository.findCountryRegionTier(country_code);
    if (!country) throw new NotFoundError('Country');

    const { regionTierEnabled } = country;

    // region_id is OPTIONAL when region_tier_enabled = 1, but MUST be NULL when 0.
    if (regionTierEnabled === 0 && region_id != null) {
      throw new ValidationError('region_id must not be provided for countries without region tier');
    }

    // If region_id is provided, verify it belongs to the country and capture its
    // ISO code so the geocoder lookup can be disambiguated by region (D12 step 2).
    let regionIso: string | null = null;
    if (region_id != null) {
      const region = await citiesRepository.findRegionInCountry(region_id, country_code);
      if (!region) throw new NotFoundError('Region');
      regionIso = region.iso;
    }

    // BUG-75 v3 §2.3/§B1-B3 — carried-pick branch. B2: a carried osm_id takes
    // over the WHOLE find-or-create decision; the legacy (name, country,
    // region) fallback below is for name-only input and must NOT fire here —
    // it would collapse distinct real places sharing (name, country, region)
    // onto each other via the name match instead of coexisting by osm_id
    // (exactly the coexistence case this feature exists to fix). region_id
    // (D12 rule 3) and display_name flow straight to createOrReuseCarriedCity
    // unchanged — the server never trusts client coordinates (§2.3; none are
    // even accepted by CreateCitySchema).
    if (osm_type != null && osm_id != null) {
      const result = await createOrReuseCarriedCity({
        osmType: osm_type,
        osmId: osm_id,
        displayName: display_name ?? null,
        name,
        countryCode: country_code,
        regionId: region_id ?? null,
        userId,
      });
      res.status(result.created ? 201 : 200).json(serializeCity(result.city));
      return;
    }

    // ── Legacy (name, country, region) branch — unchanged shape ──
    // Pass 1 (§4.3 step 2) — find-or-create against the user's submitted name.
    const found1 = await findOrUpgradeCity(name, country_code, region_id ?? null, userId);
    if (found1) {
      res.status(200).json(serializeCity(found1));
      return;
    }

    // Resolve-then-create (§4.3 step 3) — resolve BEFORE inserting so the row is
    // built from the canonical response. GEOCODING_ENABLED=false / offline /
    // recoverable errors return 'disabled' → fall through to the pending insert.
    // GE-12: city creation must NEVER depend on the geocoder — any failure in the
    // resolve step degrades to a 'pending' row rather than failing the request.
    let resolution: Awaited<ReturnType<typeof resolveCityName>>;
    try {
      resolution = await resolveCityName(name, country_code, { regionIso });
    } catch {
      resolution = { status: 'disabled', candidates: [] };
    }

    if (resolution.status === 'ok' && resolution.best) {
      const canonicalName = resolution.best.name?.trim() || name;

      // Pass 2 (§4.3 step 4a) — find-or-create against the CANONICAL name. This
      // is the step that does the real convergence work and is easy to omit.
      const found2 = await findOrUpgradeCity(
        canonicalName,
        country_code,
        region_id ?? null,
        userId,
      );
      if (found2) {
        res.status(200).json(serializeCity(found2));
        return;
      }

      // Step 4b — INSERT from the canonical response. D12 rule 3: NEVER overwrite
      // the user-supplied country_code / region_id with the lookup's — the user
      // has ground truth about where they went; the lookup supplies only coords
      // and the canonical name.
      //
      // M-A (delta review, v2 §7 rule 2c restored): stamp the candidate's OSM
      // ref on EVERY resolve, not only carried-pick resolves — otherwise this
      // row is invisible to the resolved-by-OSM merge mechanism and a second
      // user converging on the same real place via a different name creates a
      // duplicate NULL-osm_id row. F3: the INSERT is caught-violation →
      // re-select-and-reuse (M1) — a concurrent same-place add merges instead
      // of 500ing.
      const best = resolution.best;
      const now = new Date().toISOString();
      const { row: insertedRow, created } = await insertCityOrReuse(
        () =>
          citiesRepository.insert({
            name: canonicalName,
            countryCode: country_code,
            regionId: region_id ?? null,
            latitude: best.latitude,
            longitude: best.longitude,
            osmType: best.osmType ?? null,
            osmId: best.osmId ?? null,
            displayName: best.displayName ?? null,
            geocodeStatus: 'resolved',
            createdByUserId: userId,
            createdAt: now,
            updatedAt: now,
          }),
        () => citiesRepository.findByOsmRef(best.osmType, best.osmId),
      );
      res.status(created ? 201 : 200).json(serializeCity(insertedRow));
      return;
    }

    // Step 4c — unresolved / ambiguous / disabled: create a 'pending' row from the
    // user's own text. Creator-private until it resolves (§4.4). Ambiguity never
    // blocks creation (GE-12); the frontend's D14 candidate flow disambiguates
    // via the region selector, after which a re-submit with a region hits the
    // wildcard-upgrade path above.
    //
    // F3: caught-violation → re-select-and-reuse (M1) — a double-submit or
    // concurrent request for the same (name, country, region, creator) pending
    // key merges onto the existing row instead of 500ing.
    const now = new Date().toISOString();
    const { row: city, created } = await insertCityOrReuse(
      () =>
        citiesRepository.insert({
          name,
          countryCode: country_code,
          regionId: region_id ?? null,
          geocodeStatus: 'pending',
          createdByUserId: userId,
          createdAt: now,
          updatedAt: now,
        }),
      () => findOrUpgradeCity(name, country_code, region_id ?? null, userId),
    );

    // Fire-and-forget the queue re-resolution so a legitimate city created while
    // the geocoder was unreachable is promoted to 'resolved' (and globally
    // visible) on its own (GE-12 / §4.4). Never throws.
    //
    // ADL-46 F1/F2 ruling §2.6: SKIP this when resolution.status === 'ambiguous'
    // — the route already holds the verdict resolveCity would recompute, and
    // under R2 a second call provably reaches the identical result while
    // costing a second Nominatim request against a 1 req/s budget and burning
    // an attempt for nothing. Still fired for 'unresolved' and 'disabled': the
    // answer there is genuinely unknown to this route. The 15-minute queue
    // still picks the pending ambiguous row up and spends its bounded retry
    // budget — that cost is intended, not a leak.
    if (created && resolution.status !== 'ambiguous') {
      resolveCity(city.id).catch(() => {
        /* handled internally — defensive catch */
      });
    }

    const fresh = await citiesRepository.findById(city.id);
    res.status(created ? 201 : 200).json(serializeCity(fresh ?? city));
  }),
);

// ----------------------------------------------------------------
// GET /api/cities/:id  (BUG-29)
// Read-only single-city fetch, used by the frontend geocode retry queue to
// poll geocode_status without issuing writes. Authenticated read (app-level
// requireAuth) — cities are global seed data, so no owner gate and no
// per-user scoping (matches GET /api/cities search). Never triggers
// geocoding (ADL-10) — the backend queue owns re-resolution.
// ----------------------------------------------------------------
citiesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const cityId = parseInt(String(req.params.id), 10);
    if (Number.isNaN(cityId)) throw new NotFoundError('City');

    const city = await citiesRepository.findByIdWithRegion(cityId);
    if (!city) throw new NotFoundError('City');

    res.json({
      id: city.id,
      name: city.name,
      country_code: city.countryCode,
      region_id: city.regionId,
      region_name: city.regionName,
      region_iso: city.regionIso,
      latitude: city.latitude,
      longitude: city.longitude,
      geocode_status: city.geocodeStatus,
    });
  }),
);

// ----------------------------------------------------------------
// PATCH /api/cities/:id  (C2)
// ADL-27 / SE-03: owner-only (city edits pollute the global seed)
// ----------------------------------------------------------------
citiesRouter.patch(
  '/:id',
  requireOwner,
  validateBody(PatchCitySchema),
  asyncHandler(async (req, res) => {
    const cityId = parseInt(String(req.params.id), 10);
    if (Number.isNaN(cityId)) throw new NotFoundError('City');

    // Verify city exists
    const existing = await citiesRepository.findById(cityId);
    if (!existing) throw new NotFoundError('City');

    const { region_id } = req.body as { region_id?: number | null };

    // If region_id is provided (non-null), verify the region exists
    if (region_id != null) {
      const region = await citiesRepository.findRegionById(region_id);
      if (!region) throw new ValidationError('region_id does not exist');
    }

    const now = new Date().toISOString();
    // Only update region_id if the field was present in the request body
    const setValues =
      'region_id' in req.body
        ? { regionId: region_id ?? null, updatedAt: now }
        : { updatedAt: now };

    const updated = await citiesRepository.updateCity(cityId, setValues);

    const city = updated[0];
    res.json({
      id: city.id,
      name: city.name,
      country_code: city.countryCode,
      region_id: city.regionId,
      latitude: city.latitude,
      longitude: city.longitude,
      geocode_status: city.geocodeStatus,
    });
  }),
);

// ----------------------------------------------------------------
// GET /api/cities/:id/carry-forward  (IT-07)
// ----------------------------------------------------------------
citiesRouter.get(
  '/:id/carry-forward',
  asyncHandler(async (req, res) => {
    const cityId = parseInt(String(req.params.id), 10);
    if (Number.isNaN(cityId)) throw new NotFoundError('City');

    const userId = req.user!.id;
    const rows = await citiesRepository.findCarryForwardItems(userId, cityId);

    res.json(
      rows.map((r) => ({
        id: r.id,
        item_type: r.itemType,
        status: r.status,
        notes: r.notes,
        source_trip_name: r.sourceTripName,
        source_trip_end_date: r.sourceTripEndDate,
        restaurant_name: r.restaurantName,
        hotel_property_name: r.hotelPropertyName,
      })),
    );
  }),
);

// ----------------------------------------------------------------
// GET /api/cities/:id/items  (IT-09)
// ----------------------------------------------------------------
citiesRouter.get(
  '/:id/items',
  validateQuery(CityItemsQuerySchema),
  asyncHandler(async (req, res) => {
    const cityId = parseInt(String(req.params.id), 10);
    if (Number.isNaN(cityId)) throw new NotFoundError('City');

    const userId = req.user!.id;
    const { type, min_rating, sort_by, sort_order } = req.query as {
      type?: string;
      min_rating?: number;
      sort_by?: 'rating';
      sort_order?: 'asc' | 'desc';
    };

    const filtered = await citiesRepository.findCityItems(userId, cityId, {
      type,
      minRating: min_rating,
      sortBy: sort_by,
      sortOrder: sort_order,
    });

    res.json(
      filtered.map((r) => ({
        id: r.id,
        item_type: r.itemType,
        status: r.status,
        notes: r.notes,
        trip_name: r.tripName,
        trip_start_date: r.tripStartDate,
        restaurant_name: r.restaurantName,
        restaurant_rating: r.restaurantRating,
        restaurant_post_visit_notes: r.restaurantPostVisitNotes,
        hotel_property_name: r.hotelPropertyName,
        hotel_rating: r.hotelRating,
        hotel_post_visit_notes: r.hotelPostVisitNotes,
        experience_rating: r.experienceRating,
        experience_post_visit_notes: r.experiencePostVisitNotes,
      })),
    );
  }),
);
