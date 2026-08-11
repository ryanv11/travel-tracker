-- GE-19 / BUG-85 (BRD v3.20) — geocode status-lifecycle substrate (ADL-55 §3.5).
--
-- HAND-EDITED, NOT trusted as purely drizzle-generated. Two schema changes drive a table rebuild
-- (SQLite has no ALTER TABLE ADD CONSTRAINT, so widening chk_cities_geocode_status forces the
-- __new_cities + INSERT…SELECT + drop/rename shape — same as migration 0017):
--   1. chk_cities_geocode_status widened to admit the new terminal status 'needs_attention'.
--   2. New nullable column geocode_cause TEXT + chk_cities_geocode_cause
--      (IN ('ambiguous','unreachable') OR IS NULL). Existing rows carry NULL (excluded from the
--      INSERT…SELECT column list, defaults NULL).
--
-- TWO drizzle-kit bugs were hand-corrected below (verified against schema.ts); everything else is
-- emitted as generated:
--   (a) The INSERT…SELECT wrongly pulled the NEW geocode_cause column FROM the old table (the "0015
--       original bug" — the old table has no such column; it failed at runtime). Supplied as NULL.
--   (b) ADL-15 bug 4 (the COALESCE-comma-split bug) on the regenerated uniq_cities_pending_per_creator
--       index — exactly as it did in 0017. Rewritten to 0017:82's proven form.
--   (c) uniq_cities_osm_ref's WHERE hand-simplified to the bare `osm_id IS NOT NULL` form (0017:76);
--       drizzle's table-qualified form is valid but the end-state migration test locks the bare form.
-- A trailing backfill UPDATE promotes any already-capped 'pending' row to 'needs_attention'
-- (ADL-55 §3.5). db:push is FORBIDDEN (ADL-15) — this was produced by db:generate then hand-corrected.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_cities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`country_code` text NOT NULL,
	`region_id` integer,
	`name` text NOT NULL,
	`latitude` real,
	`longitude` real,
	`geocode_status` text DEFAULT 'pending' NOT NULL,
	`geocode_cause` text,
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
	CONSTRAINT "chk_cities_geocode_status" CHECK("__new_cities"."geocode_status" IN ('pending', 'resolved', 'unresolvable', 'needs_attention')),
	CONSTRAINT "chk_cities_geocode_cause" CHECK("__new_cities"."geocode_cause" IN ('ambiguous', 'unreachable') OR "__new_cities"."geocode_cause" IS NULL),
	CONSTRAINT "chk_cities_osm_both_or_neither" CHECK(("__new_cities"."osm_type" IS NULL) = ("__new_cities"."osm_id" IS NULL))
);
--> statement-breakpoint
-- id PRESERVED. geocode_cause is a NEW column, absent from the OLD cities table, so it is NOT
-- selected from it — supplied as a NULL literal instead (mirrors 0015:48-50's 0/NULL literals for
-- geocode_attempts/created_by_user_id). drizzle-kit's generated SELECT wrongly pulled "geocode_cause"
-- FROM the old table (the "0015 original bug", per 0017's header) and failed at runtime with
-- "no such column: geocode_cause"; HAND-CORRECTED here. Existing rows carry NULL cause (ADL-55 §3.5
-- point 2; §4 null-cause label). Every other selected column exists on the pre-migration table.
INSERT INTO `__new_cities`("id", "country_code", "region_id", "name", "latitude", "longitude", "geocode_status", "geocode_cause", "geocode_attempted_at", "geocode_attempts", "created_by_user_id", "created_at", "updated_at", "osm_type", "osm_id", "display_name") SELECT "id", "country_code", "region_id", "name", "latitude", "longitude", "geocode_status", NULL, "geocode_attempted_at", "geocode_attempts", "created_by_user_id", "created_at", "updated_at", "osm_type", "osm_id", "display_name" FROM `cities`;--> statement-breakpoint
DROP TABLE `cities`;--> statement-breakpoint
ALTER TABLE `__new_cities` RENAME TO `cities`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_cities_country` ON `cities` (`country_code`);--> statement-breakpoint
CREATE INDEX `idx_cities_region` ON `cities` (`region_id`);--> statement-breakpoint
CREATE INDEX `idx_cities_geocode` ON `cities` (`geocode_status`) WHERE "cities"."geocode_status" = 'pending';--> statement-breakpoint
-- Resolved-by-OSM identity index — WHERE hand-simplified to a bare unqualified column reference,
-- mirroring 0017:76 (a partial index's own WHERE implies the indexed table). drizzle emits the
-- table-qualified `"cities"."osm_id"` form, which is valid SQLite and applies fine, but the end-state
-- migration test (bug75-identity-migration.test.ts:84) locks the bare form, so 0017's hand form is used.
CREATE UNIQUE INDEX `uniq_cities_osm_ref` ON `cities` (`osm_type`,`osm_id`) WHERE osm_id IS NOT NULL;--> statement-breakpoint
-- Pending-per-creator identity index — HAND-CORRECTED (ADL-15 bug 4 recurred: drizzle-kit split each
-- COALESCE(...) on its internal comma into bogus separate quoted identifiers, and wrapped
-- `"name" COLLATE NOCASE` as one literal identifier). Rewritten to the proven form migration 0017:82
-- used, verified equivalent against schema.ts's uniqueIndex('uniq_cities_pending_per_creator')
-- definition. WHERE written as a bare unqualified column reference (the indexed table is implicit),
-- matching 0017; drizzle's table-qualified form is also valid SQLite but this mirrors the template.
CREATE UNIQUE INDEX `uniq_cities_pending_per_creator` ON `cities` ("name" COLLATE NOCASE, `country_code`, COALESCE("region_id", 0), COALESCE("created_by_user_id", '')) WHERE geocode_status = 'pending';--> statement-breakpoint
-- GE-19 / ADL-55 §3.5 backfill: promote any row already at/over the retry cap to the new terminal
-- state so the badge stops silently counting it as in-progress. Cap literal 5 is point-in-time-correct
-- for this migration (GEOCODE_ATTEMPT_CAP at authoring). Backfilled rows keep geocode_cause NULL — their
-- historical cause is UNVERIFIED and is deliberately not asserted as 'ambiguous' (§3.5; §4 null-cause label).
UPDATE `cities` SET `geocode_status` = 'needs_attention' WHERE `geocode_status` = 'pending' AND `geocode_attempts` >= 5;