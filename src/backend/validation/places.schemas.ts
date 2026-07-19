/**
 * Travel Tracker — Place Validation Schemas
 */

import { z } from 'zod';

/**
 * BUG-28: cross-field date-order refinement — when both dates are present and
 * non-null, arrival must be on or before departure (same day allowed).
 * When only one date is in a PATCH body, the route handler re-validates against
 * the merged result (stored value + patch); see places.ts.
 */
const dateOrderCheck = (d: { arrived_on?: string | null; departed_on?: string | null }) =>
  d.arrived_on == null || d.departed_on == null || d.arrived_on <= d.departed_on;

const dateOrderMessage = {
  message: 'departed_on must be on or after arrived_on',
  path: ['departed_on'],
};

export const CreatePlaceSchema = z
  .object({
    city_id: z.number().int().positive(),
    arrived_on: z.string().nullable().optional(),
    departed_on: z.string().nullable().optional(),
  })
  .strict()
  .refine(dateOrderCheck, dateOrderMessage);

export const UpdatePlaceDatesSchema = z
  .object({
    arrived_on: z.string().nullable().optional(),
    departed_on: z.string().nullable().optional(),
  })
  .strict()
  .refine(dateOrderCheck, dateOrderMessage);

export const AddPlaceActivitySchema = z
  .object({ activity_id: z.number().int().positive() })
  .strict();
