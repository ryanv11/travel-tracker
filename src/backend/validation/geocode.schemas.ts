/**
 * Travel Tracker — Geocode Proxy Validation Schemas (ADL-46 D7 §5.1)
 */

import { z } from 'zod';
import { zCountryCode, zCountryCodesList } from './common.js';

export const GeocodeQuerySchema = z.object({
  q: z.string().trim().min(2, 'Search query must be at least 2 characters'),
  // Optional — when present, constrains the lookup to this country (D12 step 1).
  // Absent for the GE-15 country auto-populate discovery case.
  country_code: zCountryCode.optional(),
  // Optional ISO 3166-2 subdivision (e.g. 'US-CO') to prefer a region (D12 step 2).
  region_iso: z.string().trim().min(2).optional(),
  // GE-20 (ADL-54 D1) — the trip's declared country filter SET, distinct from
  // the single country_code above (the D12 create-time constraint). Precedence
  // when both are present (ADL-54 D1): the single country_code wins.
  country_codes: zCountryCodesList,
});
