/**
 * Travel Tracker — Drizzle ORM Schema
 *
 * This file is the single source of truth for the database schema.
 * All tables, columns, constraints, and indexes are defined here.
 * Never modify the database directly — all changes go through this
 * file and drizzle-kit migrations (Shared Standard 4).
 *
 * Phase 1: SQLite (local). Phase 2: PostgreSQL (hosted).
 * The schema is written for SQLite. When Phase 2 arrives, generate
 * a parallel pgTable schema using these same table definitions —
 * column names and relationships are identical; only the table builder
 * and column type imports change.
 *
 * ADDING A TABLE? It must also be classified in `ownership.ts` — whose data is
 * this, and how is that expressed (its own `user_id` column, a named parent,
 * global reference data, or identity). That is build-enforced: CHECK 3 of
 * `scripts/scope-completeness-check.sh` fails on any table defined here and
 * classified nowhere (QUAL-47). If a table is user data, its ownership column
 * must be named `user_id` — the scope guard's CHECK 1 finds hand-authored
 * ownership by that name, so an ownership column called anything else would be
 * invisible to it.
 *
 * @see jobs/architect/tech/20260307-ER-schema.md (v1.1 — original design, historical).
 *      Schema evolution since v1.1 (users, trip_countries, is_owner, place dates,
 *      user_id FKs) is recorded in the architecture-decisions-log (ADL-16/19/20/23/24/27).
 *      This file — not the ER doc — is the authoritative current schema.
 */

import { sql } from 'drizzle-orm';
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

// ============================================================
// 1. GEOGRAPHIC HIERARCHY
// ============================================================

/**
 * Countries — top level of the geographic hierarchy.
 * Seeded at first launch from bundled data (GE-04, GE-05, GE-06).
 * Doubles as the per-country config store (GE-07, AD-05):
 *   region_tier_enabled controls whether the region tier is shown for this country.
 *   region_tier_label sets the localised name (e.g. 'State', 'Province').
 *
 * Boundary GeoJSON for map shading is served as static files, not stored here.
 */
export const countries = sqliteTable(
  'countries',
  {
    countryCode: text('country_code').primaryKey(), // ISO 3166-1 alpha-2 e.g. 'US', 'AU'
    name: text('name').notNull(),
    // 0 = no region tier for this country; 1 = show region tier
    regionTierEnabled: integer('region_tier_enabled').notNull().default(0),
    // Human-readable label for the region tier: 'State' | 'Province' | 'Territory' | NULL
    regionTierLabel: text('region_tier_label'),
    createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
    updatedAt: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
  },
  (t) => [
    // region_tier_label must be NULL when region_tier_enabled = 0 — enforced by BACKEND
    check('chk_countries_region_tier_enabled', sql`${t.regionTierEnabled} IN (0, 1)`),
  ],
);

/**
 * Regions — state/province tier. Only populated for countries where
 * region_tier_enabled = 1 (GE-01, GE-02, GE-03).
 */
export const regions = sqliteTable(
  'regions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    countryCode: text('country_code')
      .notNull()
      .references(() => countries.countryCode),
    name: text('name').notNull(), // e.g. 'California', 'New South Wales'
    iso3166_2: text('iso_3166_2').notNull(),
    createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
    updatedAt: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
  },
  (t) => [
    index('idx_regions_country').on(t.countryCode),
    uniqueIndex('uniq_regions_iso_3166_2').on(t.iso3166_2),
  ],
);

/**
 * Cities — leaf level of the geographic hierarchy.
 * Coordinates are resolved via Nominatim geocoding (GE-11, GE-12, GE-13).
 * A city can exist without coordinates (geocode_status = 'pending') and is
 * fully usable for trip logging — map pins are suppressed until resolved.
 */
