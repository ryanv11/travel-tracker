/**
 * Travel Tracker — City Identity Service (ADL-53 §4 / D3, QUAL-43 Stage 2)
 *
 * The city identity / find-or-create algebra, extracted verbatim from the
 * cities route handlers. This is the project's single most-churned surface
 * (BUG-72/74/75/76/79/80/81/85); inline in the handlers it was reachable only
 * through HTTP, which is exactly what the churn has been begging to fix.
 *
 * SCOPE (ADL-53 OQ-3, COO-adjudicated): DB / IDENTITY ONLY. This module owns
 * find-or-create, the wildcard upgrade, and the carried-OSM-ref merge. It does
 * NOT own geocode ORCHESTRATION — the resolve-then-create sequencing
 * (`resolveCityName`, and the fire-and-forget re-resolve after a pending
 * insert) stays in the route, and geocoding itself stays in
 * `geocoding.service.ts`. The two geocoder calls below are inside the identity
 * algorithms themselves and moved with them.
 *
 * All DB access goes through `citiesRepository`; this module holds no `getDb()`.
 */

import type { CityRow } from '../repositories/cities.js';
import { citiesRepository } from '../repositories/cities.js';
import { isUniqueViolation } from './db-errors.js';
import { resolveByOsmId, resolveCity } from './geocoding.service.js';

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
export async function findOrUpgradeCity(
  name: string,
  countryCode: string,
  regionId: number | null,
  callerUserId: string,
): Promise<CityRow | null> {
  const regionKey = regionId ?? 0;

  // Step 1 — exact match on the composite identity key. Creator- and
  // status-blind on purpose (see doc comment above).
  const exact = await citiesRepository.findByIdentityKey(name, countryCode, regionKey);
  if (exact) return exact;

  // Step 2 — wildcard upgrade (only when the request carries a region).
  // ADL-46 F1/F2 ruling §3.3 (R1): whitelist status + creator-or-null scoping.
  if (regionId != null) {
    const regionless = await citiesRepository.findRegionlessUpgradeCandidate(
      name,
      countryCode,
      callerUserId,
    );
    if (regionless) {
      const now = new Date().toISOString();
      const upgraded = await citiesRepository.updateCity(regionless.id, {
        regionId,
        geocodeAttempts: 0,
        updatedAt: now,
      });
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
  const sameName = await citiesRepository.findByNameAndCountry(name, countryCode);
  if (sameName.length === 1) return sameName[0];

  return null;
}

/**
 * BUG-75 v3 §B3/M1/F3 — the caught-unique-violation → re-select-and-reuse
 * pattern shared by every create-path INSERT (both the legacy resolved/
 * pending inserts in the route and the carried-ref inserts in
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
export async function insertCityOrReuse(
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
export async function createOrReuseCarriedCity(input: {
  osmType: 'node' | 'way' | 'relation';
  osmId: number;
  displayName: string | null;
  name: string;
  countryCode: string;
  regionId: number | null;
  userId: string;
}): Promise<{ city: CityRow; created: boolean }> {
  const { osmType, osmId, displayName, name, countryCode, regionId, userId } = input;

  const existingByRef = await citiesRepository.findByOsmRef(osmType, osmId);
  if (existingByRef) return { city: existingByRef, created: false };

  const canonical = await resolveByOsmId(osmType, osmId);
  const now = new Date().toISOString();

  if (canonical) {
    const { row, created } = await insertCityOrReuse(
      () =>
        citiesRepository.insert({
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
        }),
      () => citiesRepository.findByOsmRef(osmType, osmId),
    );
    return { city: row, created };
  }

  // M-B: offline/error OR a stale/reclassified carried id — both degrade to
  // a pending row retaining the carried ref so a later resolve (the
  // standing queue) can canonicalize or terminally resolve it.
  const { row, created } = await insertCityOrReuse(
    () =>
      citiesRepository.insert({
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
      }),
    () => citiesRepository.findByOsmRef(osmType, osmId),
  );
  return { city: row, created };
}
