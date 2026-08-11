/**
 * Travel Tracker — Geocode Queue Router (GE-19 / ADL-55 D3 §5, BUG-85)
 *
 * GET /api/geocode-queue — the derived, userId-scoped set of the requesting
 * user's OWN cities that are not yet resolved (pending / needs_attention /
 * unresolvable). The frontend polls this to render the geocode-status indicator
 * grouped into in-progress vs needs-attention buckets (ADL-55 §4), replacing the
 * NR-06 localStorage retry queue as the source of truth (OQ-4). The response is a
 * JSON array of city objects, each carrying id, name, country_code, region_id,
 * region_name, region_iso, geocode_status and geocode_cause (snake_case, matching
 * the GET /api/cities search shape); the client derives the two buckets and the
 * (status, cause) → label copy itself (ADL-55 §4 — labels live frontend-side).
 *
 * SECURITY (OP-06, ADL-55 §5.1 / criterion 4): the queue is DERIVED from the
 * user's own trips, never a stored per-user list. Ownership is STRUCTURAL — the
 * repository query (citiesRepository.findUserGeocodeQueue) reaches cities only
 * through the user's own trip_places -> trips and composes the QUAL-43 scoping
 * chokepoint (scopeToUser), exactly like findCarryForwardItems. A city referenced
 * solely by another user's trips cannot appear, and there is no hand-authored
 * ownership predicate to forget. `cities` is global reference data (no user_id
 * column); its ownership axis is the trips join.
 *
 * requireAuth (applied globally via app.use('/api/', requireAuth) in server.ts /
 * server-test-app.ts) is the gate; req.user.id is the ownership axis passed to the
 * repository. No userId scoping is hand-rolled here — the chokepoint owns it.
 */

import { Router } from 'express';
import { asyncHandler } from '../middleware/error-handler.js';
import { citiesRepository } from '../repositories/cities.js';

export const geocodeQueueRouter = Router();

// ----------------------------------------------------------------
// GET /api/geocode-queue
// ----------------------------------------------------------------
// nosemgrep: travel-tracker.express-route-no-auth -- reason: requireAuth applied globally via app.use('/api/', requireAuth) in server.ts
geocodeQueueRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const queue = await citiesRepository.findUserGeocodeQueue(userId);
    res.json(queue);
  }),
);