export const cities = sqliteTable(
  'cities',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    countryCode: text('country_code')
      .notNull()
      .references(() => countries.countryCode),
    // NULL for cities in countries where region_tier_enabled = 0
    regionId: integer('region_id').references(() => regions.id),
    name: text('name').notNull(),
    latitude: real('latitude'), // NULL while geocode_status = 'pending'
    longitude: real('longitude'), // NULL while geocode_status = 'pending'
    // 'pending' = awaiting Nominatim resolution; 'resolved' = coordinates confirmed;
    // 'unresolvable' = geocoder answered "no match" — terminal, never retried (ADL-46 D10)
    geocodeStatus: text('geocode_status').notNull().default('pending'),
    geocodeAttemptedAt: text('geocode_attempted_at'), // ISO 8601 timestamp of last attempt
    // ADL-46 D10 (§4.4.1): incremented ONLY on recoverable failures (network/timeout/5xx/429).
    // The retry queue gives up at a cap (WHERE geocode_status = 'pending' AND geocode_attempts < CAP).
    // isOnline()-false and GEOCODING_ENABLED=false are global conditions and must NOT increment it.
    geocodeAttempts: integer('geocode_attempts').notNull().default(0),
    // ADL-46 D5/GE-16 (§4.4): creator of an on-demand city. DELIBERATELY NULLABLE — cities are
    // global reference data, not user data, and seeded/pre-column rows have no creator; NULL means
    // "no known creator (seeded, pre-column, or creator since deleted)" and is treated as global.
    // ON DELETE SET NULL (not cascade): deleting a user must never delete shared city rows their
    // trips and other users' trips depend on. Both properties are exceptions to the security
    // checklist default and are intentional (ADL-46 §9.2, security checklist).
    createdByUserId: text('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
    updatedAt: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
    // BUG-75 / GE-16 (v3.19) identity carry channel. Nullable by design: the geocoder's OSM
    // (osm_type, osm_id) reference is the identity key; display_name is render payload only, never
    // a match key (design v3 §0/§2.3). Since the SWITCH stage (migration 0017) landed, osm_id is
    // load-bearing via the partial unique indexes below, and the find-or-create paths in cities.ts
    // populate all three (older rows may remain NULL). osm_id is INTEGER (OSM node/way/relation ids
    // are integers; osm_type distinguishes N/W/R namespaces, so the pair — not osm_id alone — is the
    // identity key).
    osmType: text('osm_type'),
    osmId: integer('osm_id'),
    displayName: text('display_name'),
  },
  (t) => [
    index('idx_cities_country').on(t.countryCode),
    index('idx_cities_region').on(t.regionId),
    // Partial index — only indexes pending cities, making the geocoding queue scan efficient.
    // Bonus (ADL-46 D10): 'unresolvable' rows drop out of this index automatically, keeping the
    // queue scan tight without a separate terminal flag.
    index('idx_cities_geocode').on(t.geocodeStatus).where(sql`${t.geocodeStatus} = 'pending'`),
    check(
      'chk_cities_geocode_status',
      sql`${t.geocodeStatus} IN ('pending', 'resolved', 'unresolvable')`,
    ),
    // BUG-75 / GE-16 (v3.19, design v3 §B2 SWITCH stage, migration 0017): the unconditional
    // uniq_cities_name_country_region_ci index (ADL-46 D13) is REPLACED by two partial unique
    // indexes below — it forbade any two rows sharing (name, country, region) at all, which is
    // exactly what prevented distinct real places (e.g. two same-region Newports) from coexisting.
    //
    // 1) Resolved-by-OSM identity — one row per real OSM place. Covers pending AND resolved rows
    // that carry an osm_id (any osm_id-writing site), which is what gives a concurrent same-place
    // create/resolve its free merge-on-collision (M1/F3 caught-unique-violation discipline).
    // Partial WHERE osm_id IS NOT NULL means existing/legacy NULL-osm_id rows never collide here
    // (no BUG-33 reopen; no backfill needed — this key is additive, not a replacement of a
    // guarantee those rows relied on).
    uniqueIndex('uniq_cities_osm_ref').on(t.osmType, t.osmId).where(sql`${t.osmId} IS NOT NULL`),
    // 2) Pending-per-creator identity — lets two different users each hold their own pending
    // row for the same (name, country, region) without colliding (v2 §7 creator-scoped pending),
    // now that the global index is gone. COALESCE(region_id, 0) collapses NULL region to a
    // sentinel (regions.id AUTOINCREMENTs from 1, never issues 0 — carried forward from D13).
    // COALESCE(created_by_user_id, '') collapses NULL creator to one sentinel that cannot collide
    // with a real Clerk id. Partial WHERE geocode_status = 'pending' means resolved rows are
    // governed only by the resolved-by-OSM index above, not this one.
    uniqueIndex('uniq_cities_pending_per_creator')
      .on(
        sql`${t.name} COLLATE NOCASE`,
        t.countryCode,
        sql`COALESCE(${t.regionId}, 0)`,
        sql`COALESCE(${t.createdByUserId}, '')`,
      )
      .where(sql`${t.geocodeStatus} = 'pending'`),
    // m-3 (v3 delta review): both-or-neither guard on the identity pair. The resolved-by-OSM
    // index above is keyed (osm_type, osm_id) — if a row ever had osm_id non-null with osm_type
    // NULL, SQLite's NULL-distinct semantics would silently weaken uniqueness in the first key
    // position. The Zod refine at the API boundary (design v3 §2.3) enforces this too; this CHECK
    // closes it at the DB layer the index itself depends on.
    check('chk_cities_osm_both_or_neither', sql`(${t.osmType} IS NULL) = (${t.osmId} IS NULL)`),
  ],
);

