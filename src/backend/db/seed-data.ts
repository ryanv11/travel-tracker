/**
 * Travel Tracker — Shared Seed Data Constants
 *
 * Exported from this module so both:
 *   - src/backend/db/seed.ts (the CLI db:seed script)
 *   - src/backend/services/startup.service.ts (auto-seed on startup)
 * can use the same data without duplication.
 *
 * Source: _project/seed-data.txt
 */

/** Default trip categories (11 rows) */
export const TRIP_CATEGORIES = [
  { name: 'Ski Trip' },
  { name: 'Honeymoon' },
  { name: 'Summer Holiday' },
  { name: 'City Break' },
  { name: 'Road Trip' },
  { name: 'Business' },
  { name: 'Family' },
  { name: 'Adventure' },
  { name: 'Beach Holiday' },
  { name: 'Cultural' },
  { name: 'Other' },
] as const;

/** Default activities (17 rows) */
export const ACTIVITIES = [
  { name: 'Skiing' },
  { name: 'Snowboarding' },
  { name: 'Dining' },
  { name: 'Hiking' },
  { name: 'Beach Day' },
  { name: 'Cooking Class' },
  { name: 'Wine Tasting' },
  { name: 'Sightseeing' },
  { name: 'Museum' },
  { name: 'Cycling' },
  { name: 'Sailing' },
  { name: 'Surfing' },
  { name: 'Snorkelling / Diving' },
  { name: 'Shopping' },
  { name: 'Live Music / Events' },
  { name: 'Spa / Wellness' },
  { name: 'Other' },
] as const;

/** Default companions (7 rows) */
export const COMPANIONS = [
  { name: 'Solo' },
  { name: 'Partner' },
  { name: 'Partner + Friends' },
  { name: 'Family' },
  { name: 'Friends' },
  { name: 'Work / Conference' },
  { name: 'Other' },
] as const;

/**
 * Default map shading configuration (6 rows).
 * 'never_visited' is intentionally absent — no shading (MP-05).
 */
export const MAP_SHADING_CONFIG = [
  { stateKey: 'active', displayName: 'Active', colorHex: '#2196F3' },
  { stateKey: 'planned', displayName: 'Planned', colorHex: '#CE93D8' },
  { stateKey: 'visited_once', displayName: 'Visited once', colorHex: '#A5D6A7' },
  {
    stateKey: 'visited_once_planning',
    displayName: 'Visited once + planning',
    colorHex: '#66BB6A',
  },
  {
    stateKey: 'visited_multiple',
    displayName: 'Visited multiple times',
    colorHex: '#2E7D32',
  },
  {
    stateKey: 'visited_multiple_planning',
    displayName: 'Visited multiple times + planning',
    colorHex: '#F9A825',
  },
] as const;
