/**
 * Travel Tracker — Geocoding Service (Nominatim)
 *
 * Resolves city coordinates via the Nominatim OpenStreetMap geocoding API.
 * ADL-10: strictly complies with Nominatim usage policy — 1 req/sec max,
 * User-Agent required, results stored permanently (no re-querying).
 *
 * All Nominatim errors are caught and logged — never propagated to API callers.
 * GE-12: offline-safe — network unreachable is handled gracefully.
 */

import { asc, eq, isNull } from 'drizzle-orm';
import { cities, countries, getDb } from '../db/index.js';

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'TravelTracker/1.0 (personal-use-app)';
const REQUEST_DELAY_MS = 1100; // 100ms above the 1 req/s limit (ADL-10)
const CONNECTIVITY_TIMEOUT_MS = 3000;

/** When GEOCODING_ENABLED=false, all geocoding is skipped (e.g. CI contract tests) */
const GEOCODING_ENABLED = process.env.GEOCODING_ENABLED !== 'false';

/** Pauses execution for the given number of milliseconds */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Checks network connectivity by performing a HEAD request to Nominatim.
 * Returns false if the request fails or times out.
 */
async function isOnline(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CONNECTIVITY_TIMEOUT_MS);
    const resp = await fetch(NOMINATIM_BASE, {
      method: 'HEAD',
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
    clearTimeout(timer);
    return resp.ok || resp.status < 500;
  } catch {
    return false;
  }
}

/**
 * Attempts to resolve coordinates for a single city via Nominatim.
 *
 * @param cityId - The cities.id to resolve.
 * @returns true if coordinates were resolved and saved, false otherwise.
 */
export async function resolveCity(cityId: number): Promise<boolean> {
  const db = getDb();

  // Load city and its country name for the search query
  const rows = await db
    .select({
      id: cities.id,
      name: cities.name,
      geocodeStatus: cities.geocodeStatus,
      countryName: countries.name,
    })
    .from(cities)
    .leftJoin(countries, eq(countries.countryCode, cities.countryCode))
    .where(eq(cities.id, cityId))
    .limit(1);

  const city = rows[0];
  if (!city) {
    console.warn(`[GEO] City ${cityId} not found`);
    return false;
  }

  // Never re-query a resolved city (ADL-10)
  if (city.geocodeStatus === 'resolved') {
    return true;
  }

  if (!GEOCODING_ENABLED) {
    return false;
  }

  if (!(await isOnline())) {
    console.info('[GEO] Nominatim unreachable — skipping geocoding');
    return false;
  }

  // Record attempt time before making the request
  const attemptedAt = new Date().toISOString();
  await db
    .update(cities)
    .set({ geocodeAttemptedAt: attemptedAt, updatedAt: attemptedAt })
    .where(eq(cities.id, cityId));

  try {
    const params = new URLSearchParams({
      q: `${city.name}, ${city.countryName ?? ''}`,
      format: 'json',
      limit: '1',
      addressdetails: '0',
    });

    const resp = await fetch(`${NOMINATIM_BASE}?${params}`, {
      headers: { 'User-Agent': USER_AGENT },
    });

    if (!resp.ok) {
      console.warn(`[GEO] Nominatim HTTP ${resp.status} for city ${cityId}`);
      return false;
    }

    const data = (await resp.json()) as Array<{ lat: string; lon: string }>;

    if (!data.length) {
      // No results — leave as pending, will retry on next queue run
      console.info(`[GEO] No results for city ${cityId} (${city.name})`);
      return false;
    }

    const lat = parseFloat(data[0].lat);
    const lon = parseFloat(data[0].lon);
    const resolvedAt = new Date().toISOString();

    await db
      .update(cities)
      .set({
        latitude: lat,
        longitude: lon,
        geocodeStatus: 'resolved',
        geocodeAttemptedAt: resolvedAt,
        updatedAt: resolvedAt,
      })
      .where(eq(cities.id, cityId));

    console.info(`[GEO] Resolved city ${cityId} (${city.name}): ${lat}, ${lon}`);
    return true;
  } catch (err) {
    // All errors are caught — geocoding is fire-and-forget (GE-12)
    console.error(`[GEO] Error resolving city ${cityId}:`, (err as Error).message);
    return false;
  }
}

/**
 * Processes all cities with geocode_status = 'pending'.
 * Uses the geocoding queue SQL from ER schema §6.3.
 * Called on startup and every 15 minutes.
 * Enforces 1100ms delay between Nominatim requests (ADL-10).
 */
export async function processQueue(): Promise<void> {
  const db = getDb();

  // ER schema §6.3: oldest attempts first (NULLS first = never attempted first)
  const pending = await db
    .select({
      id: cities.id,
      name: cities.name,
      geocodeAttemptedAt: cities.geocodeAttemptedAt,
    })
    .from(cities)
    .where(eq(cities.geocodeStatus, 'pending'))
    .orderBy(asc(cities.geocodeAttemptedAt));

  if (!GEOCODING_ENABLED) {
    console.info('[GEO] Geocoding disabled (GEOCODING_ENABLED=false) — queue skipped');
    return;
  }

  if (!pending.length) {
    console.info('[GEO] Geocoding queue empty — nothing to process');
    return;
  }

  console.info(`[GEO] Processing ${pending.length} pending cities`);

  if (!(await isOnline())) {
    console.info('[GEO] Nominatim unreachable — queue deferred');
    return;
  }

  for (let i = 0; i < pending.length; i++) {
    const city = pending[i];
    await resolveCity(city.id);
    // Enforce rate limit between requests (not after the last one)
    if (i < pending.length - 1) {
      await sleep(REQUEST_DELAY_MS);
    }
  }

  console.info('[GEO] Geocoding queue processing complete');
}