// ============================================================
// 2. ADMIN AND CONFIG TABLES
// ============================================================
// All admin list tables follow a consistent soft-delete pattern:
// is_active = 0 hides the record from entry form queries (AD-06)
// while preserving it on existing associations.

/**
 * Trip categories — per-user managed list (e.g. 'Ski Trip', 'City Break').
 * ADL-46 (AD-09, D3): categories moved from a single global list to per-user
 * lists, reusing ADL-28's companions pattern. Uniqueness is scoped to
 * (user_id, name) — two different users may each have a 'Ski Trip' category
 * without conflict. Cascade delete: removing a user removes their categories.
 * Lazily seeded from the global defaults on user creation (Backend brief).
 */
export const tripCategories = sqliteTable(
  'trip_categories',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    isActive: integer('is_active').notNull().default(1),
    createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
    updatedAt: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
  },
  (t) => [
    uniqueIndex('uniq_trip_categories_user_name').on(t.userId, t.name),
    index('idx_trip_categories_user').on(t.userId),
    check('chk_trip_categories_is_active', sql`${t.isActive} IN (0, 1)`),
  ],
);

/**
 * Activities — per-user managed list (e.g. 'Skiing', 'Sightseeing').
 * Applied at both trip level and place level (TR-04).
 * ADL-46 (AD-09, D3): activities moved from a single global list to per-user
 * lists, reusing ADL-28's companions pattern. Uniqueness is scoped to
 * (user_id, name). Cascade delete: removing a user removes their activities.
 * Lazily seeded from the global defaults on user creation (Backend brief).
 */
export const activities = sqliteTable(
  'activities',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    isActive: integer('is_active').notNull().default(1),
    createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
    updatedAt: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
  },
  (t) => [
    uniqueIndex('uniq_activities_user_name').on(t.userId, t.name),
    index('idx_activities_user').on(t.userId),
    check('chk_activities_is_active', sql`${t.isActive} IN (0, 1)`),
  ],
);

/**
 * Companions — per-user managed list (e.g. 'Partner', 'Family').
 * ADL-28 (AD-08): companions moved from a single global list to per-user lists.
 * Uniqueness is scoped to (user_id, name) — two different users may each have
 * a companion named 'Partner' without conflict. Cascade delete: removing a
 * user removes their companions (config is meaningless without the user).
 */
export const companions = sqliteTable(
  'companions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    isActive: integer('is_active').notNull().default(1),
    createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
    updatedAt: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
  },
  (t) => [
    uniqueIndex('uniq_companions_user_name').on(t.userId, t.name),
    index('idx_companions_user').on(t.userId),
    check('chk_companions_is_active', sql`${t.isActive} IN (0, 1)`),
  ],
);

