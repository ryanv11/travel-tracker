CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`clerk_id` text NOT NULL,
	`email` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_clerk_id_unique` ON `users` (`clerk_id`);--> statement-breakpoint
ALTER TABLE `map_shading_config` DROP COLUMN `subscription_id`;--> statement-breakpoint
ALTER TABLE `trip_places` DROP COLUMN `created_by_account_id`;--> statement-breakpoint
ALTER TABLE `trips` DROP COLUMN `owner_account_id`;--> statement-breakpoint
ALTER TABLE `trips` DROP COLUMN `subscription_id`;--> statement-breakpoint
ALTER TABLE `trips` DROP COLUMN `created_by_account_id`;