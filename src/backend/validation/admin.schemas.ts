/**
 * Travel Tracker — Admin Validation Schemas
 */

import { z } from 'zod';
import { zName } from './common.js';

/** Schema for POST admin list items (categories, activities, companions) */
export const CreateAdminItemSchema = z.object({ name: zName }).strict();

/** Schema for PATCH admin list items */
export const UpdateAdminItemSchema = z
  .object({
    name: zName.optional(),
    is_active: z.boolean().optional(),
  })
  .strict();

/** Schema for PATCH /api/admin/countries/:countryCode */
export const UpdateCountrySchema = z
  .object({
    region_tier_enabled: z.boolean().optional(),
    region_tier_label: z.string().trim().min(1).optional(),
  })
  .strict();

/** Schema for POST /api/admin/countries/:countryCode/regions */
export const CreateRegionSchema = z.object({ name: zName }).strict();

/** Schema for PATCH /api/admin/countries/:countryCode/regions/:regionId */
export const UpdateRegionSchema = z.object({ name: zName }).strict();
