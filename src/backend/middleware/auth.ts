/**
 * Travel Tracker — Authentication Middleware Stub
 *
 * SEC-09: Phase 1 passthrough — no authentication in local single-user mode.
 * Phase 2: Replace the body of this function with real auth logic
 * (OAuth 2.0 / OIDC token validation or session cookie verification).
 * No route files need to change — only this function.
 *
 * TODO (Phase 2): Implement authentication here.
 */

import type { Request, Response, NextFunction } from 'express';

/**
 * Authentication middleware.
 * Phase 1: passes all requests through unconditionally.
 * Phase 2: validates session/token and attaches user identity to req.
 */
export function authenticate(
  _req: Request,
  _res: Response,
  next: NextFunction,
): void {
  // TODO (Phase 2): Validate auth token / session cookie.
  // On success: attach user identity to req (e.g. req.user = { id, email }).
  // On failure: res.status(401).json({ error: 'Unauthorized' }) and return.
  next();
}
