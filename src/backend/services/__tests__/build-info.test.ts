/**
 * Unit tests for src/backend/services/build-info.ts — QUAL-26.
 *
 * The whole value of a build marker is that it is TRUSTWORTHY: a marker that reports a
 * plausible-looking wrong SHA is worse than one that reports nothing, because it answers
 * "is my fix deployed?" confidently and incorrectly. So these tests care disproportionately
 * about the degradation paths — absent sources, malformed values, and the timestamp/commit
 * pairing — not just the happy path.
 *
 * `resolveBuildInfo()` is exercised directly rather than the memoised `getBuildInfo()`, so
 * each case gets a clean resolution against its own environment.
 */

import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildHealthPayload,
  getBuildInfo,
  resetBuildInfoCacheForTests,
  resolveBuildInfo,
  UNKNOWN_COMMIT,
} from '../build-info.js';

const SHA_A = 'b93bf9b510a2abe375450c763d17cee5e14d1d96';
const SHA_B = 'a1b28af5f9eb77b811ba9deb00257b5ba9942015';

/** Env keys this module reads — saved and restored around every test. */
const ENV_KEYS = ['BUILD_COMMIT_SHA', 'RAILWAY_GIT_COMMIT_SHA'] as const;
const savedEnv: Record<string, string | undefined> = {};

/**
 * Makes the baked build-info file appear to hold `payload`, or to be absent when null.
 *
 * Stubs `fs.readFileSync` rather than writing a real file: the real path is a build
 * artefact that must not exist in a test run, and creating one would leak into every
 * subsequent test in the process.
 *
 * @param payload - The JSON the baked file should appear to contain, or null for "absent".
 */
function stubBakedFile(payload: unknown | null): void {
  vi.spyOn(fs, 'readFileSync').mockImplementation(((path: unknown, ...rest: unknown[]) => {
    if (typeof path === 'string' && path.endsWith('build-info.json')) {
      if (payload === null) throw new Error('ENOENT: no such file or directory');
      return typeof payload === 'string' ? payload : JSON.stringify(payload);
    }
    // Anything else keeps the real behaviour.
    return (fs.readFileSync as unknown as (...a: unknown[]) => unknown)(path, ...rest);
  }) as unknown as typeof fs.readFileSync);
}

beforeEach(() => {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  resetBuildInfoCacheForTests();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  vi.restoreAllMocks();
  resetBuildInfoCacheForTests();
});

describe('resolveBuildInfo — source precedence', () => {
  it('prefers BUILD_COMMIT_SHA over every other source', () => {
    process.env.BUILD_COMMIT_SHA = SHA_A;
    process.env.RAILWAY_GIT_COMMIT_SHA = SHA_B;
    stubBakedFile({ commit: SHA_B, builtAt: '2026-08-04T00:00:00.000Z' });

    const info = resolveBuildInfo();
    expect(info.source).toBe('env-override');
    expect(info.commitFull).toBe(SHA_A);
    expect(info.commit).toBe(SHA_A.slice(0, 7));
  });

  it("uses Railway's injected SHA when no operator override is set", () => {
    process.env.RAILWAY_GIT_COMMIT_SHA = SHA_A;
    stubBakedFile(null);

    const info = resolveBuildInfo();
    expect(info.source).toBe('railway');
    expect(info.commitFull).toBe(SHA_A);
  });

  it('falls back to the build-time baked file when no environment variable is set', () => {
    stubBakedFile({ commit: SHA_A, builtAt: '2026-08-04T12:00:00.000Z' });

    const info = resolveBuildInfo();
    expect(info.source).toBe('baked');
    expect(info.commitFull).toBe(SHA_A);
    expect(info.builtAt).toBe('2026-08-04T12:00:00.000Z');
  });
});

