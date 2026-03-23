/**
 * Travel Tracker — Authentication Middleware
 *
 * NR-14 / ADL-20: Clerk JWT verification via jose.
 *
 * Hard rule (ADL-20 seam): This file MUST NOT import any @clerk/* package.
 * Authentication is done exclusively via jose + Clerk's JWKS endpoint.
 * The backend is auth-provider-agnostic at the code level.
 *
 * Flow:
 *   1. Extract Bearer token from Authorization header
 *   2. Verify JWT signature against Clerk's JWKS endpoint (lazy-initialized)
 *   3. Resolve internal user via userRepository.findOrCreateByClerkId()
 *   4. Attach req.user = { id, clerkId, email } and call next()
 *   5. On any failure: respond 401 Unauthorized
 */

import type { NextFunction, Request, Response } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { userRepository } from '../repositories/users.js';

// ----------------------------------------------------------------
// Express request augmentation
// ----------------------------------------------------------------

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: {
        id: string;
        clerkId: string;
        email: string;
        // ADL-27: 1 = owner, 0 = non-owner. Set from the DB row returned by findOrCreateByClerkId.
        isOwner: number;
      };
    }
  }
}

// ----------------------------------------------------------------
// JWKS setup — lazy-initialized on first request
// jose caches the JWKS internally after first fetch.
// ----------------------------------------------------------------

let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJWKS(): ReturnType<typeof createRemoteJWKSet> {
  if (_jwks) return _jwks;
  const uri = process.env.CLERK_JWKS_URI;
  if (!uri) {
    throw new Error('[AUTH] CLERK_JWKS_URI is not set in environment. Check .env.local.');
  }
  _jwks = createRemoteJWKSet(new URL(uri));
  return _jwks;
}

// ----------------------------------------------------------------
// Middleware
// ----------------------------------------------------------------

/**
 * Authentication middleware.
 * Verifies the Clerk JWT and attaches the resolved internal user to req.user.
 * Returns 401 if the token is missing, invalid, or expired.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  // CI escape hatch: skip JWT verification in contract tests.
  // Only active when BYPASS_AUTH is explicitly set to 'true'.
  // ADL-27: isOwner = 0 for the bypass test user by default.
  // Contract tests that need owner access must seed is_owner = 1 directly in the test DB.
  if (process.env.BYPASS_AUTH === 'true') {
    req.user = {
      id: 'test-user-00000000-0000-0000-0000-000000000000',
      clerkId: 'test_clerk_id',
      email: 'test@example.com',
      isOwner: 0,
    };
    return next();
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;

  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const jwks = getJWKS();
    const { payload } = await jwtVerify(token, jwks);
    const clerkId = payload.sub!;
    const email = (payload.email as string | undefined) ?? '';

    const user = await userRepository.findOrCreateByClerkId(clerkId, email);

    req.user = {
      id: user.id,
      clerkId: user.clerkId,
      email: user.email,
      isOwner: user.isOwner,
    };

    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}
