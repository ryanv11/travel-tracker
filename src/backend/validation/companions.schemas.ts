/**
 * Travel Tracker — Companions Validation Schemas
 *
 * ADL-28 (AD-08): companions are per-user, not an admin resource — this
 * schema file is deliberately separate from validation/admin.schemas.ts
 * even though the shapes are currently identical (name / is_active).
 */

import { z } from 'zod';
import { zName } from './common.js';

/** Schema for POST /api/companions */
export const CreateCompanionSchema = z.object({ name: zName }).strict();

/** Schema for PATCH /api/companions/:id */
export const UpdateCompanionSchema = z
  .object({
    name: zName.optional(),
    is_active: z.boolean().optional(),
  })
  .strict();
