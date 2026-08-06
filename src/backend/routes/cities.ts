/**
 * Travel Tracker — Cities Router
 *
 * City search, creation, carry-forward query, and city-level item history.
 * Geocoding is attempted immediately on city creation; failures are silent (GE-12).
 */

import { and, asc, desc, eq, inArray, isNull, like, notInArray, or, sql } from 'drizzle-orm';
import { Router } from 'express';
import {
  cities,
  countries,
  getDb,
  itemExperiences,
  itemHotels,
  itemRestaurants,
  items,
  regions,
  tripPlaces,
  trips,
} from '../db/index.js';
import { NotFoundError, ValidationError } from '../errors.js';
import { asyncHandler } from '../middleware/error-handler.js';
import { requireOwner } from '../middleware/requireOwner.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { isUniqueViolation } from '../services/db-errors.js';
import { resolveByOsmId, resolveCity, resolveCityName } from '../services/geocoding.service.js';
import {
  CityItemsQuerySchema,
  CreateCitySchema,
  PatchCitySchema,
  SearchCitiesQuerySchema,
} from '../validation/cities.schemas.js';

export const citiesRouter = Router();

/** A full cities row, as returned by a select()/insert().returning(). */
type CityRow = typeof cities.$inferSelect;

// ----------------------------------------------------------------
// GET /api/cities  (search)
// ----------------------------------------------------------------
citiesRouter.get(
  '/',
  validateQuery(SearchCitiesQuerySchema),
  asyncHandler(async (req, res) => {
    const { q, country_code } = req.query as { q: string; country_code?: string };
    const userId = req.user!.id;

    const db = getDb();

    const conditions = [like(cities.name, `%${q}%`)];
    if (country_code) conditions.push(eq(cities.countryCode, country_code));

    // ADL-46 GE-16 / D5 containment (§4.4): a 'pending' city is visible only in
    // its creator's own searches; it becomes globally visible once 'resolved'.
    // The IS NULL branch (F3) is load-bearing and permanent, not a legacy
    // artefact — ON DELETE SET NULL regenerates a NULL creator on every user
    // deletion, so a row that is pending AND has no known creator must be global
    // (seeded, pre-column, or creator-since-deleted), never invisible-to-everyone.
    // 'unresolvable' rows are NOT globally visible — they were never resolved, so
    // they stay creator-scoped (or global when the creator is NULL) exactly like
    // 'pending'. Only 'resolved' promotes a row to the shared catalogue.
    const containment = or(
      eq(cities.geocodeStatus, 'resolved'),
      eq(cities.createdByUserId, userId),
      isNull(cities.createdByUserId),
    );

    // BUG-72: enrich each row with the region's human-readable name and ISO
    // code so the frontend can render "city, state, country" instead of a
    // bare region_id integer (which the client cannot resolve across
    // countries — it only loads the region list for one selected country).
    // LEFT JOIN is load-bearing, not cosmetic: an INNER join would drop every
    // row with a NULL region_id (any city in a non-region-tier country, or a
    // region-tier city not yet assigned one) out of search results entirely,
    // silently narrowing the GE-16 containment result set above. region_id
    // itself stays in the response unchanged — existing consumers depend on it.
    const results = await db
      .select({
        id: cities.id,
        name: cities.name,
        country_code: cities.countryCode,
        region_id: cities.regionId,
        region_name: regions.name,
        region_iso: regions.iso3166_2,
        latitude: cities.latitude,
        longitude: cities.longitude,
        geocode_status: cities.geocodeStatus,
      })
      .from(cities)
      .leftJoin(regions, eq(regions.id, cities.regionId))
      .where(and(...conditions, containment))
      .orderBy(cities.name);

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

/**
 * ADL-46 D13 (§4.2.1) — the three-step find-or-create, steps 1 & 2. Returns an
 * existing (or wildcard-upgraded) city row for (name, countryCode, regionId), or
 * null if a genuine insert is needed. NOT creator-scoped: the unique index is
 * global, so pass 1 must be able to return another user's pending row (OP-27 P2 /
 * §8 row 6) rather than colliding with the index on insert.
 *
 *   Step 1 — exact match on (name COLLATE NOCASE, country_code, COALESCE(region_id,0)),
 *            mirroring uniq_cities_name_country_region_ci exactly. Creator- and
 *            status-blind: the unique index is unconditional, so a filtered
 *            step 1 would miss another user's row and the follow-on insert
 *            would collide on it (ADL-46 F1/F2 ruling §3.1/§3.3 amendment 2).
 *   Step 2 — WILDCARD UPGRADE: if the request carries a region and step 1 missed,
 *            adopt a region-less row of the same name+country by SETTING its
 *            region_id. A region-less row is an under-specified record, not a
 *            different city — specialising it prevents the duplicate that naively
 *            adding `AND COALESCE(region_id,0)=…` would create (the BUG-33 class).
 *            ADL-46 F1/F2 ruling §3.3 (R1): scoped to rows the caller may
 *            legitimately mutate — `geocode_status IN ('pending','unresolvable')`
 *            (whitelist, not `<> 'resolved'`: fails closed on a future status)
 *            AND `(created_by_user_id = caller OR created_by_user_id IS NULL)`.
 *            A `resolved` row is visible to the caller (GE-16) but must NOT be
 *            upgradeable — read-through is global because the index is global;
 *            write-through is scoped because nothing forces it to be. Declining
 *            falls through to the ordinary insert on a distinct identity key
 *            (legal under D13, at most one extra row per name+country). On a
 *            successful upgrade the retry budget resets and, if the adopted row
 *            is still 'pending', resolution is re-fired — the region is the
 *            question, and a region-constrained lookup can collapse an
 *            ambiguity the unconstrained one could not (ruling §2.5/§3.3
 *            amendment 3). Not fired for an adopted 'unresolvable' row: the
 *            geocoder returned zero candidates, and a region constraint cannot
 *            turn zero into some (ruling §2.5 asymmetry).
 *
 *   Step 2b (reverse, NO region requested) — collapse to (name, country_code)
 *            regardless of region. This is the "today's behaviour" case the old
 *            `(name, country_code)` unique index enforced, which §4.2.1 requires
 *            we preserve:
 *              • exactly ONE row matches → return it (single-match, NO regression);
 *              • TWO OR MORE match → return null; the caller creates a 'pending'
 *                row and leaves D14 disambiguation to the frontend, rather than
 *                silently picking one (§4.2.1 / D14, QA B4).
 *            Without this, a region-tier country holding exactly one *regioned*
 *            match (e.g. only "Springfield, IL") would miss step 1 (its
 *            COALESCE(region_id,0) ≠ 0), skip step 2 (no region requested), and
 *            the caller would INSERT a second, region-less duplicate — the BUG-33
 *            class arriving through the reverse door.
 */
async function findOrUpgradeCity(
  db: ReturnType<typeof getDb>,
  name: string,
  countryCode: string,
  regionId: number | null,
  callerUserId: string,
) {
  const regionKey = regionId ?? 0;

  // Step 1 — exact match on the composite identity key. Creator- and
  // status-blind on purpose (see doc comment above).
  const exact = await db
    .select()
    .from(cities)
    .where(
      and(
        eq(cities.countryCode, countryCode),
        sql`${cities.name} = ${name} COLLATE NOCASE`,
        sql`COALESCE(${cities.regionId}, 0) = ${regionKey}`,
      ),
    )
    .limit(1);
  if (exact.length) return exact[0];

  // Step 2 — wildcard upgrade (only when the request carries a region).
  // ADL-46 F1/F2 ruling §3.3 (R1): whitelist status + creator-or-null scoping.
  if (regionId != null) {
    const regionless = await db
      .select()
      .from(cities)
      .where(
        and(
          eq(cities.countryCode, countryCode),
          sql`${cities.name} = ${name} COLLATE NOCASE`,
          isNull(cities.regionId),
          inArray(cities.geocodeStatus, ['pending', 'unresolvable']),
          or(eq(cities.createdByUserId, callerUserId), isNull(cities.createdByUserId)),
        ),
      )
      .limit(1);
    if (regionless.length) {
      const now = new Date().toISOString();
      const upgraded = await db
        .update(cities)
        .set({ regionId, geocodeAttempts: 0, updatedAt: now })
        .where(eq(cities.id, regionless[0].id))
        .returning();
      const upgradedRow = upgraded[0];
      // Re-ask: the region is the question, and a region-constrained lookup
      // can collapse an ambiguity the unconstrained one could not. Never fired
      // for an adopted 'unresolvable' row (ruling §2.5 asymmetry — zero
      // candidates cannot become some just because a region was added).
      if (upgradedRow.geocodeStatus === 'pending') {
        resolveCity(upgradedRow.id).catch(() => {
          /* handled internally — defensive catch */
        });
      }
      return upgradedRow;
    }
    // Has-region path ends here: step 1 + step 2 are authoritative for a
    // region-bearing request. Do NOT fall through to the reverse branch below.
    return null;
  }

  // Step 2b — reverse single-match (only when NO region was requested). Match on
  // (name, country_code) regardless of region; exactly one → return it (the
  // no-regression case §4.2.1 mandates), two or more → null (ambiguous → caller
  // creates pending, D14 disambiguates).
  const sameName = await db
    .select()
    .from(cities)
    .where(and(eq(cities.countryCode, countryCode), sql`${cities.name} = ${name} COLLATE NOCASE`))
    .limit(2);
  if (sameName.length === 1) return sameName[0];

  return null;
}

/** BUG-75 v3 §B2/B3 — an existing row already carrying this exact OSM ref, if any. */
async function findCityByOsmRef(
  db: ReturnType<typeof getDb>,
  osmType: string | null | undefined,
  osmId: number | null | undefined,
): Promise<CityRow | null> {
  if (osmType == null || osmId == null) return null;
  const rows = await db
    .select()
    .from(cities)
    .where(and(eq(cities.osmType, osmType), eq(cities.osmId, osmId)))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * BUG-75 v3 §B3/M1/F3 — the caught-unique-violation → re-select-and-reuse
 * pattern shared by every create-path INSERT (both the legacy resolved/
 * pending inserts below and the carried-ref inserts in
 * createOrReuseCarriedCity). A concurrent request for the same real place
 * wins the INSERT race; the loser catches the violation, re-selects, and
 * reuses the winner's row — never a 500, never a silent duplicate attempt.
 *
 * Not wrapped in db.transaction(): a single INSERT is already atomic w.r.t.
 * the unique index in SQLite, and a live probe against this project's libSQL
 * :memory: test client showed db.transaction() nulls out the client's
 * connection, breaking every subsequent query on it (repositories/trips.ts
 * documents the same finding) — the catch + re-select pattern here is
 * correct without an explicit transaction wrapper.
 */
async function insertCityOrReuse(
  insert: () => Promise<CityRow[]>,
  reselect: () => Promise<CityRow | null | undefined>,
): Promise<{ row: CityRow; created: boolean }> {
  try {
    const inserted = await insert();
    return { row: inserted[0], created: true };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const existing = await reselect();
    if (existing) return { row: existing, created: false };
    throw err;
  }
}

/**
 * BUG-75 v3 §B1-B3 — find-or-create by the CARRIED OSM identity
 * (osm_type, osm_id), bypassing the legacy (name, country, region) match
 * entirely (B2: the legacy fallback fires only when the incoming pick has NO
 * osm_id — firing it here would collapse distinct real places sharing
 * (name, country, region) onto each other, exactly the coexistence case this
 * feature exists to fix).
 *
 *   (a) an existing row already carrying this exact ref → reuse directly, no
 *       /lookup call (bounds egress: a repeat create of an already-known
 *       place costs zero additional Nominatim requests).
 *   (b) miss → canonicalize by ID via resolveByOsmId (F1, /lookup?osm_ids=).
 *       The server re-derives canonical coords/name from its OWN lookup; the
 *       carried ref only SELECTS which real place this is (v3 §2.3 — no
 *       client-trusted coordinates).
 *   (c)/(d) INSERT — resolved if canonicalized, else PENDING carrying the ref
 *       (M-B: covers BOTH genuinely offline/error AND a stale/reclassified
 *       carried id the same way, since both degrade to the same self-healing
 *       pending state on the create path — the standing 15-minute queue
 *       picks it up via resolveCity's carried-ref branch, which is where the
 *       two cases DO diverge, M-B's terminal 'unresolvable'). Both INSERTs
 *       go through insertCityOrReuse (M1/F3).
 */
async function createOrReuseCarriedCity(
  db: ReturnType<typeof getDb>,
  input: {
    osmType: 'node' | 'way' | 'relation';
    osmId: number;
    displayName: string | null;
    name: string;
    countryCode: string;
    regionId: number | null;
    userId: string;
  },
): Promise<{ city: CityRow; created: boolean }> {
  const { osmType, osmId, displayName, name, countryCode, regionId, userId } = input;

  const existingByRef = await findCityByOsmRef(db, osmType, osmId);
  if (existingByRef) return { city: existingByRef, created: false };

  const canonical = await resolveByOsmId(osmType, osmId);
  const now = new Date().toISOString();

  if (canonical) {
    const { row, created } = await insertCityOrReuse(
      () =>
        db
          .insert(cities)
          .values({
            name: canonical.name?.trim() || name,
            countryCode,
            regionId,
            latitude: canonical.latitude,
            longitude: canonical.longitude,
            osmType: canonical.osmType ?? osmType,
            osmId: canonical.osmId ?? osmId,
            displayName: canonical.displayName ?? displayName,
            geocodeStatus: 'resolved',
            createdByUserId: userId,
            createdAt: now,
            updatedAt: now,
          })
          .returning(),
      () => findCityByOsmRef(db, osmType, osmId),
    );
    return { city: row, created };
  }

  // M-B: offline/error OR a stale/reclassified carried id — both degrade to
  // a pending row retaining the carried ref so a later resolve (the
  // standing queue) can canonicalize or terminally resolve it.
  const { row, created } = await insertCityOrReuse(
    () =>
      db
        .insert(cities)
        .values({
          name,
          countryCode,
          regionId,
          osmType,
          osmId,
          displayName,
          geocodeStatus: 'pending',
          createdByUserId: userId,
          createdAt: now,
          updatedAt: now,
        })
        .returning(),
    () => findCityByOsmRef(db, osmType, osmId),
  );
  return { city: row, created };
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
    const db = getDb();

    // Verify country exists
    const countryRows = await db
      .select({ regionTierEnabled: countries.regionTierEnabled })
      .from(countries)
      .where(eq(countries.countryCode, country_code))
      .limit(1);
    if (!countryRows.length) throw new NotFoundError('Country');

    const { regionTierEnabled } = countryRows[0];

    // region_id is OPTIONAL when region_tier_enabled = 1, but MUST be NULL when 0.
    if (regionTierEnabled === 0 && region_id != null) {
      throw new ValidationError('region_id must not be provided for countries without region tier');
    }

    // If region_id is provided, verify it belongs to the country and capture its
    // ISO code so the geocoder lookup can be disambiguated by region (D12 step 2).
    let regionIso: string | null = null;
    if (region_id != null) {
      const regionRows = await db
        .select({ id: regions.id, iso: regions.iso3166_2 })
        .from(regions)
        .where(and(eq(regions.id, region_id), eq(regions.countryCode, country_code)))
        .limit(1);
      if (!regionRows.length) throw new NotFoundError('Region');
      regionIso = regionRows[0].iso;
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
      const result = await createOrReuseCarriedCity(db, {
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
    const found1 = await findOrUpgradeCity(db, name, country_code, region_id ?? null, userId);
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
        db,
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
          db
            .insert(cities)
            .values({
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
            })
            .returning(),
        () => findCityByOsmRef(db, best.osmType, best.osmId),
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
        db
          .insert(cities)
          .values({
            name,
            countryCode: country_code,
            regionId: region_id ?? null,
            geocodeStatus: 'pending',
            createdByUserId: userId,
            createdAt: now,
            updatedAt: now,
          })
          .returning(),
      () => findOrUpgradeCity(db, name, country_code, region_id ?? null, userId),
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

    const fresh = await db.select().from(cities).where(eq(cities.id, city.id)).limit(1);
    res.status(created ? 201 : 200).json(serializeCity(fresh[0] ?? city));
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

    const db = getDb();

    // BUG-80: LEFT JOIN regions so this city-shaped payload also carries
    // region_name/region_iso, matching GET /api/cities (search). LEFT, not
    // INNER: a NULL region_id (non-region-tier country, or a region-tier city
    // not yet assigned one) must still return the city row, not 404 it.
    const rows = await db
      .select({
        id: cities.id,
        name: cities.name,
        countryCode: cities.countryCode,
        regionId: cities.regionId,
        regionName: regions.name,
        regionIso: regions.iso3166_2,
        latitude: cities.latitude,
        longitude: cities.longitude,
        geocodeStatus: cities.geocodeStatus,
      })
      .from(cities)
      .leftJoin(regions, eq(regions.id, cities.regionId))
      .where(eq(cities.id, cityId))
      .limit(1);
    if (!rows.length) throw new NotFoundError('City');

    const city = rows[0];
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

    const db = getDb();

    // Verify city exists
    const cityRows = await db.select().from(cities).where(eq(cities.id, cityId)).limit(1);
    if (!cityRows.length) throw new NotFoundError('City');

    const { region_id } = req.body as { region_id?: number | null };

    // If region_id is provided (non-null), verify the region exists
    if (region_id != null) {
      const regionRows = await db
        .select({ id: regions.id })
        .from(regions)
        .where(eq(regions.id, region_id))
        .limit(1);
      if (!regionRows.length) throw new ValidationError('region_id does not exist');
    }

    const now = new Date().toISOString();
    // Only update region_id if the field was present in the request body
    const setValues =
      'region_id' in req.body
        ? { regionId: region_id ?? null, updatedAt: now }
        : { updatedAt: now };

    const updated = await db.update(cities).set(setValues).where(eq(cities.id, cityId)).returning();

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

    const db = getDb();

    // ER schema §6.2: next_time items for this city across the user's trips (ADL-18)
    const userId = req.user!.id;
    const rows = await db
      .select({
        id: items.id,
        itemType: items.itemType,
        status: items.status,
        notes: items.notes,
        sourceTripName: trips.name,
        sourceTripEndDate: trips.endDate,
        restaurantName: itemRestaurants.name,
        hotelPropertyName: itemHotels.propertyName,
      })
      .from(items)
      .innerJoin(tripPlaces, eq(tripPlaces.id, items.tripPlaceId))
      .innerJoin(trips, eq(trips.id, tripPlaces.tripId))
      .leftJoin(itemRestaurants, eq(itemRestaurants.itemId, items.id))
      .leftJoin(itemHotels, eq(itemHotels.itemId, items.id))
      .where(
        and(
          eq(tripPlaces.cityId, cityId),
          eq(items.status, 'next_time'),
          eq(trips.userId, userId),
          notInArray(items.itemType, ['flight', 'car_rental']),
        ),
      )
      .orderBy(desc(trips.endDate));

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

    const db = getDb();

    // ER schema §6.1: completed items at this city — scoped to the requesting user (SEC-01)
    const conditions = [
      eq(tripPlaces.cityId, cityId),
      eq(items.userId, userId),
      inArray(items.itemType, ['restaurant', 'hotel', 'experience']),
      eq(items.status, 'completed'),
    ];
    if (type) conditions.push(eq(items.itemType, type));

    const effectiveRatingSql = sql<
      number | null
    >`COALESCE(${itemRestaurants.rating}, ${itemHotels.rating}, ${itemExperiences.rating})`;

    const query = db
      .select({
        id: items.id,
        itemType: items.itemType,
        status: items.status,
        notes: items.notes,
        tripName: trips.name,
        tripStartDate: trips.startDate,
        restaurantName: itemRestaurants.name,
        restaurantRating: itemRestaurants.rating,
        restaurantPostVisitNotes: itemRestaurants.postVisitNotes,
        hotelPropertyName: itemHotels.propertyName,
        hotelRating: itemHotels.rating,
        hotelPostVisitNotes: itemHotels.postVisitNotes,
        experienceRating: itemExperiences.rating,
        experiencePostVisitNotes: itemExperiences.postVisitNotes,
        // Computed rating for sort/filter — COALESCE across types
        effectiveRating: effectiveRatingSql,
      })
      .from(items)
      .innerJoin(tripPlaces, eq(tripPlaces.id, items.tripPlaceId))
      .innerJoin(trips, eq(trips.id, tripPlaces.tripId))
      .leftJoin(itemRestaurants, eq(itemRestaurants.itemId, items.id))
      .leftJoin(itemHotels, eq(itemHotels.itemId, items.id))
      .leftJoin(itemExperiences, eq(itemExperiences.itemId, items.id))
      .where(and(...conditions))
      .$dynamic();

    // Default: sort by rating DESC (existing behaviour). sort_by=rating makes it explicit;
    // sort_order=asc flips the direction.
    const useRatingSort = !sort_by || sort_by === 'rating';
    const rows = await query.orderBy(
      useRatingSort
        ? sort_order === 'asc'
          ? asc(effectiveRatingSql)
          : desc(effectiveRatingSql)
        : desc(effectiveRatingSql),
    );

    // Apply min_rating filter in JS (simpler than raw SQL for this case)
    const filtered = min_rating
      ? rows.filter((r) => r.effectiveRating != null && r.effectiveRating >= Number(min_rating))
      : rows;

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
