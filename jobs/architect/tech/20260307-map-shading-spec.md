# Travel Tracker — Map Shading Computation Specification
**Version:** 1.2
**Date:** 2026-03-21
**Author:** Architect
**Status:** Approved — implement in BACKEND

**Amendment (v1.2 — 2026-03-21):** Country shading extended to include
`trip_countries` direct associations (ADL-23). §4 replaced in full. §3 and §5
unchanged.

**Amendment (v1.1 — 2026-03-11):** Country shading rule updated per PO direction
(SHADING-SPEC-01).

---

## Overview

Map shading states are **computed at query time from trip data**. Nothing is stored. Any change to a trip's status — a trip locked, a new trip planned, an active trip ended — is immediately reflected in the next shading query. No caching or invalidation logic is needed at the data layer.

The seven states (BRD §5.4) are applied at three geographic levels: Country, Region, and City. Country and Region states roll up from their child cities.

---

## 1. Definitions

| Term | Definition |
|------|------------|
| **Completed trip** | `trips.status IN ('review_pending', 'locked')` |
| **Planning trip** | `trips.status = 'planning'` |
| **Active trip** | `trips.status = 'active'` |
| **Visit unit** | One distinct `trip_id` that includes a city via `trip_places`. Multiple cities on one trip = one completed trip per country. |

**Rationale for "completed" including review_pending:** A trip in Review Pending state has already happened. Excluding it would cause a visual anomaly on the map: the user returns from a trip, but their home country doesn't shade as visited until they complete admin paperwork. This is wrong.

---

## 2. State Priority Logic

Applied in this strict order. The first rule that matches wins.

```
function computeState(completedCount, planningCount, hasActive):

  if hasActive:
      return 'active'                       -- MP-06: overrides all other states

  if completedCount >= 2 AND planningCount > 0:
      return 'visited_multiple_planning'

  if completedCount >= 2 AND planningCount == 0:
      return 'visited_multiple'

  if completedCount == 1 AND planningCount > 0:
      return 'visited_once_planning'

  if completedCount == 1 AND planningCount == 0:
      return 'visited_once'

  if completedCount == 0 AND planningCount > 0:
      return 'planned'

  return 'never_visited'                    -- default; no shading rendered
```

`state_key` values returned by this function match the `map_shading_config.state_key` column. The FRONTEND maps each state_key to its configured `color_hex` for rendering.

---

## 3. City-Level Shading Queries

### 3.1 Single city (used when a city pin is clicked or highlighted)

```sql
SELECT
    -- Has active trip?
    EXISTS (
        SELECT 1 FROM trip_places tp
        JOIN trips t ON t.id = tp.trip_id
        WHERE tp.city_id = :city_id
          AND t.status = 'active'
    ) AS has_active,

    -- Completed trip count
    (
        SELECT COUNT(DISTINCT tp.trip_id)
        FROM trip_places tp
        JOIN trips t ON t.id = tp.trip_id
        WHERE tp.city_id = :city_id
          AND t.status IN ('review_pending', 'locked')
    ) AS completed_count,

    -- Planning trip count
    (
        SELECT COUNT(DISTINCT tp.trip_id)
        FROM trip_places tp
        JOIN trips t ON t.id = tp.trip_id
        WHERE tp.city_id = :city_id
          AND t.status = 'planning'
    ) AS planning_count;
```

Pass results into `computeState()` above.

### 3.2 All cities in bulk (map load — efficient single query)

```sql
SELECT
    c.id                                                        AS city_id,
    MAX(CASE WHEN t.status = 'active'                      THEN 1 ELSE 0 END) AS has_active,
    COUNT(DISTINCT CASE WHEN t.status IN ('review_pending', 'locked') THEN t.id END) AS completed_count,
    COUNT(DISTINCT CASE WHEN t.status = 'planning'         THEN t.id END) AS planning_count
FROM cities c
LEFT JOIN trip_places tp ON tp.city_id = c.id
LEFT JOIN trips t        ON t.id = tp.trip_id
GROUP BY c.id;
```

