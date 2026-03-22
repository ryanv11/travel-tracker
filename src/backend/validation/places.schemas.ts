/**
 * Travel Tracker — Place Validation Schemas
 */

import { z } from 'zod';

export const CreatePlaceSchema = z.object({ city_id: z.number().int().positive() }).strict();

export const AddPlaceActivitySchema = z
  .object({ activity_id: z.number().int().positive() })
  .strict();
