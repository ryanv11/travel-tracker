/**
 * GET /health — route-level tests (QUAL-26).
 *
 * /health is the app's only intentionally UNAUTHENTICATED endpoint (OP-06 §1.2 exempts it
 * from the access matrix as a liveness probe). QUAL-26 widened its payload from `{status}`
 * to `{status, commit, commitFull, builtAt}`, so these tests pin two things that matter more
 * than the happy path:
 *
 *   1. `status: 'ok'` is unchanged — Railway's healthcheck and the shakedown's existing
 *      assertion both depend on it and must not have been broken by the addition.
 *   2. The response carries build identity AND NOTHING ELSE. On a public endpoint the risk
 *      is not that a field is missing, it is that a future edit quietly adds an env value,
 *      a filesystem path or a dependency version. The exact-key-set assertion below fails
 *      if that ever happens.
 */

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import app from '../../server-test-app.js';
import { resetBuildInfoCacheForTests } from '../../services/build-info.js';

const SHA = 'b93bf9b510a2abe375450c763d17cee5e14d1d96';

let savedSha: string | undefined;

beforeEach(() => {
  savedSha = process.env.RAILWAY_GIT_COMMIT_SHA;
  resetBuildInfoCacheForTests();
});

afterEach(() => {
  if (savedSha === undefined) delete process.env.RAILWAY_GIT_COMMIT_SHA;
  else process.env.RAILWAY_GIT_COMMIT_SHA = savedSha;
  resetBuildInfoCacheForTests();
});

describe('GET /health', () => {
  it('answers 200 without authentication and reports the build identity', async () => {
    process.env.RAILWAY_GIT_COMMIT_SHA = SHA;
    resetBuildInfoCacheForTests();

    const res = await request(app).get('/health'); // deliberately no Authorization header

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.commit).toBe(SHA.slice(0, 7));
    expect(res.body.commitFull).toBe(SHA);
  });

  it('exposes build identity and nothing else', async () => {
    process.env.RAILWAY_GIT_COMMIT_SHA = SHA;
    resetBuildInfoCacheForTests();

    const res = await request(app).get('/health');

    expect(Object.keys(res.body).sort()).toEqual(['builtAt', 'commit', 'commitFull', 'status']);
  });

  it('degrades to an honest "unknown" when no build SHA is available', async () => {
    // The local-dev / no-marker path: still 200, still `status: 'ok'`, never a crash and
    // never a stale hardcoded commit.
    delete process.env.RAILWAY_GIT_COMMIT_SHA;
    delete process.env.BUILD_COMMIT_SHA;
    resetBuildInfoCacheForTests();

    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    // Either the honest fallback, or a real short SHA if a build artefact happens to be
    // present in this checkout — never an empty string, and never a non-SHA-shaped value.
    expect(res.body.commit).toMatch(/^(unknown|[0-9a-f]{7})$/);
  });
});
