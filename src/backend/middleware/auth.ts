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
 *   2. Verify JWT signature + issuer against Clerk's JWKS endpoint (lazy-initialized)
 *   3. Verify azp claim against the origin allowlist (HC-02 — Clerk's audience equivalent)
 *   4. Resolve internal user via userRepository.findOrCreateByClerkId()
 *   5. Attach req.user = { id, clerkId, email } and call next()
 *   6. On any failure: respond 401 Unauthorized
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

/**
 * Returns the expected JWT issuer from the environment.
 * Throws a fatal error at startup if CLERK_ISSUER is not set (and BYPASS_AUTH is not active).
 */
function getIssuer(): string {
  const issuer = process.env.CLERK_ISSUER;
  if (!issuer) {
    throw new Error('[AUTH] CLERK_ISSUER is not set in environment. Check .env.local.');
  }
  return issuer;
}

/**
 * HC-02: Clerk session tokens carry no `aud` claim — the audience-equivalent is `azp`
 * (authorized party), set to the browser origin the token was issued to (verified against
 * a live token, 2026-07-16). The set of origins a session token may legitimately be
 * issued to is exactly the CORS allowlist, so ALLOWED_ORIGINS is reused here (same
 * parse + default as server.ts).
 *
 * Tokens with a missing azp are rejected too — every Clerk browser session token has one.
 * Revisit if a native (iOS) client is added; its tokens may carry a different azp shape.
 */
function getAuthorizedParties(): string[] {
  return (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173,http://localhost:3001')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
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
  // ADL-27: isOwner is derived from whether the bypass test user's clerkId matches
  // OWNER_CLERK_ID. This allows CI contract tests to run as owner by setting
  // OWNER_CLERK_ID=test_clerk_id in the environment.
  if (process.env.BYPASS_AUTH === 'true') {
    const bypassClerkId = 'test_clerk_id';
    req.user = {
      id: 'test-user-00000000-0000-0000-0000-000000000000',
      clerkId: bypassClerkId,
      email: 'test@example.com',
      isOwner: bypassClerkId === process.env.OWNER_CLERK_ID ? 1 : 0,
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
    const issuer = getIssuer();
    const { payload } = await jwtVerify(token, jwks, { issuer });

    // HC-02: azp must be one of our known origins (Clerk's audience equivalent).
    const azp = payload.azp;
    if (typeof azp !== 'string' || !getAuthorizedParties().includes(azp)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

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