describe('resolveBuildInfo — degradation', () => {
  it('reports "unknown" rather than crashing when no source resolves a SHA', () => {
    stubBakedFile(null);

    const info = resolveBuildInfo();
    expect(info).toMatchObject({
      commit: UNKNOWN_COMMIT,
      commitFull: null,
      builtAt: null,
      source: 'none',
    });
  });

  it('ignores a malformed SHA instead of echoing it back as a build marker', () => {
    // An operator typo, a platform placeholder, or a truncated value. All must degrade to
    // "unknown" — a marker that looks like a commit but is not is the worst outcome here.
    process.env.RAILWAY_GIT_COMMIT_SHA = 'not-a-sha';
    stubBakedFile(null);

    expect(resolveBuildInfo()).toMatchObject({ commit: UNKNOWN_COMMIT, source: 'none' });
  });

  it('ignores a short SHA — only a full 40-char hex value is accepted', () => {
    process.env.RAILWAY_GIT_COMMIT_SHA = SHA_A.slice(0, 7);
    stubBakedFile(null);

    expect(resolveBuildInfo().source).toBe('none');
  });

  it('survives a baked file containing invalid JSON', () => {
    stubBakedFile('{ this is not json');

    expect(resolveBuildInfo()).toMatchObject({ commit: UNKNOWN_COMMIT, source: 'none' });
  });

  it('trims and lowercases a padded uppercase SHA', () => {
    process.env.RAILWAY_GIT_COMMIT_SHA = `  ${SHA_A.toUpperCase()}\n`;
    stubBakedFile(null);

    expect(resolveBuildInfo().commitFull).toBe(SHA_A);
  });
});

describe('resolveBuildInfo — builtAt pairing', () => {
  it('carries the baked timestamp when the baked commit agrees with the resolved SHA', () => {
    process.env.RAILWAY_GIT_COMMIT_SHA = SHA_A;
    stubBakedFile({ commit: SHA_A, builtAt: '2026-08-04T09:00:00.000Z' });

    expect(resolveBuildInfo().builtAt).toBe('2026-08-04T09:00:00.000Z');
  });

  it('drops the baked timestamp when it belongs to a DIFFERENT build', () => {
    // Otherwise /health would pair commit A with the build time of commit B — a quietly
    // wrong answer to the one question this endpoint exists to answer.
    process.env.RAILWAY_GIT_COMMIT_SHA = SHA_A;
    stubBakedFile({ commit: SHA_B, builtAt: '2026-08-04T09:00:00.000Z' });

    const info = resolveBuildInfo();
    expect(info.commitFull).toBe(SHA_A);
    expect(info.builtAt).toBeNull();
  });
});

describe('getBuildInfo — memoisation', () => {
  it('resolves once per process and reuses the result', () => {
    process.env.RAILWAY_GIT_COMMIT_SHA = SHA_A;
    stubBakedFile(null);

    const first = getBuildInfo();
    process.env.RAILWAY_GIT_COMMIT_SHA = SHA_B;
    const second = getBuildInfo();

    // The build cannot change under a live process, so the cached value must win.
    expect(second).toBe(first);
    expect(second.commitFull).toBe(SHA_A);
  });
});

describe('buildHealthPayload', () => {
  it('keeps status:"ok" and exposes only build identity alongside it', () => {
    process.env.RAILWAY_GIT_COMMIT_SHA = SHA_A;
    stubBakedFile({ commit: SHA_A, builtAt: '2026-08-04T09:00:00.000Z' });

    const payload = buildHealthPayload();
    expect(payload.status).toBe('ok');
    // Exact key set — this is an UNAUTHENTICATED endpoint, so an accidental addition of an
    // env value, path or config field must fail this test rather than ship.
    expect(Object.keys(payload).sort()).toEqual(['builtAt', 'commit', 'commitFull', 'status']);
  });

  it('still reports status:"ok" when the build is unidentifiable', () => {
    stubBakedFile(null);

    expect(buildHealthPayload()).toEqual({
      status: 'ok',
      commit: UNKNOWN_COMMIT,
      commitFull: null,
      builtAt: null,
    });
  });
});