/**
 * Map shading configuration — per-user copy of the six shading states and
 * their colours. ADL-28 (AD-07): shading config moved from a single global
 * table to per-user rows so each user's colours and state settings reflect
 * only their own travel history. PK is composite (state_key, user_id) — each
 * user has at most one row per state key. Lazily seeded with defaults on a
 * user's first access to the shading config endpoint (see shadingConfig
 * repository, Backend brief) rather than on user creation.
 * state_key values are fixed application constants, never user-editable.
 * Users configure display_name and color_hex via the admin panel (MP-04).
 * 'never_visited' is NOT a row here — it has no shading by definition (MP-05).
 * Cascade delete: removing a user removes their shading config.
 */
export const mapShadingConfig = sqliteTable(
  'map_shading_config',
  {
    // Fixed constant — one of six known state keys
    stateKey: text('state_key').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    displayName: text('display_name').notNull(),
    colorHex: text('color_hex').notNull(), // e.g. '#2196F3' — validated by FRONTEND
    updatedAt: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
  },
  (t) => [
    primaryKey({ columns: [t.stateKey, t.userId] }),
    index('idx_map_shading_user').on(t.userId),
    check(
      'chk_map_shading_state_key',
      sql`${t.stateKey} IN ('active', 'planned', 'visited_once', 'visited_once_planning', 'visited_multiple', 'visited_multiple_planning')`,
    ),
  ],
);

// ============================================================
// 3. TRIPS
// ============================================================

/**
 * Trips — the top-level entity. One trip = one journey (TR-01).
 * Status drives map shading (MP-06) and locked-trip enforcement (TR-06, TR-07).
 * BACKEND enforces that 'locked' status makes the trip read-only.
 * BACKEND must also validate start_date <= end_date (SQLite CHECK cannot enforce
 * cross-column date comparisons reliably).
 */
export const trips = sqliteTable(
  'trips',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    startDate: text('start_date').notNull(), // ISO 8601 date: 'YYYY-MM-DD'
    endDate: text('end_date').notNull(), // ISO 8601 date: 'YYYY-MM-DD'
    // Status progression: planning → active → review_pending → locked
    status: text('status').notNull().default('planning'),
    photoAlbumRef: text('photo_album_ref'), // URL or folder path — no file stored (PH-01)
    userId: text('user_id')
      .notNull()
      .references(() => users.id), // HC-07c: NOT NULL enforced at DB level
    createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
    updatedAt: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
  },
  (t) => [
    index('idx_trips_status').on(t.status),
    index('idx_trips_start_date').on(t.startDate),
    index('idx_trips_end_date').on(t.endDate),
    index('trips_user_id_idx').on(t.userId),
    check(
      'chk_trips_status',
      sql`${t.status} IN ('planning', 'active', 'review_pending', 'locked')`,
    ),
  ],
);

/**
 * Trip ↔ Category junction. A trip can have multiple categories.
 * Cascade delete: removing a trip removes its category associations.
 */
