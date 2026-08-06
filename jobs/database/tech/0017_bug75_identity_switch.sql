-- BUG-75 / GE-16 (v3.19): city-identity carry channel — SWITCH stage (ADL-47 stage 2,
-- design v3 §B2 as corrected by review F2 + m-1/m-2/m-3).
--
-- HAND-EDITED, NOT trusted as drizzle-generated. drizzle-kit generate correctly emitted the
-- table recreation shape (this migration needs one because chk_cities_osm_both_or_neither is a
-- new CHECK constraint, and SQLite has no ALTER TABLE ADD CONSTRAINT) and correctly selected
-- osm_type/osm_id/display_name from the OLD `cities` table in the INSERT ... SELECT (0016 added
-- those columns first, so unlike 0015's original bug they DO exist on the pre-migration table
-- here). But it reproduced ADL-15 bug 4 (the COALESCE-comma-split bug) on the pending-per-creator
-- index: it split `COALESCE(region_id, 0)` and `COALESCE(created_by_user_id, '')` on their
-- internal commas, mangling them into bogus quoted identifiers. That one CREATE UNIQUE INDEX
-- statement is hand-corrected below (verified against schema.ts); everything else is emitted
-- as generated. 0015 is the hand-written template this follows (m-2).
--
-- What changes (all landing in this ONE atomic stage — the index set and the code that depends
-- on it are mutually dependent, so they cannot be split further; design v3 §B2 / F2):
--   1. DROP `uniq_cities_name_country_region_ci` (ADL-46 D13) — it was unconditional and forbade
--      ANY two rows sharing (name, country, region), which is exactly what prevented distinct
--      real places (e.g. two same-region Newports) from coexisting.
--   2. ADD `uniq_cities_osm_ref` — UNIQUE (osm_type, osm_id) WHERE osm_id IS NOT NULL. One row
--      per real OSM place; distinct-osm_id rows coexist; a same-osm_id repeat collides (drives
--      the M1/F3 caught-unique-violation merge). Partial: existing/legacy NULL-osm_id rows never
--      collide here — no backfill needed, this key is additive.
--   3. ADD `uniq_cities_pending_per_creator` — UNIQUE (name COLLATE NOCASE, country_code,
--      COALESCE(region_id,0), COALESCE(created_by_user_id,'')) WHERE geocode_status = 'pending'.
--      Lets two different users each hold their own pending row for the same
--      (name, country, region) without colliding, now that the global index is gone.
--   4. ADD `chk_cities_osm_both_or_neither` — CHECK ((osm_type IS NULL) = (osm_id IS NULL)) (m-3).
--      Closes a NULL-distinct-semantics gap at the layer the osm_ref index depends on: if osm_id
--      were ever non-null with osm_type NULL, SQLite would silently weaken that index's first
--      key position.
--
-- NULL hazards (BUG-33 reopener) — verified not reopened: osm_id NULL on pending/legacy rows is
-- excluded by `WHERE osm_id IS NOT NULL` (no false collisions; not BUG-33, which was NULL
-- *region*); COALESCE(created_by_user_id,'') collapses NULL creators to one sentinel that cannot
-- collide with a real Clerk id; COALESCE(region_id,0) collapses NULL region to a sentinel
-- (regions.id AUTOINCREMENTs from 1, never issues 0 — carried forward from D13). No backfill: the
-- new key set is additive/more permissive for existing rows, not a narrowing of what they relied
-- on. id is PRESERVED — trip_places.city_id (NOT NULL) FKs to it. db:push is FORBIDDEN (ADL-15).
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_cities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`country_code` text NOT NULL,
	`region_id` integer,
	`name` text NOT NULL,
	`latitude` real,
	`longitude` real,
	`geocode_status` text DEFAULT 'pending' NOT NULL,
	`geocode_attempted_at` text,
	`geocode_attempts` integer DEFAULT 0 NOT NULL,
	`created_by_user_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	`osm_type` text,
	`osm_id` integer,
	`display_name` text,
	FOREIGN KEY (`country_code`) REFERENCES `countries`(`country_code`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`region_id`) REFERENCES `regions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "chk_cities_geocode_status" CHECK("__new_cities"."geocode_status" IN ('pending', 'resolved', 'unresolvable')),
	CONSTRAINT "chk_cities_osm_both_or_neither" CHECK(("__new_cities"."osm_type" IS NULL) = ("__new_cities"."osm_id" IS NULL))
);
--> statement-breakpoint
INSERT INTO `__new_cities`("id", "country_code", "region_id", "name", "latitude", "longitude", "geocode_status", "geocode_attempted_at", "geocode_attempts", "created_by_user_id", "created_at", "updated_at", "osm_type", "osm_id", "display_name") SELECT "id", "country_code", "region_id", "name", "latitude", "longitude", "geocode_status", "geocode_attempted_at", "geocode_attempts", "created_by_user_id", "created_at", "updated_at", "osm_type", "osm_id", "display_name" FROM `cities`;--> statement-breakpoint
DROP TABLE `cities`;--> statement-breakpoint
ALTER TABLE `__new_cities` RENAME TO `cities`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_cities_country` ON `cities` (`country_code`);--> statement-breakpoint
CREATE INDEX `idx_cities_region` ON `cities` (`region_id`);--> statement-breakpoint
CREATE INDEX `idx_cities_geocode` ON `cities` (`geocode_status`) WHERE "cities"."geocode_status" = 'pending';--> statement-breakpoint
-- Resolved-by-OSM identity index — WHERE clause hand-simplified to a bare unqualified column
-- reference (drizzle's default table-qualified `"cities"."osm_id"` form is valid SQLite but is
-- NOT how a partial index's own WHERE clause needs to be written — the indexed table is already
-- implicit — so this is written the plain way: `WHERE osm_id IS NOT NULL`, verified equivalent
-- against schema.ts's uniqueIndex('uniq_cities_osm_ref') definition).
CREATE UNIQUE INDEX `uniq_cities_osm_ref` ON `cities` (`osm_type`,`osm_id`) WHERE osm_id IS NOT NULL;--> statement-breakpoint
-- Pending-per-creator identity index — HAND-CORRECTED (ADL-15 bug 4: drizzle-kit split each
-- COALESCE(...) on its internal comma into bogus separate quoted identifiers). Verified against
-- schema.ts's uniqueIndex('uniq_cities_pending_per_creator') definition and against 0015's
-- COALESCE("region_id", 0) syntax (the working hand-written template). WHERE clause likewise
-- written as a bare unqualified column reference (see uniq_cities_osm_ref above).
CREATE UNIQUE INDEX `uniq_cities_pending_per_creator` ON `cities` ("name" COLLATE NOCASE, `country_code`, COALESCE("region_id", 0), COALESCE("created_by_user_id", '')) WHERE geocode_status = 'pending';
