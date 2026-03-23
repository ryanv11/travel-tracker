/**
 * Travel Tracker — Place Validation Schemas
 */

import { z } from 'zod';

export const CreatePlaceSchema = z
  .object({
    city_id: z.number().int().positive(),
    arrived_on: z.string().nullable().optional(),
    departed_on: z.string().nullable().optional(),
  })
  .strict();

export const UpdatePlaceDatesSchema = z
  .object({
    arrived_on: z.string().nullable().optional(),
    departed_on: z.string().nullable().optional(),
  })
  .strict();

export const AddPlaceActivitySchema = z
  .object({ activity_id: z.number().int().positive() })
  .strict();
