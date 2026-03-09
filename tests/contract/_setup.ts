/**
 * Contract test helpers
 *
 * All contract tests connect to a running backend server.
 * Start the server before running: npm run dev:api
 *
 * BASE_URL can be overridden via environment variable:
 *   TEST_BASE_URL=http://localhost:3001 npm run test:contract
 */

import supertest from 'supertest';

export const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:3001';

/** Pre-configured supertest agent pointing at the live server */
export const api = supertest(BASE_URL);

/**
 * Asserts the server is reachable. Call in beforeAll.
 * Throws a descriptive error if the server is not running.
 */
export async function requireServer(): Promise<void> {
  try {
    const res = await api.get('/health').timeout(3000);
    if (res.status !== 200) {
      throw new Error(`Health check returned ${res.status}`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `\n\n  ❌  Backend server is not running at ${BASE_URL}\n` +
        `     Start it first:  npm run dev:api\n` +
        `     Then retry:      npm run test:contract\n` +
        `     Error: ${msg}\n`,
    );
  }
}

/**
 * Creates a minimal valid trip via POST /api/trips.
 * Returns the created trip object.
 */
export async function createTestTrip(overrides: Record<string, unknown> = {}) {
  const tag = `[TEST-${Date.now()}]`;
  const body = {
    name: `${tag} Contract Test Trip`,
    start_date: '2026-06-01',
    end_date: '2026-06-15',
    ...overrides,
  };
  const res = await api.post('/api/trips').send(body).expect(201);
  return res.body as {
    id: number;
    name: string;
    status: string;
    start_date: string;
    end_date: string;
    categories: unknown[];
    companions: unknown[];
    activities: unknown[];
  };
}

/**
 * Creates a minimal valid city via POST /api/cities.
 * Returns the created city object.
 */
export async function createTestCity(overrides: Record<string, unknown> = {}) {
  const tag = Date.now();
  const body = {
    name: `TestCity-${tag}`,
    country_code: 'AU',
    ...overrides,
  };
  const res = await api.post('/api/cities').send(body);
  if (res.status !== 201 && res.status !== 409) {
    throw new Error(`createTestCity failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body as { id: number; name: string; country_code: string };
}

/**
 * Transitions a trip to locked status via the status chain.
 * planning → review_pending → locked
 */
export async function lockTrip(tripId: number): Promise<void> {
  await api
    .patch(`/api/trips/${tripId}/status`)
    .send({ status: 'review_pending' })
    .expect(200);
  await api.patch(`/api/trips/${tripId}/lock`).expect(200);
}
