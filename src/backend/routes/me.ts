/**
 * Travel Tracker — Me Router (BUG-26 / SE-02)
 *
 * GET /api/me — returns the authenticated user's identity, including the
 * isOwner flag, so the frontend can gate owner-only UI (Admin panel).
 *
 * Auth: requireAuth only (globally mounted on /api/ in server.ts).
 * Deliberately NOT requireOwner — every authenticated user may ask who they
 * are; the response is the caller's own identity, nothing else.
 *
 * No repository/DB queries here — req.user is already fully resolved by the
 * auth middleware (userRepository.findOrCreateByClerkId).
 */

import { Router } from 'express';

export const meRouter = Router();

// ----------------------------------------------------------------
// GET /api/me — identity of the authenticated caller
// ----------------------------------------------------------------
meRouter.get('/', (req, res) => {
  // req.user is guaranteed by the global requireAuth middleware.
  const { id, email, isOwner } = req.user!;
  res.json({ id, email, isOwner });
});