export const tripCategoriesMap = sqliteTable(
  'trip_categories_map',
  {
    tripId: integer('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    categoryId: integer('category_id')
      .notNull()
      .references(() => tripCategories.id),
  },
  (t) => [
    primaryKey({ columns: [t.tripId, t.categoryId] }),
    index('idx_tcm_category').on(t.categoryId),
  ],
);

/**
 * Trip ↔ Companion junction. A trip can have multiple companions.
 * Cascade delete: removing a trip removes its companion associations.
 */
export const tripCompanionsMap = sqliteTable(
  'trip_companions_map',
  {
    tripId: integer('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    companionId: integer('companion_id')
      .notNull()
      .references(() => companions.id),
  },
  (t) => [
    primaryKey({ columns: [t.tripId, t.companionId] }),
    index('idx_tcpm_companion').on(t.companionId),
  ],
);

/**
 * Trip ↔ Activity junction (trip-level activities).
 * Distinct from place-level activities (trip_place_activities_map).
 * Cascade delete: removing a trip removes its activity associations.
 */
export const tripActivitiesMap = sqliteTable(
  'trip_activities_map',
  {
    tripId: integer('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    activityId: integer('activity_id')
      .notNull()
      .references(() => activities.id),
  },
  (t) => [primaryKey({ columns: [t.tripId, t.activityId] })],
);

// ============================================================
// 4. PLACES (TRIP-PLACE ASSOCIATIONS)
// ============================================================

/**
 * Trip places — one record per city visited within a trip.
 * This is the "Place" entity from the BRD. Items reference trip_place_id,
 * not city_id directly, to maintain stable IDs across the trip context.
 *
 * UNIQUE (trip_id, city_id): a trip visits each city at most once.
 * Multiple hotel stays in the same city are multiple items under one trip_place.
 *
 * The index on city_id is critical for cross-trip queries (IT-07 carry-forward,
 * IT-09 city-level rating view).
 */
export const tripPlaces = sqliteTable(
  'trip_places',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    tripId: integer('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    cityId: integer('city_id')
      .notNull()
      .references(() => cities.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id), // HC-07c: NOT NULL enforced at DB level
    arrivedOn: text('arrived_on'), // nullable, no default (ADL-24)
    departedOn: text('departed_on'), // nullable, no default (ADL-24)
    createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
    updatedAt: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
  },
  (t) => [
    // A trip visits each city at most once
    uniqueIndex('uniq_trip_places_trip_city').on(t.tripId, t.cityId),
    index('idx_trip_places_trip').on(t.tripId),
    // Critical for cross-trip queries joining on city_id (IT-07, IT-09)
    index('idx_trip_places_city').on(t.cityId),
    index('trip_places_user_id_idx').on(t.userId),
  ],
);

/**
 * Trip place ↔ Activity junction (place-level activities).
 * Separate from trip-level activities — the user can tag activities to a
 * specific city within a trip (TR-04).
 * Cascade delete: removing a trip_place removes its activity associations.
 */
export const tripPlaceActivitiesMap = sqliteTable(
  'trip_place_activities_map',
  {
    tripPlaceId: integer('trip_place_id')
      .notNull()
      .references(() => tripPlaces.id, { onDelete: 'cascade' }),
    activityId: integer('activity_id')
      .notNull()
      .references(() => activities.id),
  },
  (t) => [primaryKey({ columns: [t.tripPlaceId, t.activityId] })],
);

/**
 * Trip ↔ Country junction — tracks which countries a trip visits (ADL-23).
 * USER-DECLARED and editable, not derived (this comment was stale — corrected
 * GE-20/ADL-54, verified by two independent probes: a grep of every writer
 * of this table found only POST/PATCH /api/trips (trips.ts) and the
 * trip-countries sub-router, never places.ts; and TripForm.tsx already
 * renders a country multi-select submitting country_codes on both trip
 * create and edit). The set is declared at trip creation and editable at any
 * time via the trip form — it is the input to GE-20's picker filter, not an
 * aggregation of already-added places' countries (that would make a hard
 * filter circular: you couldn't add a place in a country until you'd already
 * added a place in it).
 * Cascade delete: removing a trip removes its country associations.
 * RESTRICT on country: a country record must exist before it can be linked.
 */
export const tripCountries = sqliteTable(
  'trip_countries',
  {
    tripId: integer('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    countryCode: text('country_code')
      .notNull()
      .references(() => countries.countryCode, { onDelete: 'restrict' }),
    createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.tripId, t.countryCode] }),
    countryIdx: index('idx_trip_countries_country').on(t.countryCode),
  }),
);

// ============================================================
// 5. ITEMS (BASE TABLE + EXTENSION TABLES)
// ============================================================
// Architecture: Option B — base table + per-type extension tables (ADL-11).
// Extension tables have a 1:1 FK to items.id (the extension PK = items.id).
// This pattern gives clean per-type constraints and indexable rating columns.
//
// Experience and Note items use only the base table — they carry no
// type-specific structured fields beyond base notes (and item_experiences
// for rating/post-visit notes on confirmed Experience items).

