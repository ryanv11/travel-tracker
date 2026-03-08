CREATE TABLE `activities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	CONSTRAINT "chk_activities_is_active" CHECK("activities"."is_active" IN (0, 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `activities_name_unique` ON `activities` (`name`);--> statement-breakpoint
CREATE TABLE `cities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`country_code` text NOT NULL,
	`region_id` integer,
	`name` text NOT NULL,
	`latitude` real,
	`longitude` real,
	`geocode_status` text DEFAULT 'pending' NOT NULL,
	`geocode_attempted_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	FOREIGN KEY (`country_code`) REFERENCES `countries`(`country_code`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`region_id`) REFERENCES `regions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "chk_cities_geocode_status" CHECK("cities"."geocode_status" IN ('pending', 'resolved'))
);
--> statement-breakpoint
CREATE INDEX `idx_cities_country` ON `cities` (`country_code`);--> statement-breakpoint
CREATE INDEX `idx_cities_region` ON `cities` (`region_id`);--> statement-breakpoint
CREATE INDEX `idx_cities_geocode` ON `cities` (`geocode_status`) WHERE "cities"."geocode_status" = 'pending';--> statement-breakpoint
CREATE TABLE `companions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	CONSTRAINT "chk_companions_is_active" CHECK("companions"."is_active" IN (0, 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `companions_name_unique` ON `companions` (`name`);--> statement-breakpoint
CREATE TABLE `countries` (
	`country_code` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`region_tier_enabled` integer DEFAULT 0 NOT NULL,
	`region_tier_label` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	CONSTRAINT "chk_countries_region_tier_enabled" CHECK("countries"."region_tier_enabled" IN (0, 1))
);
--> statement-breakpoint
CREATE TABLE `item_car_rentals` (
	`item_id` integer PRIMARY KEY NOT NULL,
	`provider` text,
	`pickup_location` text,
	`dropoff_location` text,
	`pickup_datetime` text,
	`dropoff_datetime` text,
	`booking_reference` text,
	`vehicle_class` text,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `item_experiences` (
	`item_id` integer PRIMARY KEY NOT NULL,
	`rating` integer,
	`post_visit_notes` text,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "chk_item_experiences_rating" CHECK("item_experiences"."rating" IS NULL OR ("item_experiences"."rating" BETWEEN 1 AND 5))
);
--> statement-breakpoint
CREATE INDEX `idx_item_experiences_rating` ON `item_experiences` (`rating`);--> statement-breakpoint
CREATE TABLE `item_flights` (
	`item_id` integer PRIMARY KEY NOT NULL,
	`airline` text,
	`flight_number` text,
	`departure_airport` text,
	`arrival_airport` text,
	`departure_datetime` text,
	`arrival_datetime` text,
	`booking_reference` text,
	`seat` text,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `item_hotels` (
	`item_id` integer PRIMARY KEY NOT NULL,
	`property_name` text,
	`address` text,
	`check_in_date` text,
	`check_out_date` text,
	`booking_reference` text,
	`confirmation_number` text,
	`rating` integer,
	`post_visit_notes` text,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "chk_item_hotels_rating" CHECK("item_hotels"."rating" IS NULL OR ("item_hotels"."rating" BETWEEN 1 AND 5))
);
--> statement-breakpoint
CREATE INDEX `idx_item_hotels_rating` ON `item_hotels` (`rating`);--> statement-breakpoint
CREATE TABLE `item_restaurants` (
	`item_id` integer PRIMARY KEY NOT NULL,
	`name` text,
	`neighbourhood_area` text,
	`cuisine_type` text,
	`source` text,
	`rating` integer,
	`post_visit_notes` text,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "chk_item_restaurants_rating" CHECK("item_restaurants"."rating" IS NULL OR ("item_restaurants"."rating" BETWEEN 1 AND 5))
);
--> statement-breakpoint
CREATE INDEX `idx_item_restaurants_rating` ON `item_restaurants` (`rating`);--> statement-breakpoint
CREATE TABLE `items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trip_id` integer NOT NULL,
	`trip_place_id` integer,
	`item_type` text NOT NULL,
	`status` text DEFAULT 'consider' NOT NULL,
	`notes` text,
	`is_carried_forward` integer DEFAULT 0 NOT NULL,
	`carried_from_item_id` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`trip_place_id`) REFERENCES `trip_places`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`carried_from_item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "chk_items_item_type" CHECK("items"."item_type" IN ('restaurant', 'hotel', 'flight', 'car_rental', 'experience', 'note')),
	CONSTRAINT "chk_items_status" CHECK("items"."status" IN ('consider', 'confirmed', 'completed', 'cancelled', 'next_time')),
	CONSTRAINT "chk_items_is_carried_forward" CHECK("items"."is_carried_forward" IN (0, 1))
);
--> statement-breakpoint
CREATE INDEX `idx_items_trip` ON `items` (`trip_id`);--> statement-breakpoint
CREATE INDEX `idx_items_trip_place` ON `items` (`trip_place_id`);--> statement-breakpoint
CREATE INDEX `idx_items_type` ON `items` (`item_type`);--> statement-breakpoint
CREATE INDEX `idx_items_status` ON `items` (`status`);--> statement-breakpoint
CREATE INDEX `idx_items_carried` ON `items` (`carried_from_item_id`) WHERE "items"."carried_from_item_id" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `map_shading_config` (
	`state_key` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`color_hex` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	CONSTRAINT "chk_map_shading_state_key" CHECK("map_shading_config"."state_key" IN ('active', 'planned', 'visited_once', 'visited_once_planning', 'visited_multiple', 'visited_multiple_planning'))
);
--> statement-breakpoint
CREATE TABLE `regions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`country_code` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	FOREIGN KEY (`country_code`) REFERENCES `countries`(`country_code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_regions_country` ON `regions` (`country_code`);--> statement-breakpoint
CREATE TABLE `trip_activities_map` (
	`trip_id` integer NOT NULL,
	`activity_id` integer NOT NULL,
	PRIMARY KEY(`trip_id`, `activity_id`),
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `trip_categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	CONSTRAINT "chk_trip_categories_is_active" CHECK("trip_categories"."is_active" IN (0, 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trip_categories_name_unique` ON `trip_categories` (`name`);--> statement-breakpoint
CREATE TABLE `trip_categories_map` (
	`trip_id` integer NOT NULL,
	`category_id` integer NOT NULL,
	PRIMARY KEY(`trip_id`, `category_id`),
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `trip_categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_tcm_category` ON `trip_categories_map` (`category_id`);--> statement-breakpoint
CREATE TABLE `trip_companions_map` (
	`trip_id` integer NOT NULL,
	`companion_id` integer NOT NULL,
	PRIMARY KEY(`trip_id`, `companion_id`),
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`companion_id`) REFERENCES `companions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_tcpm_companion` ON `trip_companions_map` (`companion_id`);--> statement-breakpoint
CREATE TABLE `trip_place_activities_map` (
	`trip_place_id` integer NOT NULL,
	`activity_id` integer NOT NULL,
	PRIMARY KEY(`trip_place_id`, `activity_id`),
	FOREIGN KEY (`trip_place_id`) REFERENCES `trip_places`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `trip_places` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trip_id` integer NOT NULL,
	`city_id` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`city_id`) REFERENCES `cities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_trip_places_trip_city` ON `trip_places` (`trip_id`,`city_id`);--> statement-breakpoint
CREATE INDEX `idx_trip_places_trip` ON `trip_places` (`trip_id`);--> statement-breakpoint
CREATE INDEX `idx_trip_places_city` ON `trip_places` (`city_id`);--> statement-breakpoint
CREATE TABLE `trips` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`status` text DEFAULT 'planning' NOT NULL,
	`photo_album_ref` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	CONSTRAINT "chk_trips_status" CHECK("trips"."status" IN ('planning', 'active', 'review_pending', 'locked'))
);
--> statement-breakpoint
CREATE INDEX `idx_trips_status` ON `trips` (`status`);--> statement-breakpoint
CREATE INDEX `idx_trips_start_date` ON `trips` (`start_date`);--> statement-breakpoint
CREATE INDEX `idx_trips_end_date` ON `trips` (`end_date`);