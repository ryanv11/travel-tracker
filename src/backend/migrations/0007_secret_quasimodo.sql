PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trip_id` integer NOT NULL,
	`trip_place_id` integer,
	`item_type` text NOT NULL,
	`status` text DEFAULT 'consider' NOT NULL,
	`notes` text,
	`is_carried_forward` integer DEFAULT 0 NOT NULL,
	`carried_from_item_id` integer,
	`user_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`trip_place_id`) REFERENCES `trip_places`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`carried_from_item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "chk_items_item_type" CHECK("__new_items"."item_type" IN ('restaurant', 'hotel', 'flight', 'car_rental', 'experience', 'note')),
	CONSTRAINT "chk_items_status" CHECK("__new_items"."status" IN ('consider', 'confirmed', 'completed', 'cancelled', 'next_time')),
	CONSTRAINT "chk_items_is_carried_forward" CHECK("__new_items"."is_carried_forward" IN (0, 1))
);
--> statement-breakpoint
INSERT INTO `__new_items`("id", "trip_id", "trip_place_id", "item_type", "status", "notes", "is_carried_forward", "carried_from_item_id", "user_id", "created_at", "updated_at") SELECT "id", "trip_id", "trip_place_id", "item_type", "status", "notes", "is_carried_forward", "carried_from_item_id", "user_id", "created_at", "updated_at" FROM `items`;--> statement-breakpoint
DROP TABLE `items`;--> statement-breakpoint
ALTER TABLE `__new_items` RENAME TO `items`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_items_trip` ON `items` (`trip_id`);--> statement-breakpoint
CREATE INDEX `idx_items_trip_place` ON `items` (`trip_place_id`);--> statement-breakpoint
CREATE INDEX `idx_items_type` ON `items` (`item_type`);--> statement-breakpoint
CREATE INDEX `idx_items_status` ON `items` (`status`);--> statement-breakpoint
CREATE INDEX `idx_items_carried` ON `items` (`carried_from_item_id`) WHERE "items"."carried_from_item_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `items_user_id_idx` ON `items` (`user_id`);--> statement-breakpoint
CREATE TABLE `__new_trip_places` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trip_id` integer NOT NULL,
	`city_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`arrived_on` text,
	`departed_on` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`city_id`) REFERENCES `cities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_trip_places`("id", "trip_id", "city_id", "user_id", "arrived_on", "departed_on", "created_at", "updated_at") SELECT "id", "trip_id", "city_id", "user_id", "arrived_on", "departed_on", "created_at", "updated_at" FROM `trip_places`;--> statement-breakpoint
DROP TABLE `trip_places`;--> statement-breakpoint
ALTER TABLE `__new_trip_places` RENAME TO `trip_places`;--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_trip_places_trip_city` ON `trip_places` (`trip_id`,`city_id`);--> statement-breakpoint
CREATE INDEX `idx_trip_places_trip` ON `trip_places` (`trip_id`);--> statement-breakpoint
CREATE INDEX `idx_trip_places_city` ON `trip_places` (`city_id`);--> statement-breakpoint
CREATE INDEX `trip_places_user_id_idx` ON `trip_places` (`user_id`);--> statement-breakpoint
CREATE TABLE `__new_trips` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`status` text DEFAULT 'planning' NOT NULL,
	`photo_album_ref` text,
	`user_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "chk_trips_status" CHECK("__new_trips"."status" IN ('planning', 'active', 'review_pending', 'locked'))
);
--> statement-breakpoint
INSERT INTO `__new_trips`("id", "name", "start_date", "end_date", "status", "photo_album_ref", "user_id", "created_at", "updated_at") SELECT "id", "name", "start_date", "end_date", "status", "photo_album_ref", "user_id", "created_at", "updated_at" FROM `trips`;--> statement-breakpoint
DROP TABLE `trips`;--> statement-breakpoint
ALTER TABLE `__new_trips` RENAME TO `trips`;--> statement-breakpoint
CREATE INDEX `idx_trips_status` ON `trips` (`status`);--> statement-breakpoint
CREATE INDEX `idx_trips_start_date` ON `trips` (`start_date`);--> statement-breakpoint
CREATE INDEX `idx_trips_end_date` ON `trips` (`end_date`);--> statement-breakpoint
CREATE INDEX `trips_user_id_idx` ON `trips` (`user_id`);