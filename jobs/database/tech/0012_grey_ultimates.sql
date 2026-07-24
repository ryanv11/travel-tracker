PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_companions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "chk_companions_is_active" CHECK("__new_companions"."is_active" IN (0, 1))
);
--> statement-breakpoint
-- ADL-28 (AD-08): assign existing global companion rows to the app owner.
-- If no is_owner=1 user exists yet (fresh/dev DB), the CROSS JOIN matches
-- against an empty set and this INSERT copies 0 rows — any pre-existing
-- global companion rows are then silently dropped when the old table is
-- replaced below. This is documented and accepted in ADL-28 (R3): it can
-- only happen in dev (production will always have an owner before non-owner
-- data exists), and a backfill script can recover the data if ever needed.
INSERT INTO `__new_companions` ("id", "user_id", "name", "is_active", "created_at", "updated_at")
SELECT c."id", u."id", c."name", c."is_active", c."created_at", c."updated_at"
FROM `companions` c
CROSS JOIN (SELECT "id" FROM `users` WHERE "is_owner" = 1 LIMIT 1) u;--> statement-breakpoint
DROP TABLE `companions`;--> statement-breakpoint
ALTER TABLE `__new_companions` RENAME TO `companions`;--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_companions_user_name` ON `companions` (`user_id`,`name`);--> statement-breakpoint
CREATE INDEX `idx_companions_user` ON `companions` (`user_id`);--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_map_shading_config` (
	`state_key` text NOT NULL,
	`user_id` text NOT NULL,
	`display_name` text NOT NULL,
	`color_hex` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	PRIMARY KEY(`state_key`, `user_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "chk_map_shading_state_key" CHECK("__new_map_shading_config"."state_key" IN ('active', 'planned', 'visited_once', 'visited_once_planning', 'visited_multiple', 'visited_multiple_planning'))
);
--> statement-breakpoint
-- ADL-28 (AD-07): assign existing global shading-config rows to the app
-- owner. Same no-owner-at-migration-time caveat as companions above (R3) —
-- 0 rows copied on a fresh/dev DB with no is_owner=1 user, which is
-- acceptable there; the lazy-seed repository logic (Backend brief) creates
-- each user's 6 default rows on their first access regardless.
INSERT INTO `__new_map_shading_config` ("state_key", "user_id", "display_name", "color_hex", "updated_at")
SELECT m."state_key", u."id", m."display_name", m."color_hex", m."updated_at"
FROM `map_shading_config` m
CROSS JOIN (SELECT "id" FROM `users` WHERE "is_owner" = 1 LIMIT 1) u;--> statement-breakpoint
DROP TABLE `map_shading_config`;--> statement-breakpoint
ALTER TABLE `__new_map_shading_config` RENAME TO `map_shading_config`;--> statement-breakpoint
CREATE INDEX `idx_map_shading_user` ON `map_shading_config` (`user_id`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