/**
 * Items — base table for all item types.
 *
 * item_type determines which extension table (if any) holds additional fields.
 * trip_place_id is NULL for trip-level items (e.g. a flight attached to the trip,
 * not a specific city). This is also the target state when a place is deleted —
 * BUG-32: placeRepository.delete reassigns trip_place_id to NULL for any items
 * under the deleted place rather than cascade-deleting them (no onDelete is set
 * on this FK deliberately — application code owns this reassignment).
 *
 * Carry-forward pattern (ADL-13, IT-07):
 *   is_carried_forward = 1 AND carried_from_item_id IS NOT NULL → carried item
 *   BACKEND must enforce these two fields are always set together AT CREATE TIME.
 *
 *   This coupling is a CREATE-TIME invariant only, not a permanent one (ADL-36,
 *   BUG-39). carried_from_item_id is a nullable-after-source-deletion provenance
 *   pointer ("...from this specific source, while it still exists") — its FK has
 *   onDelete: 'set null', so deleting the source item clears the pointer without
 *   cascade-deleting the derived item (which is a first-class item on another
 *   trip with its own user-edited status/notes/rating). is_carried_forward is a
 *   permanent historical fact ("this item originated as a carry-forward") and is
 *   NOT cleared when the source is deleted. Therefore
 *   is_carried_forward = 1 AND carried_from_item_id IS NULL is a LEGITIMATE,
 *   INTENTIONAL post-deletion state — it means "this item was carried forward,
 *   but its source has since been deleted" — NOT data corruption. Do not add a
 *   runtime consistency check or backfill that treats it as a bug; the redundant
 *   boolean flag exists precisely so the historical fact survives loss of the
 *   pointer.
 */
export const items = sqliteTable(
  'items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    tripId: integer('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    // NULL for items logged at trip level, not against a specific city
    tripPlaceId: integer('trip_place_id').references(() => tripPlaces.id),
    itemType: text('item_type').notNull(),
    status: text('status').notNull().default('consider'),
    notes: text('notes'), // General notes — applies to all item types (IT-04)
    // Optional map/directions link — applies to all item types (IT-10, ADL-45 D1/D2).
    // Nullable, no default, no DB length CHECK (Zod-only cap, ADL-45 D3).
    mapUrl: text('map_url'),
    // Boolean flag — allows simple WHERE is_carried_forward = 1 queries
    isCarriedForward: integer('is_carried_forward').notNull().default(0),
    // Self-referential FK — preserves lineage to the source item (ADL-13)
    // Uses a lazy reference function to avoid circular dependency at module load time
    // onDelete: 'set null' (ADL-36, BUG-39) — deleting the source item must not
    // RESTRICT-block a normal trip/item delete; it clears this pointer only, and
    // never cascade-deletes the derived item on the other trip. See the table
    // doc comment above for why is_carried_forward can legitimately survive as 1
    // with this column NULL afterward.
    carriedFromItemId: integer('carried_from_item_id').references((): AnySQLiteColumn => items.id, {
      onDelete: 'set null',
    }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id), // HC-07c: NOT NULL enforced at DB level
    createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
    updatedAt: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
  },
  (t) => [
    index('idx_items_trip').on(t.tripId),
    index('idx_items_trip_place').on(t.tripPlaceId),
    index('idx_items_type').on(t.itemType),
    index('idx_items_status').on(t.status),
    // Partial index — only indexes items that are actually carry-forwards
    index('idx_items_carried')
      .on(t.carriedFromItemId)
      .where(sql`${t.carriedFromItemId} IS NOT NULL`),
    index('items_user_id_idx').on(t.userId),
    check(
      'chk_items_item_type',
      sql`${t.itemType} IN ('restaurant', 'hotel', 'flight', 'car_rental', 'experience', 'note')`,
    ),
    check(
      'chk_items_status',
      sql`${t.status} IN ('consider', 'confirmed', 'completed', 'cancelled', 'next_time')`,
    ),
    check('chk_items_is_carried_forward', sql`${t.isCarriedForward} IN (0, 1)`),
  ],
);

/**
 * Flight extension — one row per flight item (item_type = 'flight').
 * Each leg of a multi-leg journey is a separate item (FL-01).
 * All fields are optional — the user may log partial information.
 * Cascade delete: removing the base item removes the flight details.
 */
