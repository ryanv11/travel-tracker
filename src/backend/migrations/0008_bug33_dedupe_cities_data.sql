-- BUG-33 (#157) — cities deduplication: data cleanup pass
-- BRD GE-11. Must run BEFORE 0009 (which adds the case-insensitive
-- UNIQUE(name, country_code) index) — that index creation fails while
-- duplicate rows still exist.
--
-- Reviewed with Architect (2026-07-20) before implementation, per the
-- "no schema changes without Architect review" rule:
--   - Canonical row per duplicate group = lowest id.
--   - Geocode fields (latitude/longitude/geocode_status/geocode_attempted_at)
--     are coalesced onto the canonical row from the best-resolved duplicate
--     in its group, only when the canonical row is not itself already
--     resolved. region_id is filled in the same way only as a NULL-fill,
--     never overwriting a non-null value, so genuine divergence is never
--     silently discarded.
--   - trip_places.city_id is re-pointed from every duplicate city to its
--     canonical city. If that produces two trip_places rows for the same
--     trip_id + canonical city_id (colliding with uniq_trip_places_trip_city
--     — "a trip visits each city at most once"), the EARLIER trip_place row
--     (lowest id) wins. Before the later (losing) row is deleted:
--       * items.trip_place_id referencing it is re-pointed to the survivor
--         (never delete booked items/notes as a side effect of a city merge)
--       * trip_place_activities_map rows are moved to the survivor,
--         skipping any (trip_place_id, activity_id) pair it already has
--   - This is a one-time repair operating within the *current*
--     uniq_trip_places_trip_city constraint. It does not resolve BRD OQ-05
--     (whether that constraint should allow same-city revisits within a
--     trip going forward) — OQ-05 remains open, Architect to resolve
--     separately before any brief touching trip-place identity.
--
-- Verified against a real duplicate data set (2 x Glasgow/GB, 3 x
-- Seattle/US) including a live collision case (one trip had two
-- trip_places rows that both resolved to the same canonical Glasgow after
-- merge) — output matched this design exactly: earlier trip_place row
-- survived, later row's (already-repointed) item reference was preserved,
-- no activity-tag rows were lost, and 0 duplicate groups remained after.

-- STEP 1: map every city row to its duplicate-group canonical id (lowest
-- id sharing the same case-insensitive name + country_code)
DROP TABLE IF EXISTS _bug33_city_canonical;
--> statement-breakpoint
CREATE TEMP TABLE _bug33_city_canonical AS
SELECT
  id,
  MIN(id) OVER (PARTITION BY lower(name), country_code) AS canonical_id,
  COUNT(*) OVER (PARTITION BY lower(name), country_code) AS grp_size
FROM cities;
--> statement-breakpoint

-- STEP 2: for each duplicate group, find the best-resolved row (resolved +
-- non-null coordinates beats pending, lowest id breaks ties)
DROP TABLE IF EXISTS _bug33_best_geocode;
--> statement-breakpoint
CREATE TEMP TABLE _bug33_best_geocode AS
SELECT
  g.canonical_id AS canonical_id,
  c.latitude AS latitude,
  c.longitude AS longitude,
  c.geocode_status AS geocode_status,
  c.geocode_attempted_at AS geocode_attempted_at,
  c.region_id AS region_id,
  ROW_NUMBER() OVER (
    PARTITION BY g.canonical_id
    ORDER BY (c.geocode_status = 'resolved' AND c.latitude IS NOT NULL) DESC, c.id ASC
  ) AS rn
FROM cities c
JOIN _bug33_city_canonical g ON g.id = c.id
WHERE g.grp_size > 1;
--> statement-breakpoint

-- STEP 3: coalesce geocode fields onto the canonical row (only if it isn't
-- already resolved); region_id is a NULL-fill only, never an overwrite
UPDATE cities
SET
  latitude = (SELECT latitude FROM _bug33_best_geocode b WHERE b.canonical_id = cities.id AND b.rn = 1),
  longitude = (SELECT longitude FROM _bug33_best_geocode b WHERE b.canonical_id = cities.id AND b.rn = 1),
  geocode_status = (SELECT geocode_status FROM _bug33_best_geocode b WHERE b.canonical_id = cities.id AND b.rn = 1),
  geocode_attempted_at = (SELECT geocode_attempted_at FROM _bug33_best_geocode b WHERE b.canonical_id = cities.id AND b.rn = 1),
  region_id = COALESCE(region_id, (SELECT region_id FROM _bug33_best_geocode b WHERE b.canonical_id = cities.id AND b.rn = 1)),
  updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE geocode_status != 'resolved'
  AND id IN (SELECT canonical_id FROM _bug33_best_geocode WHERE rn = 1);
--> statement-breakpoint

-- STEP 4: for every (trip_id, post-merge canonical city_id) pair, decide
-- which trip_place row survives (lowest id) — covers every trip_place row,
-- not just ones on duplicate cities, since a trip may already have a row
-- on the canonical city that a duplicate's row will now collide with
DROP TABLE IF EXISTS _bug33_tp_remap;
--> statement-breakpoint
CREATE TEMP TABLE _bug33_tp_remap AS
SELECT
  tp.id AS tp_id,
  tp.trip_id AS trip_id,
  g.canonical_id AS new_city_id,
  MIN(tp.id) OVER (PARTITION BY tp.trip_id, g.canonical_id) AS surviving_tp_id
FROM trip_places tp
JOIN _bug33_city_canonical g ON g.id = tp.city_id;
--> statement-breakpoint

-- STEP 5: move items off losing trip_place rows onto the survivor —
-- never delete booked items/notes as a side effect of this cleanup
UPDATE items
SET trip_place_id = (
      SELECT surviving_tp_id FROM _bug33_tp_remap r WHERE r.tp_id = items.trip_place_id
    ),
    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE trip_place_id IN (
  SELECT tp_id FROM _bug33_tp_remap WHERE tp_id <> surviving_tp_id
);
--> statement-breakpoint

-- STEP 6: move activity-tag associations off losing trip_place rows onto
-- the survivor, skipping any pair the survivor already has
INSERT OR IGNORE INTO trip_place_activities_map (trip_place_id, activity_id)
SELECT r.surviving_tp_id, m.activity_id
FROM trip_place_activities_map m
JOIN _bug33_tp_remap r ON r.tp_id = m.trip_place_id
WHERE r.tp_id <> r.surviving_tp_id;
--> statement-breakpoint

DELETE FROM trip_place_activities_map
WHERE trip_place_id IN (
  SELECT tp_id FROM _bug33_tp_remap WHERE tp_id <> surviving_tp_id
);
--> statement-breakpoint

-- STEP 7: delete the losing trip_place rows (now childless — items and
-- activity tags have been moved off in steps 5-6)
DELETE FROM trip_places
WHERE id IN (
  SELECT tp_id FROM _bug33_tp_remap WHERE tp_id <> surviving_tp_id
);
--> statement-breakpoint

-- STEP 8: re-point the surviving trip_places rows' city_id to canonical
UPDATE trip_places
SET city_id = (SELECT canonical_id FROM _bug33_city_canonical g WHERE g.id = trip_places.city_id)
WHERE city_id IN (SELECT id FROM _bug33_city_canonical WHERE id <> canonical_id);
--> statement-breakpoint

-- STEP 9: delete the now-unreferenced duplicate city rows
DELETE FROM cities
WHERE id IN (SELECT id FROM _bug33_city_canonical WHERE id <> canonical_id);
--> statement-breakpoint

DROP TABLE IF EXISTS _bug33_city_canonical;
--> statement-breakpoint
DROP TABLE IF EXISTS _bug33_best_geocode;
--> statement-breakpoint
DROP TABLE IF EXISTS _bug33_tp_remap;
