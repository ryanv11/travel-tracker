/**
 * Travel Tracker — Trip Validation Schemas
 * SEC-04: All trip POST/PATCH bodies validated via Zod before DB access.
 */

import { z } from 'zod';
import { zIsoDate, zName, zOptionalString, zTripStatus } from './common.js';

const tripAssociations = {
  category_ids: z.array(z.number().int().positive()).optional(),
  companion_ids: z.array(z.number().int().positive()).optional(),
  activity_ids: z.array(z.number().int().positive()).optional(),
  country_codes: z.array(z.string().length(2)).optional(),
};

/** Schema for POST /api/trips */
export const CreateTripSchema = z
  .object({
    name: zName,
    start_date: zIsoDate,
    end_date: zIsoDate,
    photo_album_ref: zOptionalString,
    ...tripAssociations,
  })
  .strict()
  .refine((d) => d.end_date >= d.start_date, {
    message: 'end_date must be on or after start_date',
    path: ['end_date'],
  });

/** Schema for PATCH /api/trips/:id */
export const UpdateTripSchema = z
  .object({
    name: zName.optional(),
    start_date: zIsoDate.optional(),
    end_date: zIsoDate.optional(),
    photo_album_ref: zOptionalString,
    ...tripAssociations,
  })
  .strict()
  .refine(
    (d) => {
      if (d.start_date && d.end_date) return d.end_date >= d.start_date;
      return true;
    },
    { message: 'end_date must be on or after start_date', path: ['end_date'] },
  );

/** Schema for PATCH /api/trips/:id/status */
export const UpdateTripStatusSchema = z.object({ status: zTripStatus }).strict();

/** Schema for GET /api/trips query params */
export const ListTripsQuerySchema = z.object({
  status: zTripStatus.optional(),
  category_id: z.coerce.number().int().positive().optional(),
  activity_id: z.coerce.number().int().positive().optional(),
  country: z.string().length(2).optional(),
});

/**
 * Schema for DELETE /api/trips/:id path parameter.
 * id must be a positive integer; returns 400 if invalid.
 */
export const DeleteTripParamsSchema = z.object({
  id: z.coerce.number().int().positive('id must be a positive integer'),
});