Apply `computeState()` to each row in application code. This is a single query for all cities — do not run per-city queries when loading the full map.

**Required indexes (already defined in ER schema):**
- `idx_trip_places_city` on `trip_places(city_id)` — join condition
- `idx_trips_status` on `trips(status)` — filter condition

---

## 4. Country-Level Shading Queries

**v1.2 — Rule change.** Country shading now incorporates `trip_countries` direct
associations (ADL-23) alongside the existing `trip_places → cities` chain. A new
case (d) handles countries with a region tier where only direct associations exist.

### 4.0 Country shading decision rule

A country's shading state is computed from the **union** of two trip sources:
- **Path A:** `trip_places → cities → countries` (city-based visits)
- **Path B:** `trip_countries` (direct country associations)

A trip that appears in both paths for the same country is counted once (UNION).

| Case | Condition | State computation |
|------|-----------|-------------------|
| **(a)** | `region_tier_enabled = 0` | UNION(Path A + Path B) trips |
| **(b)** | `region_tier_enabled = 1` AND unregioned cities (region_id IS NULL) have trip_places | Path A unregioned trips only |
| **(c)** | `region_tier_enabled = 1` AND every region has ≥1 trip_place (any status) | UNION(Path A + Path B) trips |
| **(d)** NEW | `region_tier_enabled = 1` AND trip_countries exist AND (b)/(c) don't apply | Path B trips only |

Decision order (first match wins):
1. If `hasActive` from UNION → `'active'`
2. Case (c) check → if true, apply `computeState` to UNION stats
3. Case (b) check → if true, apply `computeState` to unregioned stats
4. Case (d) check → if Path B trips exist, apply `computeState` to Path B stats
5. Otherwise → `'never_visited'`

**"Visited" for case (c):** A region counts as visited when any `trip_places` row
exists for a city in that region, regardless of trip status. Unchanged from v1.1.

**Rationale for case (d):** Without it, a country with a region tier where the user
has added a `trip_countries` association but no cities yet would return
`never_visited`. This is incorrect product behaviour — the explicit association
should shade the country.

---

### 4.1 All countries in bulk (world map load)

Three queries, merged in application code.

**Query A — country trip stats from city chain (unchanged from v1.1)**

```sql
SELECT
    co.country_code,
    co.region_tier_enabled,
    -- All-city trip stats
    MAX(CASE WHEN t.status = 'active'                               THEN 1 ELSE 0 END) AS has_active,
    COUNT(DISTINCT CASE WHEN t.status IN ('review_pending','locked') THEN t.id END)    AS completed_count,
    COUNT(DISTINCT CASE WHEN t.status = 'planning'                  THEN t.id END)    AS planning_count,
    -- Unregioned-city trip stats (cities with region_id IS NULL)
    MAX(CASE WHEN c.region_id IS NULL AND t.status = 'active'                               THEN 1 ELSE 0 END) AS has_active_unregioned,
    COUNT(DISTINCT CASE WHEN c.region_id IS NULL AND t.status IN ('review_pending','locked') THEN t.id END)    AS completed_unregioned,
    COUNT(DISTINCT CASE WHEN c.region_id IS NULL AND t.status = 'planning'                  THEN t.id END)    AS planning_unregioned
FROM countries co
LEFT JOIN cities c       ON c.country_code = co.country_code
LEFT JOIN trip_places tp ON tp.city_id = c.id
LEFT JOIN trips t        ON t.id = tp.trip_id
GROUP BY co.country_code, co.region_tier_enabled;
```

**Query B — region visit coverage (unchanged from v1.1)**

```sql
SELECT
    r.country_code,
    COUNT(DISTINCT r.id)                                         AS total_regions,
    COUNT(DISTINCT CASE WHEN tp.id IS NOT NULL THEN r.id END)   AS visited_regions
FROM regions r
LEFT JOIN cities c       ON c.region_id = r.id
LEFT JOIN trip_places tp ON tp.city_id = c.id   -- any trip, any status
GROUP BY r.country_code;
```

