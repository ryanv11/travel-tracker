/**
 * Build identity — QUAL-26.
 *
 * WHY THIS EXISTS. `/health` used to return `{status:'ok'}` and nothing else, so nothing
 * outside the process could answer "which build is this?". On 2026-08-04 that ambiguity hid
 * five consecutive SKIPPED staging deploys: every check was green, nothing was red anywhere,
 * and staging served a build five commits stale. The only detection mechanism in the whole
 * system was the PO noticing that a merged fix still didn't work. This module is the
 * cheapest possible fix for that class — it makes the running build self-identifying.
 *
 * RESOLUTION ORDER, and why it is layered rather than a single lookup:
 *
 *   1. `BUILD_COMMIT_SHA`        — explicit operator override. Last-resort manual escape
 *                                  hatch if both mechanisms below ever fail on a platform.
 *   2. `RAILWAY_GIT_COMMIT_SHA`  — Railway injects this into builds AND deployments whose
 *                                  source is a GitHub trigger (docs.railway.com/variables/
 *                                  reference, "Git variables"). This service's source is
 *                                  `ryanv11/travel-tracker` @ `main`, and every staging
 *                                  deployment's Railway-side `meta` carries a `commitHash`
 *                                  and `branch: main` — so the precondition for those
 *                                  variables is satisfied empirically, not just on paper.
 *   3. the baked file            — written at BUILD time by scripts/generate-build-info.js
 *                                  (npm `prebuild`). This is the deliberate belt-and-braces
 *                                  layer: the Railway service-variable API does not
 *                                  enumerate platform-injected variables, so their presence
 *                                  at RUNTIME could not be confirmed from inside the
 *                                  devcontainer — confirming it would require running
 *                                  inside the deployed process. If step 2 turns out to be empty at runtime, the
 *                                  build-time capture still answers the question.
 *   4. `null`                    — reported honestly as 'unknown'. Never a stale hardcoded
 *                                  value, which would be worse than no value at all.
 *
 * WHAT IS DELIBERATELY NOT EXPOSED. Only the commit SHA and a build timestamp. No
 * environment values, no config, no filesystem paths, no dependency versions. The GitHub
 * repository is public, so the SHA itself discloses nothing that is not already public —
 * that reasoning applies to the SHA and to nothing else.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Where scripts/generate-build-info.js writes its output. Kept in one place. */
export const BAKED_BUILD_INFO_PATH = path.join(__dirname, '../generated/build-info.json');

/** Reported when no SHA could be resolved from any source. Never a hardcoded commit. */
export const UNKNOWN_COMMIT = 'unknown';

/** Length of the short SHA surfaced in `/health` and the UI — matches `git log --oneline`. */
const SHORT_SHA_LENGTH = 7;

/** Where a resolved SHA came from. Logged at startup; never included in an HTTP response. */
export type BuildInfoSource = 'env-override' | 'railway' | 'baked' | 'none';

/** The public build identity of the running process. */
export interface BuildInfo {
  /** Short commit SHA (7 chars), or `'unknown'` when no source resolved one. */
  commit: string;
  /** Full 40-char commit SHA, or `null` when unknown. */
  commitFull: string | null;
  /** ISO-8601 build timestamp, or `null` when unknown (only the baked file carries one). */
  builtAt: string | null;
}

/** Internal shape of the baked file. Every field optional — it is generated, not trusted. */
interface BakedBuildInfo {
  commit?: unknown;
  builtAt?: unknown;
}

/** A 40-char hex string. Anything else is treated as absent rather than echoed back. */
const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/i;

/**
 * Normalises a candidate SHA: trims it and rejects anything that is not a full hex SHA.
 *
 * Validating rather than passing through matters because two of the three sources are
 * environment variables — an operator typo or a platform placeholder must degrade to
 * `unknown` rather than surface as a plausible-looking but wrong build marker.
 *
 * @param candidate - Raw value from an env var or the baked file.
 * @returns The normalised lowercase 40-char SHA, or null if it is absent/malformed.
 */