export const itemFlights = sqliteTable('item_flights', {
  itemId: integer('item_id')
    .primaryKey()
    .references(() => items.id, { onDelete: 'cascade' }),
  airline: text('airline'),
  flightNumber: text('flight_number'),
  departureAirport: text('departure_airport'), // IATA code preferred but not enforced
  arrivalAirport: text('arrival_airport'), // IATA code preferred but not enforced
  departureDatetime: text('departure_datetime'), // ISO 8601 datetime
  arrivalDatetime: text('arrival_datetime'), // ISO 8601 datetime
  bookingReference: text('booking_reference'),
  seat: text('seat'),
});

/**
 * Hotel extension — one row per hotel item (item_type = 'hotel').
 * Rating is 1–5 stars; NULL until the user rates after the stay (HT-04).
 * Duration is computed from check_in_date / check_out_date (HT-02) — not stored.
 * Cascade delete: removing the base item removes the hotel details.
 */
export const itemHotels = sqliteTable(
  'item_hotels',
  {
    itemId: integer('item_id')
      .primaryKey()
      .references(() => items.id, { onDelete: 'cascade' }),
    propertyName: text('property_name'),
    address: text('address'),
    checkInDate: text('check_in_date'), // ISO 8601 date
    checkOutDate: text('check_out_date'), // ISO 8601 date
    bookingReference: text('booking_reference'),
    confirmationNumber: text('confirmation_number'),
    rating: integer('rating'), // NULL = unrated (HT-04)
    postVisitNotes: text('post_visit_notes'), // NULL until reviewed (HT-04)
  },
  (t) => [
    // Index on rating for sort/filter queries (IT-08, IT-09)
    index('idx_item_hotels_rating').on(t.rating),
    check('chk_item_hotels_rating', sql`${t.rating} IS NULL OR (${t.rating} BETWEEN 1 AND 5)`),
  ],
);

/**
 * Car rental extension — one row per car rental item (item_type = 'car_rental').
 * Cascade delete: removing the base item removes the rental details.
 */
export const itemCarRentals = sqliteTable('item_car_rentals', {
  itemId: integer('item_id')
    .primaryKey()
    .references(() => items.id, { onDelete: 'cascade' }),
  provider: text('provider'),
  pickupLocation: text('pickup_location'),
  dropoffLocation: text('dropoff_location'),
  pickupDatetime: text('pickup_datetime'), // ISO 8601 datetime
  dropoffDatetime: text('dropoff_datetime'), // ISO 8601 datetime
  bookingReference: text('booking_reference'),
  vehicleClass: text('vehicle_class'),
});

/**
 * Restaurant extension — one row per restaurant item (item_type = 'restaurant').
 * Rating is 1–5 stars; NULL until the user rates after the visit (RS-03).
 * source records how the user discovered the restaurant (RS-01).
 * Cascade delete: removing the base item removes the restaurant details.
 */
export const itemRestaurants = sqliteTable(
  'item_restaurants',
  {
    itemId: integer('item_id')
      .primaryKey()
      .references(() => items.id, { onDelete: 'cascade' }),
    name: text('name'),
    neighbourhoodArea: text('neighbourhood_area'),
    cuisineType: text('cuisine_type'),
    source: text('source'), // How the user heard about it (RS-01)
    rating: integer('rating'), // NULL = unrated (RS-03)
    postVisitNotes: text('post_visit_notes'), // NULL until reviewed (RS-03)
  },
  (t) => [
    index('idx_item_restaurants_rating').on(t.rating),
    check('chk_item_restaurants_rating', sql`${t.rating} IS NULL OR (${t.rating} BETWEEN 1 AND 5)`),
  ],
);

/**
 * Experience extension — added in schema v1.1 (EX-01, ADL-14).
 * PO confirmed Experiences are rateable (1–5 stars) with post-visit notes.
 *
 * Lazy row creation: BACKEND creates this extension row only when the user
 * first adds a rating or post-visit note to a completed Experience item.
 * Experience items with no rating or notes do NOT require a row here.
 *
 * Cascade delete: removing the base item removes the experience details.
 */
