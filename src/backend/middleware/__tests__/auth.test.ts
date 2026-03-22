/**
 * Unit tests for requireAuth middleware (NR-14).
 *
 * Tests cover:
 *   1. Missing Authorization header → 401
 *   2. Non-Bearer Authorization header → 401
 *   3. Invalid/malformed token → 401
 *   4. Valid token → calls userRepository, attaches req.user, calls next()
 *
 * jose's jwtVerify and userRepository are mocked so no network calls
 * or database access occur in these tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// ----------------------------------------------------------------
// Set required env vars before module import
// ----------------------------------------------------------------

// CLERK_JWKS_URI must be set before auth.ts is imported (lazy init reads it on first request)
process.env.CLERK_JWKS_URI = 'https://test.clerk.accounts.dev/.well-known/jwks.json';

// ----------------------------------------------------------------
// Mock jose — must be declared before importing auth middleware
// ----------------------------------------------------------------

vi.mock('jose', () => ({
  createRemoteJWKSet: vi.fn(() => ({})),
  jwtVerify: vi.fn(),
}));

// ----------------------------------------------------------------
// Mock userRepository
// ----------------------------------------------------------------

vi.mock('../../repositories/users.js', () => ({
  userRepository: {
    findOrCreateByClerkId: vi.fn(),
  },
}));

// Import after mocks
const { requireAuth } = await import('../auth.js');
const { jwtVerify } = await import('jose');
const { userRepository } = await import('../../repositories/users.js');

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

function makeReq(authHeader?: string): Request {
  return {
    headers: authHeader ? { authorization: authHeader } : {},
  } as unknown as Request;
}

function makeRes(): { res: Response; statusCode: number | null; body: unknown } {
  const ctx = { statusCode: null as number | null, body: null as unknown };
  const res = {
    status: vi.fn((code: number) => {
      ctx.statusCode = code;
      return res;
    }),
    json: vi.fn((data: unknown) => {
      ctx.body = data;
      return res;
    }),
  } as unknown as Response;
  return { res, statusCode: ctx.statusCode, body: ctx.body };
}

// ----------------------------------------------------------------
// Tests
// ----------------------------------------------------------------

describe('requireAuth middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when Authorization header is missing', async () => {
    const req = makeReq();
    const { res } = makeRes();
    const next = vi.fn();

    await requireAuth(req, res, next as unknown as NextFunction);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 401 when Authorization header does not start with Bearer', async () => {
    const req = makeReq('Basic abc123');
    const { res } = makeRes();
    const next = vi.fn();

    await requireAuth(req, res, next as unknown as NextFunction);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 401 when jwtVerify throws (invalid/expired token)', async () => {
    vi.mocked(jwtVerify).mockRejectedValueOnce(new Error('JWT invalid'));

    const req = makeReq('Bearer bad.token.here');
    const { res } = makeRes();
    const next = vi.fn();

    await requireAuth(req, res, next as unknown as NextFunction);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('attaches req.user and calls next() on a valid token', async () => {
    vi.mocked(jwtVerify).mockResolvedValueOnce({
      payload: { sub: 'user_clerk123', email: 'test@example.com' },
      protectedHeader: { alg: 'RS256' },
    } as unknown as Awaited<ReturnType<typeof jwtVerify>>);

    vi.mocked(userRepository.findOrCreateByClerkId).mockResolvedValueOnce({
      id: 'internal-uuid-456',
      clerkId: 'user_clerk123',
      email: 'test@example.com',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const req = makeReq('Bearer valid.jwt.token');
    const { res } = makeRes();
    const next = vi.fn();

    await requireAuth(req, res, next as unknown as NextFunction);

    expect(userRepository.findOrCreateByClerkId).toHaveBeenCalledWith(
      'user_clerk123',
      'test@example.com',
    );
    expect((req as Request & { user?: unknown }).user).toEqual({
      id: 'internal-uuid-456',
      clerkId: 'user_clerk123',
      email: 'test@example.com',
    });
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 401 when userRepository throws', async () => {
    vi.mocked(jwtVerify).mockResolvedValueOnce({
      payload: { sub: 'user_clerk123', email: 'test@example.com' },
      protectedHeader: { alg: 'RS256' },
    } as unknown as Awaited<ReturnType<typeof jwtVerify>>);

    vi.mocked(userRepository.findOrCreateByClerkId).mockRejectedValueOnce(
      new Error('DB error'),
    );

    const req = makeReq('Bearer valid.jwt.token');
    const { res } = makeRes();
    const next = vi.fn();

    await requireAuth(req, res, next as unknown as NextFunction);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