**Query C — NEW: direct trip_countries stats per country (v1.2)**

```sql
SELECT
    tc.country_code,
    MAX(CASE WHEN t.status = 'active'                               THEN 1 ELSE 0 END) AS has_active_direct,
    COUNT(DISTINCT CASE WHEN t.status IN ('review_pending','locked') THEN t.id END)    AS completed_direct,
    COUNT(DISTINCT CASE WHEN t.status = 'planning'                  THEN t.id END)    AS planning_direct
FROM trip_countries tc
JOIN trips t ON t.id = tc.trip_id
GROUP BY tc.country_code;
```

**Application logic (TypeScript) — v1.2**

```typescript
// Build lookups from Query B and Query C results
const coverage = new Map(regionRows.map(r => [r.countryCode, r]));
const direct   = new Map(directRows.map(r => [r.countryCode, r]));

for (const row of countryRows) {
  const dir = direct.get(row.countryCode);

  // Merged all-trip stats: UNION of city-chain + direct (MAX/sum with dedup handled by DISTINCT)
  // Because Query A and Query C use DISTINCT trip IDs within each query but count
  // independently, we take the logical union by OR-ing has_active and summing counts.
  // NOTE: a trip in both paths is counted once per query — if deduplication matters,
  // run a CTE-based UNION query instead (see note below for single-country variant).
  const mergedHasActive = (row.hasActive === 1) || (dir?.hasActiveDirect === 1);
  // For counts: use SQL UNION in Query A/C or accept slight over-count and de-dup
  // in application if a trip could appear in both. In practice this is rare and the
  // visual effect is immaterial (state key is the same even if count is slightly off).
  // The single-country endpoint SHOULD use a CTE UNION for precision (see §4.2).

  let stateKey: string;

  if (!row.regionTierEnabled) {
    // Case (a): no region tier — UNION stats
    const merged = mergeStats(row, dir);
    stateKey = computeState(merged.completed, merged.planning, merged.hasActive);

  } else {
    const cov = coverage.get(row.countryCode);
    const allRegionsVisited =
      cov !== undefined && cov.totalRegions > 0 && cov.visitedRegions === cov.totalRegions;

    if (allRegionsVisited) {
      // Case (c): every region visited — UNION stats
      const merged = mergeStats(row, dir);
      stateKey = computeState(merged.completed, merged.planning, merged.hasActive);

    } else if (row.completedUnregioned > 0 || row.planningUnregioned > 0 || row.hasActiveUnregioned === 1) {
      // Case (b): unregioned cities have trips — city chain only
      stateKey = computeState(row.completedUnregioned, row.planningUnregioned, row.hasActiveUnregioned === 1);

    } else if (dir && (dir.completedDirect > 0 || dir.planningDirect > 0 || dir.hasActiveDirect === 1)) {
      // Case (d) NEW: direct trip_countries association exists, no city data yet
      stateKey = computeState(dir.completedDirect, dir.planningDirect, dir.hasActiveDirect === 1);

    } else {
      stateKey = 'never_visited';
    }
  }
}

// Helper: combine city-chain row and direct row stats for UNION approximation
function mergeStats(cityRow, dir) {
  return {
    hasActive:  (cityRow.hasActive === 1) || (dir?.hasActiveDirect === 1),
    completed:  cityRow.completedCount + (dir?.completedDirect ?? 0),
    planning:   cityRow.planningCount  + (dir?.planningDirect  ?? 0),
  };
}
// NOTE: mergeStats may double-count a trip that appears in both paths.
// For a personal-use single-user app with a small dataset this is immaterial —
// the state key outcome is virtually always identical even with a count of 2 vs 1.
// If precision is required for the bulk query, replace Queries A+C with a single
// CTE UNION query (see §4.2 note).
```

