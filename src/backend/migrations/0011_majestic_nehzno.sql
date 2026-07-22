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
	FOREIGN KEY (`carried_from_item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE set null,
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
CREATE INDEX `items_user_id_idx` ON `items` (`user_id`);