#!/usr/bin/env node
/**
 * Bake the build's commit identity into the image — QUAL-26.
 *
 * Runs as npm's `prebuild` hook, so it fires automatically as part of `npm run build` —
 * which is the build command Railway's Railpack builder runs for this service (empirically:
 * staging serves the built frontend from dist/ per ADL-32, which only exists if `vite build`
 * ran there).
 *
 * WHY BAKE AT ALL, when Railway also injects RAILWAY_GIT_COMMIT_SHA at runtime? Because that
 * variable's runtime presence could not be confirmed from inside the devcontainer — the
 * Railway service-variable API lists only user-set service variables (which is why a COO
 * check found it absent), and the deployed process's own runtime environment can't be read
 * from here (that would require running inside it). Railway's docs say Git variables are provided to "all builds and
 * deployments" from a GitHub trigger and this service is exactly that, so runtime injection
 * is expected — but "expected" is not "verified", and a build stamp that silently reads
 * `unknown` on the one deploy you needed it for is worthless. Capturing the SHA at build
 * time as well means the marker survives either mechanism failing.
 *
 * This never fails the build. A build with no resolvable SHA writes `commit: null` and warns;
 * /health then honestly reports `unknown` rather than a stale or invented value.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.join(__dirname, '../src/backend/generated/build-info.json');

const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/i;

/**
 * Normalises a candidate SHA, rejecting anything that is not a full 40-char hex string.
 *
 * @param {unknown} candidate - Raw value from an environment variable or `git`.
 * @returns {string | null} The lowercase 40-char SHA, or null if absent/malformed.
 */
function normaliseSha(candidate) {
  if (typeof candidate !== 'string') return null;
  const trimmed = candidate.trim();
  return FULL_SHA_PATTERN.test(trimmed) ? trimmed.toLowerCase() : null;
}

/**
 * Reads HEAD's SHA from git, for local builds where no platform variable is set.
 *
 * Returns null rather than throwing when git is unavailable or this is not a checkout —
 * both are normal inside a builder image, which typically has neither git nor a .git dir.
 *
 * @returns {string | null} HEAD's full SHA, or null if git could not answer.
 */
function shaFromGit() {
  try {
    return normaliseSha(
      execFileSync('git', ['rev-parse', 'HEAD'], { cwd: __dirname, encoding: 'utf8' }),
    );
  } catch {
    return null;
  }
}

// Ordered by trustworthiness for "what commit is this build FROM":
//   BUILD_COMMIT_SHA      — explicit operator override, always wins
//   RAILWAY_GIT_COMMIT_SHA — Railway's build-time Git variable (the deployed case)
//   GITHUB_SHA            — GitHub Actions, so a CI-built artefact is also identifiable
//   git rev-parse HEAD    — local developer build
const commit =
  normaliseSha(process.env.BUILD_COMMIT_SHA) ??
  normaliseSha(process.env.RAILWAY_GIT_COMMIT_SHA) ??
  normaliseSha(process.env.GITHUB_SHA) ??
  shaFromGit();

const payload = { commit, builtAt: new Date().toISOString() };

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

if (commit) {
  console.info(`[build-info] baked commit ${commit.slice(0, 7)} (built ${payload.builtAt})`);
} else {
  console.warn(
    '[build-info] no commit SHA resolvable from BUILD_COMMIT_SHA, RAILWAY_GIT_COMMIT_SHA, ' +
      'GITHUB_SHA or git — /health will report "unknown" for this build.',
  );
}
