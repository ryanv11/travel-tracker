/**
 * Travel Tracker — Map Shading Validation Schemas
 */

import { z } from 'zod';
import { zHexColor } from './common.js';

/** Schema for PATCH /api/map/shading/config/:stateKey */
export const UpdateShadingConfigSchema = z
  .object({
    display_name: z.string().trim().min(1).optional(),
    color_hex: zHexColor.optional(),
  })
  .strict();
