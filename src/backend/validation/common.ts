/**
 * Travel Tracker — Shared Zod Validation Primitives
 *
 * Reusable primitives imported by all route-specific schema files.
 * Apply .trim() to all strings to prevent whitespace-padded duplicates.
 * SEC-04: allowlist-based string enums, strict objects, cross-field refinements.
 */

import { z } from 'zod';

/** Non-empty trimmed string */
export const zName = z.string().trim().min(1, 'Name must not be empty').max(200);

/** ISO 8601 date string YYYY-MM-DD */
export const zIsoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');

/** Validated #RRGGBB hex colour */
export const zHexColor = z
  .string()
  .trim()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a valid 6-digit hex (#RRGGBB)');

/** Rating 1–5 */
export const zRating = z.number().int().min(1).max(5);

/** ISO 3166-1 alpha-2 country code */
export const zCountryCode = z.string().trim().length(2).toUpperCase();

/** Item type enum */
export const zItemType = z.enum([
  'restaurant',
  'hotel',
  'flight',
  'car_rental',
  'experience',
  'note',
]);

/** Item status enum */
export const zItemStatus = z.enum([
  'consider',
  'confirmed',
  'completed',
  'cancelled',
  'next_time',
]);

/** Trip status enum */
export const zTripStatus = z.enum([
  'planning',
  'active',
  'review_pending',
  'locked',
]);

/** Optional non-empty trimmed string (undefined is fine, empty string is not) */
export const zOptionalString = z.string().trim().min(1).optional();

/** Positive integer ID */
export const zId = z.coerce.number().int().positive();
