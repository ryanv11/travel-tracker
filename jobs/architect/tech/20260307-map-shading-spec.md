# Travel Tracker — Map Shading Computation Specification
**Version:** 1.1
**Date:** 2026-03-11
**Author:** Architect / COO amendment
**Status:** Approved — implement in BACKEND

**Amendment (v1.1 — 2026-03-11):** Country shading rule updated per PO direction
(SHADING-SPEC-01). §4 replaced in full. §3 and §5 unchanged.

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

**v1.1 — Rule change.** Country shading now applies conditionally based on whether
the region tier is enabled for a country. The old rule (shade country on any city
visit) is preserved only for countries without a region tier.

### 4.0 Country shading decision rule

A country receives a shading state (anything other than `never_visited`) only when
one or more of the following conditions is true:

| Case | Condition | State computation |
|------|-----------|-------------------|
| **(a)** | `region_tier_enabled = 0` | Use all trip_places in the country |
| **(b)** | `region_tier_enabled = 1` AND at least one city with `region_id IS NULL` has a trip_place | Use only trips touching unassigned cities |
| **(c)** | `region_tier_enabled = 1` AND every region in the country has at least one trip_place (any trip, any status) | Use all trip_places in the country |

Cases (b) and (c) are evaluated in priority order: if (c) is true, use all-city
stats. If only (b) is true, use unregioned-city stats. If neither, return
`never_visited`.

**"Visited" for case (c):** A region counts as visited when any `trip_places` row
exists for a city belonging to that region, regardless of trip status (planning,
active, review_pending, or locked). This is consistent with how all other shading
logic treats trip_places.

---

### 4.1 All countries in bulk (world map load)

This requires two queries merged in application code.

**Query A — country trip stats (replaces old §4.1)**

Adds `region_tier_enabled` and a second set of aggregate columns restricted to
cities with no region assignment (`c.region_id IS NULL`).

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

**Query B — region visit coverage**

Returns how many regions each country has and how many have been visited (case c
check). Run once; join to Query A results in application code.

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

**Application logic (TypeScript)**

```typescript
// Build a lookup: country_code → { totalRegions, visitedRegions }
const coverage = new Map(regionRows.map(r => [r.countryCode, r]));

for (const row of countryRows) {
  let stateKey: string;

  if (!row.regionTierEnabled) {
    // Case (a): no region tier — shade on any visit
    stateKey = computeState(row.completedCount, row.planningCount, row.hasActive === 1);

  } else {
    const cov = coverage.get(row.countryCode);
    const allRegionsVisited =
      cov !== undefined && cov.totalRegions > 0 && cov.visitedRegions === cov.totalRegions;

    if (allRegionsVisited) {
      // Case (c): every region visited — shade whole country from all-city stats
      stateKey = computeState(row.completedCount, row.planningCount, row.hasActive === 1);

    } else if (row.completedUnregioned > 0 || row.planningUnregioned > 0 || row.hasActiveUnregioned === 1) {
      // Case (b): unassigned cities have trips — shade from those trips only
      stateKey = computeState(row.completedUnregioned, row.planningUnregioned, row.hasActiveUnregioned === 1);

    } else {
      stateKey = 'never_visited';
    }
  }
}
```

**Required index:** `idx_cities_country` on `cities(country_code)` — already defined.

### 4.2 Single country (used on click/drill-down)

Apply the same two-query pattern but scope both queries to `co.country_code = :country_code`.
Use the same TypeScript decision logic above for the single-row result.

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

