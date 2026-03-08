/**
 * Travel Tracker — City Validation Schemas
 */

import { z } from 'zod';
import { zCountryCode } from './common.js';

export const CreateCitySchema = z
  .object({
    name: z.string().trim().min(1),
    country_code: zCountryCode,
    region_id: z.number().int().positive().nullable().optional(),
  })
  .strict();

export const SearchCitiesQuerySchema = z.object({
  q: z.string().trim().min(2, 'Search query must be at least 2 characters'),
  country_code: zCountryCode.optional(),
});

export const CityItemsQuerySchema = z.object({
  type: z
    .enum(['restaurant', 'hotel', 'flight', 'car_rental', 'experience', 'note'])
    .optional(),
  min_rating: z.coerce.number().int().min(1).max(5).optional(),
});

/** Schema for PATCH /api/cities/:id (C2) */
export const PatchCitySchema = z
  .object({
    region_id: z.number().int().positive().nullable().optional(),
  })
  .strict();
