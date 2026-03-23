/**
 * Travel Tracker — requireOwner Middleware (ADL-27)
 *
 * HC-04 / HC-05 / HC-06: Guards admin routes, map shading config, and city creation.
 *
 * Must be applied after requireAuth (req.user must already be set).
 * Returns 403 Forbidden if req.user.isOwner !== 1.
 */

import type { NextFunction, Request, Response } from 'express';

/**
 * Owner-only guard.
 * Allows requests only when req.user.isOwner === 1.
 * Returns 403 Forbidden for all other authenticated users.
 *
 * Apply at the adminRouter level (router.use) to protect all routes on that
 * router automatically, or per-handler for individual routes outside adminRouter.
 */
export function requireOwner(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || req.user.isOwner !== 1) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  next();
}
