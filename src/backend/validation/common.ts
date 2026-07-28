/**
 * Travel Tracker — Shared Zod Validation Primitives
 *
 * Reusable primitives imported by all route-specific schema files.
 * Apply .trim() to all strings to prevent whitespace-padded duplicates.
 * SEC-04: allowlist-based string enums, strict objects, cross-field refinements.
 */

import { z } from 'zod';

/** Non-empty trimmed string, max 75 chars (BUG-10, BRD TR-01) */
export const zName = z
  .string()
  .trim()
  .min(1, 'Name must not be empty')
  .max(75, 'Name must be 75 characters or fewer');

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
export const zItemStatus = z.enum(['consider', 'confirmed', 'completed', 'cancelled', 'next_time']);

/** Trip status enum */
export const zTripStatus = z.enum(['planning', 'active', 'review_pending', 'locked']);

/** Optional non-empty trimmed string (undefined is fine, empty string is not) */
export const zOptionalString = z.string().trim().min(1).optional();

/** Positive integer ID */
export const zId = z.coerce.number().int().positive();

/**
 * Optional map/directions URL (IT-10, ADL-45).
 * https:// only (narrower than the frontend sanitiseUrl()'s https:/file: default —
 * ADL-45 D5, file:// is not a legitimate "get directions" link). No host allowlist
 * (ADL-45 D4) — any well-formed https:// URL is accepted. Length capped at 2048
 * chars, Zod-only, no DB CHECK (ADL-45 D3, matches the zName precedent).
 */
export const zMapUrl = z
  .string()
  .trim()
  .url()
  .max(2048, 'Map URL must be 2048 characters or fewer')
  .refine((u) => u.startsWith('https://'), {
    message: 'Map URL must use https://',
  })
  .optional();