function normaliseSha(candidate: unknown): string | null {
  if (typeof candidate !== 'string') return null;
  const trimmed = candidate.trim();
  if (!FULL_SHA_PATTERN.test(trimmed)) return null;
  return trimmed.toLowerCase();
}

/**
 * Reads the build-time baked file, if the build step produced one.
 *
 * Returns null on every failure mode (file absent, unreadable, invalid JSON) rather than
 * throwing — an absent build stamp must never take the process down, and local dev/test
 * runs legitimately have no baked file at all.
 *
 * @returns The parsed baked payload, or null if unavailable for any reason.
 */
function readBakedBuildInfo(): BakedBuildInfo | null {
  try {
    const raw = fs.readFileSync(BAKED_BUILD_INFO_PATH, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    return parsed as BakedBuildInfo;
  } catch {
    return null;
  }
}

/**
 * Resolves the running build's identity from the layered sources documented above.
 *
 * Pure with respect to its inputs (env + filesystem) and cheap — but `/health` is a
 * liveness endpoint that can be polled, so callers should use the memoised
 * {@link getBuildInfo} rather than calling this per request.
 *
 * @returns The resolved build identity plus the source it came from.
 */
export function resolveBuildInfo(): BuildInfo & { source: BuildInfoSource } {
  const baked = readBakedBuildInfo();
  const builtAt = typeof baked?.builtAt === 'string' ? baked.builtAt : null;

  const candidates: Array<{ source: BuildInfoSource; value: string | null }> = [
    { source: 'env-override', value: normaliseSha(process.env.BUILD_COMMIT_SHA) },
    { source: 'railway', value: normaliseSha(process.env.RAILWAY_GIT_COMMIT_SHA) },
    { source: 'baked', value: normaliseSha(baked?.commit) },
  ];

  for (const { source, value } of candidates) {
    if (value) {
      return {
        commit: value.slice(0, SHORT_SHA_LENGTH),
        commitFull: value,
        // Only the baked file knows when the build ran. A SHA from an env var with a baked
        // timestamp from a DIFFERENT build would be a lie, so the timestamp is only carried
        // when the baked file's own commit agrees with the resolved one.
        builtAt: normaliseSha(baked?.commit) === value ? builtAt : null,
        source,
      };
    }
  }

  return { commit: UNKNOWN_COMMIT, commitFull: null, builtAt: null, source: 'none' };
}

/** Memoised result — resolved once per process, at first use. */
let cached: (BuildInfo & { source: BuildInfoSource }) | null = null;

/**
 * Returns the running build's identity, resolving it at most once per process.
 *
 * The build cannot change while the process is alive, so this is memoised: `/health` is a
 * liveness endpoint and may be polled frequently, and a filesystem read per request would
 * be pure waste.
 *
 * @returns The memoised build identity plus the source it came from.
 */
export function getBuildInfo(): BuildInfo & { source: BuildInfoSource } {
  if (!cached) cached = resolveBuildInfo();
  return cached;
}

/**
 * Clears the memoised build identity. Test-only seam.
 *
 * Exists so tests can vary the environment across cases without leaking a resolution from
 * one test into the next; production code never calls it.
 */
export function resetBuildInfoCacheForTests(): void {
  cached = null;
}

/**
 * Builds the `/health` response body.
 *
 * `status` is kept first and unchanged so anything already depending on it — Railway's
 * healthcheck, the shakedown's `toMatchObject({status:'ok'})` — keeps working untouched.
 *
 * @returns The `/health` JSON payload: liveness plus build identity, nothing else.
 */
export function buildHealthPayload(): { status: 'ok' } & BuildInfo {
  const { commit, commitFull, builtAt } = getBuildInfo();
  return { status: 'ok', commit, commitFull, builtAt };
}
