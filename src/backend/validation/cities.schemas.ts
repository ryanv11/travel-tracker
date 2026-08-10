/**
 * Travel Tracker — City Validation Schemas
 */

import { z } from 'zod';
import { zCountryCode, zCountryCodesList } from './common.js';

/** BUG-75 v3 §2.3/§B1 — the carried OSM identity pair. */
const zOsmType = z.enum(['node', 'way', 'relation']);

// BUG-75 v3 §2.3/§2.4/§B4 — an optional carried pick from the frontend
// CityPicker: {osm_type, osm_id, display_name, region_id}. The server NEVER
// trusts client coordinates (no lat/lng field exists here, and .strict()
// rejects one if sent — see §7 carry-over test) — it re-derives canonical
// data from its OWN create-time /lookup and uses the carried ref only to
// SELECT among its candidates. region_id travels over the existing field
// (D12 rule 3 already treats it as user ground truth); the frontend is what
// aligns it to the pick (F4) — no schema change needed for that half.
export const CreateCitySchema = z
  .object({
    name: z.string().trim().min(1),
    country_code: zCountryCode,
    region_id: z.number().int().positive().nullable().optional(),
    osm_type: zOsmType.optional(),
    osm_id: z.number().int().positive().optional(),
    display_name: z.string().trim().min(1).optional(),
  })
  .strict()
  .refine((data) => (data.osm_type == null) === (data.osm_id == null), {
    message: 'osm_type and osm_id must be supplied together or not at all',
    path: ['osm_type'],
  });

export const SearchCitiesQuerySchema = z.object({
  q: z.string().trim().min(2, 'Search query must be at least 2 characters'),
  country_code: zCountryCode.optional(),
  // GE-20 (ADL-54 D1) — the trip's declared country filter SET, distinct from
  // the single country_code above. Cities-path precedence contract (fresh-eyes
  // F4, never hit by any current caller — grep-verified): if BOTH are present,
  // the single explicit country_code wins (narrower, matches the geocode-path
  // precedence D1 already states) and country_codes is ignored entirely.
  country_codes: zCountryCodesList,
});

export const CityItemsQuerySchema = z.object({
  type: z.enum(['restaurant', 'hotel', 'flight', 'car_rental', 'experience', 'note']).optional(),
  min_rating: z.coerce.number().int().min(1).max(5).optional(),
  sort_by: z.literal('rating').optional(),
  sort_order: z.enum(['asc', 'desc']).optional(),
});

/** Schema for PATCH /api/cities/:id (C2) */
export const PatchCitySchema = z
  .object({
    region_id: z.number().int().positive().nullable().optional(),
  })
  .strict();
