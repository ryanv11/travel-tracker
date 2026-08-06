-- BUG-75 / GE-16 (v3.19): city-identity carry channel — EXPAND stage (ADL-47 stage 1).
--
-- drizzle-generated, unmodified (m-2: only the SWITCH stage's partial/COALESCE indexes and
-- CHECK constraint need hand-editing — drizzle-kit emits plain nullable ADD COLUMN correctly).
--
-- Adds three nullable columns to `cities`: osm_type, osm_id, display_name — the carried OSM
-- (osm_type, osm_id) identity reference (design v3 §0/§2.3: identity is carried, not derived;
-- display_name is render payload only, never a match key). No code populates them yet; no
-- existing row is touched; no index or CHECK change. Old code runs unchanged against the new
-- nullable columns. Independently green and deployable alone (ADL-47).
--
-- Backward-compatible: three ADD COLUMNs need no table recreation (nothing here touches a
-- CHECK constraint or an index), unlike 0015's CHECK-driven recreation.
--
-- Coexistence does NOT turn on in this migration — that is migration 0017 (SWITCH), which
-- drops the global uniq_cities_name_country_region_ci index and lands the code switch in the
-- same atomic stage (design v3 §B2/F2). db:push is FORBIDDEN (ADL-15).
ALTER TABLE `cities` ADD `osm_type` text;--> statement-breakpoint
ALTER TABLE `cities` ADD `osm_id` integer;--> statement-breakpoint
ALTER TABLE `cities` ADD `display_name` text;
