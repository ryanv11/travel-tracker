ALTER TABLE `items` ADD `user_id` text REFERENCES users(id);--> statement-breakpoint
CREATE INDEX `items_user_id_idx` ON `items` (`user_id`);--> statement-breakpoint
ALTER TABLE `trip_places` ADD `user_id` text REFERENCES users(id);--> statement-breakpoint
CREATE INDEX `trip_places_user_id_idx` ON `trip_places` (`user_id`);--> statement-breakpoint
ALTER TABLE `trips` ADD `user_id` text REFERENCES users(id);--> statement-breakpoint
CREATE INDEX `trips_user_id_idx` ON `trips` (`user_id`);