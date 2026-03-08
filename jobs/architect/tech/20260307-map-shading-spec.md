# Travel Tracker — Map Shading Computation Specification
**Version:** 1.0
**Date:** 2026-03-07
**Author:** Architect
**Status:** Approved — implement in BACKEND

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

### 4.1 All countries in bulk (world map load)

A country's state is determined by the trips that visited **any** city within it. `COUNT(DISTINCT t.id)` ensures one trip visiting two cities in the same country counts as one completed trip, not two.

```sql
SELECT
    c.country_code,
    MAX(CASE WHEN t.status = 'active'                      THEN 1 ELSE 0 END) AS has_active,
    COUNT(DISTINCT CASE WHEN t.status IN ('review_pending', 'locked') THEN t.id END) AS completed_count,
    COUNT(DISTINCT CASE WHEN t.status = 'planning'         THEN t.id END) AS planning_count
FROM countries co
LEFT JOIN cities c       ON c.country_code = co.country_code
LEFT JOIN trip_places tp ON tp.city_id = c.id
LEFT JOIN trips t        ON t.id = tp.trip_id
GROUP BY co.country_code;
```

Apply `computeState()` per row.

**Required index:** `idx_cities_country` on `cities(country_code)` — already defined.

### 4.2 Single country (used on click/drill-down)

Replace `GROUP BY co.country_code` with `WHERE co.country_code = :country_code`.

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

