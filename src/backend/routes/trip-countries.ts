/**
 * Travel Tracker — Trip Countries Sub-resource Router
 *
 * Handles adding and removing explicit country associations for a trip.
 * Mounted at /:tripId/countries in the trips router.
 *
 * POST   /:tripId/countries       — add one or more country codes (insert-or-ignore)
 * DELETE /:tripId/countries/:code — remove a single country association
 */

import { Router } from 'express';
import { z } from 'zod';
import { LockError, NotFoundError } from '../errors.js';
import { asyncHandler } from '../middleware/error-handler.js';
import { validateBody } from '../middleware/validate.js';
import { tripRepository } from '../repositories/trips.js';

const router = Router({ mergeParams: true });

const AddCountriesSchema = z.object({
  country_codes: z.array(z.string().length(2)).min(1),
});

router.post(
  '/',
  validateBody(AddCountriesSchema),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const tripId = parseInt(String(req.params.tripId), 10);
    const { country_codes } = req.body;
    const trip = await tripRepository.findByIdOrThrow(userId, tripId);
    if (trip.status === 'locked') throw new LockError();
    await tripRepository.addCountries(tripId, country_codes);
    const countriesList = await tripRepository.getCountries(tripId);
    res.json({ countries: countriesList });
  }),
);

router.delete(
  '/:code',
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const tripId = parseInt(String(req.params.tripId), 10);
    const code = String(req.params.code);
    const trip = await tripRepository.findByIdOrThrow(userId, tripId);
    if (trip.status === 'locked') throw new LockError();
    const removed = await tripRepository.removeCountry(tripId, code);
    if (!removed) throw new NotFoundError('Country association');
    res.status(204).end();
  }),
);

export default router;