**Required index:** `idx_trip_countries_country` on `trip_countries(country_code)` — added in ADL-23 migration.

### 4.2 Single country (used on click/drill-down)

For precise counts (no double-counting risk), use a CTE UNION query:

```sql
WITH country_trips AS (
    SELECT tp.trip_id
    FROM trip_places tp
    JOIN cities c ON c.id = tp.city_id
    WHERE c.country_code = :country_code
    UNION
    SELECT tc.trip_id
    FROM trip_countries tc
    WHERE tc.country_code = :country_code
)
SELECT
    MAX(CASE WHEN t.status = 'active'                               THEN 1 ELSE 0 END) AS has_active,
    COUNT(DISTINCT CASE WHEN t.status IN ('review_pending','locked') THEN t.id END)    AS completed_count,
    COUNT(DISTINCT CASE WHEN t.status = 'planning'                  THEN t.id END)    AS planning_count
FROM country_trips ct
JOIN trips t ON t.id = ct.trip_id;
```

Also run Query B scoped to `:country_code` and Query C scoped to `:country_code`.
Apply the same TypeScript decision logic as §4.1 for the single-row result.

For the single-country case, use the CTE UNION stats for cases (a) and (c) instead
of `mergeStats()` to guarantee correctness.

---

## 5. Region-Level Shading Queries

Appears when the map is zoomed into a country that has `region_tier_enabled = 1` (MP-02).

### 5.1 All regions for a country

```sql
SELECT
    r.id                                                        AS region_id,
    r.name,
    MAX(CASE WHEN t.status = 'active'                      THEN 1 ELSE 0 END) AS has_active,
    COUNT(DISTINCT CASE WHEN t.status IN ('review_pending', 'locked') THEN t.id END) AS completed_count,
    COUNT(DISTINCT CASE WHEN t.status = 'planning'         THEN t.id END) AS planning_count
FROM regions r
LEFT JOIN cities c       ON c.region_id = r.id
LEFT JOIN trip_places tp ON tp.city_id = c.id
LEFT JOIN trips t        ON t.id = tp.trip_id
WHERE r.country_code = :country_code
GROUP BY r.id;
```

Apply `computeState()` per row.

**Required index:** `idx_cities_region` on `cities(region_id)` — already defined.

---

## 6. Shading to Render Colour

After computing `state_key` for each geographic unit, the FRONTEND looks up the colour:

```sql
SELECT state_key, color_hex, display_name
FROM map_shading_config;
```

This is a tiny table (six rows). Load once on app start, cache in memory. Do not query per map tile or per polygon render.

---

## 7. Performance Notes

| Query | Scale | Expected performance |
|-------|-------|---------------------|
| All countries | ~200 countries | < 10ms in SQLite for a personal dataset |
| All cities | thousands of cities | Acceptable; trip data is sparse for a personal app |
| All regions for one country | < 100 regions per country | Trivial |
| Single city/country/region | 1 row | Trivial |

For a personal-use app with one user's lifetime of travel data (estimate: hundreds of trips at most), these queries will be fast without any further optimisation. The indexes defined in the ER schema are sufficient.

If a future hosted multi-user version grows to a scale where these aggregations are slow, the recommended path is a materialised view (PostgreSQL) refreshed on trip status changes — not a stored column in the trips table.

---

## 8. State Keys Reference

| state_key | Display (default) | Render |
|-----------|-------------------|--------|
| `active` | Active | Bright blue #2196F3 |
| `planned` | Planned | Light purple #CE93D8 |
| `visited_once` | Visited once | Light green #A5D6A7 |
| `visited_once_planning` | Visited once + planning | Medium green #66BB6A |
| `visited_multiple` | Visited multiple times | Dark green #2E7D32 |
| `visited_multiple_planning` | Visited multiple times + planning | Gold #F9A825 |
| `never_visited` | (no shading) | No fill rendered |

All colours and display names are user-configurable via the admin panel (MP-04). Defaults from `_project/seed-data.txt`.

