# HC-07c Completion Report — NOT NULL constraint on user_id columns

**Date:** 2026-03-23
**Branch:** `fix/hc07c-userid-not-null`
**PR:** #86
**Issue:** #85
**Tracker:** NR-14 / OP-06 HC-07c

---

## Summary

Applied NOT NULL constraints to `trips.user_id`, `trip_places.user_id`, and `items.user_id` at the DB level. Pre-condition (HC-07b, PR #81) confirmed: 0 null records in dev.db before migration.

---

## Schema changes

`src/backend/db/schema.ts` — three columns updated:

- `trips.userId`: `.references(() => users.id)` → `.notNull().references(() => users.id)`
- `trip_places.userId`: `.references(() => users.id)` → `.notNull().references(() => users.id)`
- `items.userId`: `.references(() => users.id)` → `.notNull().references(() => users.id)`

---

## Generated migration SQL (0007_secret_quasimodo.sql — full text)

```sql
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
```

Migration review: Table recreation pattern as expected for SQLite NOT NULL changes. All CHECK constraints intact (no truncation from drizzle-kit bug 2). Partial index on `items.carried_from_item_id` correctly preserved. No unexpected table recreations beyond the three target tables.

---

## Journal fix

`_journal.json` was updated automatically by `db:generate`. However, the generated `when` timestamp for 0007 (`1774318085762`) was earlier than the effective timestamp of 0006 in dev.db (`1774394520000`), which caused drizzle-kit to skip migration 0007 silently.

Fix applied: manually set `when` for entry idx 7 to `1774404520000` (after the 0006 journal timestamp).

Additionally, dev.db had a known timestamp mismatch for migration 0006 (the HC-07b migration was applied with timestamp `1774305415501` but the journal entry says `1774394520000`). A journal-aligned row was inserted into `__drizzle_migrations` with `created_at = 1774394520000` to allow drizzle-kit to correctly detect 0006 as applied.

---

## db:migrate output

```
[✓] migrations applied successfully!
```

Post-migration verification:
```
trips.user_id: notnull=1
trip_places.user_id: notnull=1
items.user_id: notnull=1
```

---

## Additional changes

- `src/backend/services/items.service.ts`: `CarryForwardParams.userId` changed from optional (`userId?: string`) to required (`userId: string`). Removed `?? null` fallback. This is correct — the carry-forward route always passes an authenticated userId.
- 7 test files: Added `userId` to `tripPlaces` and `items` insert fixtures that were missing it (previously silently allowed by the nullable schema).

---

## Test results

```
npm run check          — 116 files checked, no errors
npm run type:check:all — no errors
npm run test:backend   — 376/376 passed (17 test files)
npm run test:frontend  — 78/78 passed (5 test files)
```

---

## PR and CI

- PR: https://github.com/ryanv11/travel-tracker/pull/86
- CI: all jobs green (CI + Security Checks)
