/**
 * Contract tests — /api/me (BUG-26 / SE-02)
 *
 * Verifies the identity endpoint honours its contract against a running backend.
 * Requires a running backend: npm run dev:api
 *
 * Environment assumption (same as the other contract suites — see ci.yml):
 * the server runs with BYPASS_AUTH=true and OWNER_CLERK_ID=test_clerk_id, so the
 * bypass test user (clerkId 'test_clerk_id') resolves as owner and /api/me
 * returns isOwner: 1. Unauthenticated 401 coverage lives in the backend unit
 * suite (security.access-matrix.test.ts Part A) — under BYPASS_AUTH every
 * request is authenticated, so it cannot be exercised here.
 *
 * Coverage:
 *   GET /api/me — 200, exact shape { id, email, isOwner }
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { api, requireServer } from './_setup.js';

// ─── Server check ─────────────────────────────────────────────────────────────

beforeAll(async () => {
  await requireServer();
});

// ─── GET /api/me ──────────────────────────────────────────────────────────────

describe('GET /api/me', () => {
  it('200 — returns the authenticated caller identity', async () => {
    const res = await api.get('/api/me').expect(200);

    expect(res.body).toMatchObject({
      id: 'test-user-00000000-0000-0000-0000-000000000000',
      email: 'test@example.com',
      isOwner: 1, // OWNER_CLERK_ID=test_clerk_id in the test environment
    });
  });

  it('200 — response contains exactly id, email, isOwner (no clerkId leak)', async () => {
    const res = await api.get('/api/me').expect(200);
    expect(Object.keys(res.body).sort()).toEqual(['email', 'id', 'isOwner']);
  });
});
