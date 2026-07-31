-- ADL-46 S3 (D3, AD-09): trip_categories and activities become PER-USER.
--
-- HAND-WRITTEN, NOT drizzle-generated. drizzle-kit generate emits
--   ALTER TABLE `activities` ADD `user_id` text NOT NULL REFERENCES users(id);
-- which SQLite can NEVER apply: adding a NOT NULL column requires a non-NULL
-- default, and adding a REFERENCES column under FK enforcement requires a NULL
-- default — mutually exclusive ("Cannot add a NOT NULL column with default
-- value NULL"). The generated file was discarded (ADL-46 §9.3.1 / review F2).
-- This is the 12-step SQLite table recreation, mirroring 0012_grey_ultimates.sql
-- (companions + shading, ADL-28 prior art) and the validated SQL appended to
-- jobs/architect/tech/ADL-46-review.md (executed against the real migration chain:
-- id preserved, trip_categories_map intact, PRAGMA foreign_key_check clean, on
-- both libSQL transports incl. remote Turso). db:push is FORBIDDEN (ADL-15).
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_trip_categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "chk_trip_categories_is_active" CHECK("__new_trip_categories"."is_active" IN (0, 1))
);
--> statement-breakpoint
-- Assign existing global rows to the app owner, PRESERVING id —
-- trip_categories_map.category_id FKs to it. Two caveats the pre-migration
-- check (§9.3.2) must cover: (a) ZERO owners (fresh dev DB) → CROSS JOIN
-- matches an empty set, copies 0 rows; accepted, lazy seed covers it (ADL-28 R3);
-- (b) MULTI owner → LIMIT 1 with no ORDER BY picks an arbitrary owner (review F9),
-- so the check must assert exactly one is_owner = 1 row before this runs.
INSERT INTO `__new_trip_categories` ("id", "user_id", "name", "is_active", "created_at", "updated_at")
SELECT c."id", u."id", c."name", c."is_active", c."created_at", c."updated_at"
FROM `trip_categories` c
CROSS JOIN (SELECT "id" FROM `users` WHERE "is_owner" = 1 LIMIT 1) u;--> statement-breakpoint
DROP TABLE `trip_categories`;--> statement-breakpoint
ALTER TABLE `__new_trip_categories` RENAME TO `trip_categories`;--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_trip_categories_user_name` ON `trip_categories` (`user_id`,`name`);--> statement-breakpoint
CREATE INDEX `idx_trip_categories_user` ON `trip_categories` (`user_id`);--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_activities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "chk_activities_is_active" CHECK("__new_activities"."is_active" IN (0, 1))
);
--> statement-breakpoint
-- Same owner-assignment + id-preservation as trip_categories above. Both
-- trip_activities_map.activity_id AND trip_place_activities_map.activity_id
-- FK to activities.id, so id preservation is doubly load-bearing here.
INSERT INTO `__new_activities` ("id", "user_id", "name", "is_active", "created_at", "updated_at")
SELECT a."id", u."id", a."name", a."is_active", a."created_at", a."updated_at"
FROM `activities` a
CROSS JOIN (SELECT "id" FROM `users` WHERE "is_owner" = 1 LIMIT 1) u;--> statement-breakpoint
DROP TABLE `activities`;--> statement-breakpoint
ALTER TABLE `__new_activities` RENAME TO `activities`;--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_activities_user_name` ON `activities` (`user_id`,`name`);--> statement-breakpoint
CREATE INDEX `idx_activities_user` ON `activities` (`user_id`);--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
-- Self-verifying invariant (ADL-46 §9.3.3). The pre-migration count is
-- point-in-time; rows can appear between the probe and this deploy because all
-- three write paths accept IDs under requireAuth alone. The CROSS JOIN backfill
-- re-points nothing in the junction tables, so the risk is not corruption but
-- SILENTLY LEGITIMISING a cross-user reference. This guard converts the query
-- into a run-time invariant: a failed migration is recoverable; a silently wrong
-- one is not. THREE junction tables, two distinct join paths — trip_categories_map
-- and trip_activities_map join a user via trips; the third,
-- trip_place_activities_map, joins via trip_places (NOT trips) — the path the
-- first-draft check omitted (review F1(a)).
--
-- MECHANISM DEVIATION from ADL-46 §9.3.3's literal SQL, documented deliberately:
-- the spec's `SELECT RAISE(ABORT, ...) WHERE EXISTS(...)` is INVALID in SQLite/
-- libSQL — "RAISE() may only be used within a trigger-program" (confirmed by
-- running it: LibsqlError SQLITE_ERROR). The review's appendix never executed the
-- assertions (they were a trailing comment), so this was not caught upstream. The
-- INTENT is preserved exactly with a portable construct that genuinely aborts and
-- rolls the whole migration back: a scratch table whose per-column NAMED CHECK
-- constraints require 'ok'. If any junction crosses a user boundary the CASE emits
-- 'CROSS-USER', the INSERT violates that column's CHECK, and the migration aborts
-- naming which invariant failed (e.g. "CHECK constraint failed:
-- no_cross_user_trip_category_mapping"). On success the row inserts and the table
-- is dropped. Works identically on both libSQL transports incl. remote Turso.
CREATE TABLE `_adl46_s3_cross_user_assert` (
	`cat_map` text NOT NULL CONSTRAINT `no_cross_user_trip_category_mapping` CHECK (`cat_map` = 'ok'),
	`act_map` text NOT NULL CONSTRAINT `no_cross_user_trip_activity_mapping` CHECK (`act_map` = 'ok'),
	`place_act_map` text NOT NULL CONSTRAINT `no_cross_user_place_activity_mapping` CHECK (`place_act_map` = 'ok')
);
--> statement-breakpoint
INSERT INTO `_adl46_s3_cross_user_assert` ("cat_map", "act_map", "place_act_map")
SELECT
	CASE WHEN EXISTS (
		SELECT 1 FROM `trip_categories_map` m
			JOIN `trips` t ON t.`id` = m.`trip_id`
			JOIN `trip_categories` c ON c.`id` = m.`category_id`
		 WHERE c.`user_id` <> t.`user_id`
	) THEN 'CROSS-USER' ELSE 'ok' END,
	CASE WHEN EXISTS (
		SELECT 1 FROM `trip_activities_map` m
			JOIN `trips` t ON t.`id` = m.`trip_id`
			JOIN `activities` a ON a.`id` = m.`activity_id`
		 WHERE a.`user_id` <> t.`user_id`
	) THEN 'CROSS-USER' ELSE 'ok' END,
	CASE WHEN EXISTS (
		SELECT 1 FROM `trip_place_activities_map` m
			JOIN `trip_places` p ON p.`id` = m.`trip_place_id`
			JOIN `activities` a ON a.`id` = m.`activity_id`
		 WHERE a.`user_id` <> p.`user_id`
	) THEN 'CROSS-USER' ELSE 'ok' END;--> statement-breakpoint
DROP TABLE `_adl46_s3_cross_user_assert`;
