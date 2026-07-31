-- ADL-46 S4 (D5/GE-16, D10, D13): cities recreation.
--
-- HAND-WRITTEN, NOT drizzle-generated. drizzle-kit generate emitted a recreation
-- whose INSERT ... SELECT pulled `geocode_attempts` and `created_by_user_id` from
-- the OLD cities table (which has neither column) — it would fail at runtime — and
-- MANGLED the expression unique index into
--   (`"name" COLLATE NOCASE`,`country_code`,`COALESCE("region_id"`,` 0)`)
-- splitting COALESCE on its comma (one of the four drizzle-kit SQLite bugs ADL-15
-- patches). The generated file was discarded (ADL-46 §9.3.4). This is the
-- hand-written 12-step recreation; both index definitions are hand-verified
-- against schema.ts, not trusted from generated output.
--
-- What changes: + geocode_attempts (D10, DEFAULT 0), + created_by_user_id
-- (nullable FK ON DELETE SET NULL — deliberate, ADL-46 §9.2 / §4.4), the
-- geocode_status CHECK amended to add 'unresolvable' (D10 — the reason this is a
-- table recreation and not an ADD COLUMN), and uniq_cities_name_country_ci
-- DROPPED and replaced by the (name, country_code, COALESCE(region_id,0)) identity
-- index (D13). No owner backfill: existing rows keep created_by_user_id NULL (a
-- record with no recorded creator is global-visible per GE-16); geocode_attempts
-- defaults 0. id is PRESERVED — trip_places.city_id (NOT NULL) FKs to it.
-- The new identity key is strictly MORE permissive than the one it replaces, so
-- no existing row can violate it: no backfill, no conflict handling.
-- db:push is FORBIDDEN (ADL-15).
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
	FOREIGN KEY (`country_code`) REFERENCES `countries`(`country_code`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`region_id`) REFERENCES `regions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "chk_cities_geocode_status" CHECK("__new_cities"."geocode_status" IN ('pending', 'resolved', 'unresolvable'))
);
--> statement-breakpoint
-- id PRESERVED. New columns get their literal defaults — geocode_attempts = 0,
-- created_by_user_id = NULL (no owner backfill; NULL = "no known creator",
-- global-visible per GE-16). The old table has neither column, so they are NOT
-- selected from it — supplied as literals instead.
INSERT INTO `__new_cities` ("id", "country_code", "region_id", "name", "latitude", "longitude", "geocode_status", "geocode_attempted_at", "geocode_attempts", "created_by_user_id", "created_at", "updated_at")
SELECT "id", "country_code", "region_id", "name", "latitude", "longitude", "geocode_status", "geocode_attempted_at", 0, NULL, "created_at", "updated_at"
FROM `cities`;--> statement-breakpoint
DROP TABLE `cities`;--> statement-breakpoint
ALTER TABLE `__new_cities` RENAME TO `cities`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_cities_country` ON `cities` (`country_code`);--> statement-breakpoint
CREATE INDEX `idx_cities_region` ON `cities` (`region_id`);--> statement-breakpoint
-- Partial index — hand-written WHERE clause (drizzle-kit fails to read partial
-- index WHERE, ADL-15 bug 4). Bonus: 'unresolvable' rows drop out of this index
-- automatically, keeping the geocode queue scan tight (ADL-46 D10).
CREATE INDEX `idx_cities_geocode` ON `cities` (`geocode_status`) WHERE "cities"."geocode_status" = 'pending';--> statement-breakpoint
-- D13 identity index (ADL-46 §4.2.1). COALESCE(region_id, 0) collapses NULL to a
-- sentinel — regions.id AUTOINCREMENTs from 1 and never issues 0. Getting the
-- COLLATE NOCASE or the COALESCE wrong silently breaks find-or-create; hand-written.
CREATE UNIQUE INDEX `uniq_cities_name_country_region_ci` ON `cities` ("name" COLLATE NOCASE, `country_code`, COALESCE("region_id", 0));