export const itemExperiences = sqliteTable(
  'item_experiences',
  {
    itemId: integer('item_id')
      .primaryKey()
      .references(() => items.id, { onDelete: 'cascade' }),
    rating: integer('rating'), // NULL = unrated (EX-01)
    postVisitNotes: text('post_visit_notes'), // NULL until reviewed (EX-01)
  },
  (t) => [
    index('idx_item_experiences_rating').on(t.rating),
    check('chk_item_experiences_rating', sql`${t.rating} IS NULL OR (${t.rating} BETWEEN 1 AND 5)`),
  ],
);

// ============================================================
// 6. AUTH / USERS
// ============================================================

/**
 * Users — one record per authenticated user (ADL-20).
 * Internal `id` is a UUID v4 string (ADL-16, prevents enumeration).
 * `clerk_id` is the external Clerk identifier; all FK relationships use `id`.
 * No password_hash, oauth_provider, or refresh_token — Clerk handles auth.
 * `email` is stored for display/admin purposes; Clerk is authoritative for identity.
 */
export const users = sqliteTable('users', {
  id: text('id').primaryKey(), // UUID v4 — generated by backend on first sign-in
  clerkId: text('clerk_id').notNull().unique(), // Clerk user ID (e.g. user_2abc...)
  email: text('email').notNull(),
  // ADL-27: 1 = owner (has access to admin routes), 0 = non-owner. Set from OWNER_CLERK_ID env var.
  isOwner: integer('is_owner').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// ============================================================
// TYPE EXPORTS
// ============================================================
// Every table exports its inferred TypeScript types so BACKEND can import
// them directly from this file. This eliminates manual type duplication and
// guarantees BACKEND types are always in sync with the schema.

export type Country = typeof countries.$inferSelect;
export type NewCountry = typeof countries.$inferInsert;

export type Region = typeof regions.$inferSelect;
export type NewRegion = typeof regions.$inferInsert;

export type City = typeof cities.$inferSelect;
export type NewCity = typeof cities.$inferInsert;

export type TripCategory = typeof tripCategories.$inferSelect;
export type NewTripCategory = typeof tripCategories.$inferInsert;

export type Activity = typeof activities.$inferSelect;
export type NewActivity = typeof activities.$inferInsert;

export type Companion = typeof companions.$inferSelect;
export type NewCompanion = typeof companions.$inferInsert;

export type MapShadingConfig = typeof mapShadingConfig.$inferSelect;
export type NewMapShadingConfig = typeof mapShadingConfig.$inferInsert;

export type Trip = typeof trips.$inferSelect;
export type NewTrip = typeof trips.$inferInsert;

export type TripCategoriesMap = typeof tripCategoriesMap.$inferSelect;
export type NewTripCategoriesMap = typeof tripCategoriesMap.$inferInsert;

export type TripCompanionsMap = typeof tripCompanionsMap.$inferSelect;
export type NewTripCompanionsMap = typeof tripCompanionsMap.$inferInsert;

export type TripActivitiesMap = typeof tripActivitiesMap.$inferSelect;
export type NewTripActivitiesMap = typeof tripActivitiesMap.$inferInsert;

export type TripPlace = typeof tripPlaces.$inferSelect;
export type NewTripPlace = typeof tripPlaces.$inferInsert;

export type TripPlaceActivitiesMap = typeof tripPlaceActivitiesMap.$inferSelect;
export type NewTripPlaceActivitiesMap = typeof tripPlaceActivitiesMap.$inferInsert;

export type TripCountry = typeof tripCountries.$inferSelect;
export type NewTripCountry = typeof tripCountries.$inferInsert;

export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;

export type ItemFlight = typeof itemFlights.$inferSelect;
export type NewItemFlight = typeof itemFlights.$inferInsert;

export type ItemHotel = typeof itemHotels.$inferSelect;
export type NewItemHotel = typeof itemHotels.$inferInsert;

export type ItemCarRental = typeof itemCarRentals.$inferSelect;
export type NewItemCarRental = typeof itemCarRentals.$inferInsert;

export type ItemRestaurant = typeof itemRestaurants.$inferSelect;
export type NewItemRestaurant = typeof itemRestaurants.$inferInsert;

export type ItemExperience = typeof itemExperiences.$inferSelect;
export type NewItemExperience = typeof itemExperiences.$inferInsert;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
