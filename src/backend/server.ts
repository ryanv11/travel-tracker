/**
 * Travel Tracker — Express API Entry Point
 *
 * Registers middleware in the order required by the security spec (SEC-01 through SEC-09):
 *   1. helmet      — HTTP security headers (SEC-01)
 *   2. cors        — CORS allowlist (SEC-02)
 *   3. json/urlencoded with 100kb limit (SEC-05)
 *   4. rate limiter (SEC-07)
 *   5. auth stub (SEC-09)
 *   6. route handlers
 *   7. global error handler — LAST (SEC-06)
 *
 * Startup sequence on launch:
 *   1. getDb()                       — verify DB connection
 *   2. assertForeignKeysEnabled()    — QUAL-11/ADL-41 §7.2.1: fail loudly if
 *                                      PRAGMA foreign_keys != 1 (DB_TYPE=sqlite only)
 *   3. seedAdminData()               — trip_categories, activities, companions, map_shading_config
 *   4. seedCountries()               — countries table from data/countries.json
 *   5. seedRegions()                 — regions table from data/regions.json
 *   6. processQueue()                — resolve any pending city geocoding
 *   7. schedule processQueue every 15 minutes
 */

import 'dotenv/config';
import { config } from 'dotenv';

config({ path: '.env.local' }); // explicit .env.local load

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

import { getDb } from './db/index.js';
import { requireAuth } from './middleware/auth.js';
import { errorHandler } from './middleware/error-handler.js';
import { userRepository } from './repositories/users.js';
import { activitiesRouter } from './routes/activities.js';
import { adminRouter } from './routes/admin.js';
import { categoriesRouter } from './routes/categories.js';
import { citiesRouter } from './routes/cities.js';
import { companionsRouter } from './routes/companions.js';
import { geocodeRouter } from './routes/geocode.js';
import { mapRouter } from './routes/map.js';
import { meRouter } from './routes/me.js';
import { tripsRouter } from './routes/trips.js';
import { buildHealthPayload, getBuildInfo } from './services/build-info.js';
import { processQueue } from './services/geocoding.service.js';
import {
  assertForeignKeysEnabled,
  seedAdminData,
  seedCountries,
  seedRegions,
} from './services/startup.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ----------------------------------------------------------------
// Config from environment
// ----------------------------------------------------------------

const PORT = parseInt(process.env.PORT ?? '3001', 10);
const HOST = process.env.HOST ?? '127.0.0.1'; // SEC-03: localhost-only binding

// SEC-02: CORS allowlist — no wildcard origins
const ALLOWED_ORIGINS = (
  process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173,http://localhost:3001'
)
  .split(',')
  .map((o) => o.trim());

// Clerk loads its own browser SDK (clerk-js) from its Frontend API origin rather
// than bundling it — the CSP below must explicitly allow that origin or the script
// load (and Clerk's own API calls) are blocked. Only set when CLERK_ISSUER is
// configured; BYPASS_AUTH/CI environments don't set it and never load Clerk's JS.
const CLERK_ORIGIN = process.env.CLERK_ISSUER;

// ADL-32: Hosted deployment (Railway) serves the built frontend from this same
// process — express.static on the Vite dist/ build + an SPA fallback for
// client-side routes. Gated on NODE_ENV=production AND the dist/ directory
// actually existing, so local dev (two-process Vite/Express split, no dist/
// build present) is completely unaffected.
const DIST_DIR = path.join(__dirname, '../../dist');
const SERVE_STATIC = process.env.NODE_ENV === 'production' && fs.existsSync(DIST_DIR);

// ----------------------------------------------------------------
// App setup
// ----------------------------------------------------------------

const app = express();

// 0. Trust proxy — Railway edge proxy (BUG-60 / ADL-37)
//
// Railway terminates TLS at its edge and forwards to this container, appending the
// real client IP to X-Forwarded-For (exactly one trusted hop). Express defaults to
// NOT trusting that header, so express-rate-limit (SEC-07, below) can't resolve the
// client IP and throws ERR_ERL_UNEXPECTED_X_FORWARDED_FOR on boot.
//
// The value is the integer hop count `1`, NOT `true`. `true` would trust the entire
// X-Forwarded-For chain, so a client could forge a leftmost entry and spoof its IP to
// evade rate limits (express-rate-limit rejects that with ERR_ERL_PERMISSIVE_TRUST_PROXY).
// `1` strips exactly one hop (Railway's edge) and takes the last-appended address as
// req.ip — a forged prefix is ignored because Railway appends the real peer to the right.
// Identical topology in prod and staging; safe in local dev/CI too (no X-Forwarded-For
// present → req.ip falls back to the socket peer, and the limiter never trips).
// MUST be set before the rate-limiter middleware registers. See ADL-37.
app.set('trust proxy', 1);

// 1. Helmet — HTTP security headers (SEC-01)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // Clerk loads its browser SDK from its own Frontend API origin rather
        // than bundling it, and that same origin handles Clerk's own XHR/fetch
        // calls (sign-in, session refresh) — both directives need it or Clerk
        // fails to load entirely (blank screen, no error boundary can catch it).
        scriptSrc: CLERK_ORIGIN ? ["'self'", CLERK_ORIGIN] : ["'self'"],
        // Clerk spins up a Web Worker (blob: URL) for background token
        // handling. With no explicit worker-src, browsers fall back to
        // script-src for worker creation — which doesn't allow blob:, so the
        // worker gets blocked. Needs its own directive rather than relying
        // on that fallback.
        workerSrc: ["'self'", 'blob:'],
        styleSrc: ["'self'", "'unsafe-inline'"], // React needs inline styles
        // img.clerk.com serves Clerk's own user avatar images.
        imgSrc: ["'self'", 'data:', 'blob:', '*.maptiler.com', 'img.clerk.com'],
        connectSrc: CLERK_ORIGIN
          ? ["'self'", '*.maptiler.com', CLERK_ORIGIN] // MapLibre tiles + Clerk API
          : ["'self'", '*.maptiler.com'],
        frameSrc: ["'none'"],
      },
    },
    frameguard: { action: 'deny' }, // X-Frame-Options: DENY (SEC-01)
    crossOriginEmbedderPolicy: false, // Required for MapLibre WebGL
  }),
);

// 2. CORS — allowlist (SEC-02)
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, Postman, Electron in-process)
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin '${origin}' not allowed`));
      }
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'], // Authorization reserved for Phase 2
    credentials: true, // Reserved for Phase 2 session cookies
  }),
);

// 3. Body parsers with 100KB limit (SEC-05)
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// 4. Rate limiter on /api/ (SEC-07) — 300 req/min for single-user local use
//
// OP-11: Playwright's webServer boots ONE backend process for the entire 36-spec
// E2E run (workers:1, sequential, ~35-40s wall time). The limiter's counter is
// per-process, so it accumulates across every spec file's beforeEach (deleteAllTrips
// = 1 GET + N DELETEs) and test body requests — by the last couple of specs in
// trips.spec.ts, cumulative requests were landing on/near the 300/60s ceiling and
// getting 429'd. That looked like cross-spec DB state leakage (a test's own trip
// wouldn't render) but was actually rate-limit exhaustion of one long-lived process.
// BYPASS_AUTH=true is already fatal in production (guard above) and only ever set
// in test/CI, so it's a safe signal to raise headroom here rather than disable the
// control — SEC-07 stays enforced (and at its real limit) for every non-test process.
const limiter = rateLimit({
  windowMs: 60_000,
  max: process.env.BYPASS_AUTH === 'true' ? 5000 : 300,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// C3 / SEC-M1: Secondary rate limit for POST /api/cities — 20 req/min (geocoding cost)
// Independent of global limiter; configured separately as each city creation triggers geocoding.
// OP-11: same BYPASS_AUTH headroom rationale as the global limiter above.
const citiesCreateLimiter = rateLimit({
  windowMs: 60_000,
  max: process.env.BYPASS_AUTH === 'true' ? 500 : 20,
  standardHeaders: true,
  legacyHeaders: false,
});
app.post('/api/cities', citiesCreateLimiter);

// 5. Auth — Clerk JWT verification via jose (NR-14 / ADL-20)
// Applies to all /api/* routes. Exceptions: /health (public, registered after).
// Map shading routes are included — shading data is scoped per req.user.id, so
// there is no version of this endpoint that is both public and per-user private.
app.use('/api/', requireAuth);

// ----------------------------------------------------------------
// Static files — GeoJSON boundary data
// ----------------------------------------------------------------

// Serve geo/ directory at /geo/ for FRONTEND map rendering
app.use('/geo', express.static(path.join(__dirname, '../../geo')));

// ----------------------------------------------------------------
// Route handlers
// ----------------------------------------------------------------

app.use('/api/trips', tripsRouter); // includes nested /:tripId/places and /:tripId/items
app.use('/api/cities', citiesRouter);
app.use('/api/map', mapRouter);
app.use('/api/admin', adminRouter);
app.use('/api/companions', companionsRouter); // ADL-28 (AD-08): requireAuth only, userId-scoped
app.use('/api/categories', categoriesRouter); // ADL-46 (AD-09, D3): requireAuth only, userId-scoped
app.use('/api/activities', activitiesRouter); // ADL-46 (AD-09, D3): requireAuth only, userId-scoped
app.use('/api/geocode', geocodeRouter); // ADL-46 (D7): geocoding proxy — requireAuth, egress chokepoint
app.use('/api/me', meRouter); // BUG-26: identity endpoint for frontend owner gating

// Health check — liveness AND build identity (QUAL-26).
//
// Intentionally unauthenticated (OP-06 §1.2 exempts it as a liveness probe), so the payload
// is limited to `status` plus the commit SHA and build timestamp: no env values, no config,
// no paths, no dependency versions. The GitHub repo is public, so the SHA discloses nothing
// that is not already public; that reasoning covers the SHA and nothing else.
//
// `status: 'ok'` is unchanged and still first — Railway's healthcheck and the shakedown's
// existing assertion both keep working. See src/backend/services/build-info.ts for how the
// SHA is resolved and why the resolution is layered.
app.get('/health', (_req, res) => res.json(buildHealthPayload()));

// ----------------------------------------------------------------
// Static frontend (ADL-32 — hosted deployment only)
// ----------------------------------------------------------------
//
// Registered AFTER all /api/* routers and /health above, so those always take
// priority. Two-part serving:
//   1. express.static serves real built assets (JS/CSS/images) directly from
//      dist/ when the request path matches a file on disk.
//   2. The SPA fallback below catches everything else so client-side routing
//      (React Router) works on refresh/deep-link — EXCEPT /api/* paths, which
//      are explicitly excluded and passed through via next() so an unmatched
//      API route still falls through to Express's normal 404 behaviour
//      instead of incorrectly returning index.html.
if (SERVE_STATIC) {
  console.info(`[STARTUP] Serving static frontend build from ${DIST_DIR}`);
  app.use(express.static(DIST_DIR));

  // Path-less middleware (not app.get('*', ...)) — Express 5's path-to-regexp
  // no longer accepts a bare '*' wildcard pattern, so the exclusion is done
  // in code instead of route syntax.
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) {
      next();
      return;
    }
    // Pass `root` + a relative filename rather than a bare absolute path —
    // send's dotfile check (invoked by res.sendFile) walks every segment of
    // an absolute path when no `root` is given, which spuriously 404s if any
    // ancestor directory in the deployment path starts with a dot. Using
    // `root` also keeps this call inside DIST_DIR, which is simply correct
    // practice for res.sendFile regardless of deployment path.
    res.sendFile('index.html', { root: DIST_DIR });
  });
}

// 7. Global error handler — MUST be last (SEC-06)
app.use(errorHandler);

// ----------------------------------------------------------------
// Startup sequence
// ----------------------------------------------------------------

async function startup(): Promise<void> {
  console.info('[STARTUP] Travel Tracker API starting...');

  // QUAL-26: state the build identity in the very first lines of the deploy log, so
  // "which build is this?" is answerable from Railway's log view as well as from /health.
  // `source` is logged but never returned over HTTP — it is operator diagnostics for
  // "the SHA resolver fell back", not something a public endpoint should volunteer.
  const build = getBuildInfo();
  console.info(
    `[STARTUP] Build ${build.commit} (source: ${build.source}, built: ${build.builtAt ?? 'unknown'})`,
  );

  // 0. Guard: BYPASS_AUTH must never be set outside test/CI environments.
  if (process.env.BYPASS_AUTH === 'true') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'BYPASS_AUTH=true is not allowed in production. Remove it from your environment and restart.',
      );
    }
    console.warn(
      '[SECURITY WARNING] BYPASS_AUTH=true — JWT authentication is DISABLED. ' +
        'This must only be used in test/CI environments. Never set this in production.',
    );
  }

  // 1. Verify DB connection
  const db = getDb();
  console.info('[STARTUP] Database connection: OK');

  // 2. Assert FK enforcement is active (QUAL-11 / ADL-41 §7.2.1 decision 9) —
  // read-only check, fails loudly rather than allowing silent orphaning.
  await assertForeignKeysEnabled();

  // 3. Seed admin data (trip_categories, activities, companions, map_shading_config)
  await seedAdminData();

  // 4. Seed countries if empty
  await seedCountries();

  // 5. Seed regions if empty (US, AU, CA — Correction 2)
  await seedRegions();

  // 5b. Seed bypass test user when BYPASS_AUTH=true (contract test / CI environment).
  // The bypass auth middleware sets req.user.id to a fixed UUID without creating a DB row.
  // Since trips/items/places now have FK to users.id (ADL-18), the test user must exist.
  // We insert with the same fixed ID used by the bypass middleware in auth.ts.
  if (process.env.BYPASS_AUTH === 'true') {
    const { users: usersTable } = await import('./db/schema.js');
    const now = new Date();
    await db
      .insert(usersTable)
      .values({
        id: 'test-user-00000000-0000-0000-0000-000000000000',
        clerkId: 'test_clerk_id',
        email: 'test@example.com',
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing();
    console.info('[STARTUP] Bypass test user seeded (BYPASS_AUTH=true)');
  }

  // 5c. ADL-27: Reconciliation pass — set is_owner flag from OWNER_CLERK_ID env var.
  // This corrects any drift (manual DB edits, test data from BYPASS_AUTH sessions,
  // or OWNER_CLERK_ID changes after initial deployment).
  // The primary assignment is in findOrCreateByClerkId (handles fresh-DB case).
  if (process.env.OWNER_CLERK_ID) {
    await userRepository.setOwner(process.env.OWNER_CLERK_ID);
    console.info('[STARTUP] Owner reconciliation pass complete.');
  } else {
    console.warn('[SECURITY] OWNER_CLERK_ID is not set — no admin owner configured.');
  }

  // 6. Process any pending geocoding (offline-safe — GE-12)
  processQueue().catch((err: unknown) => {
    console.error('[STARTUP] Geocoding queue error:', (err as Error).message);
  });

  // 7. Schedule geocoding queue every 15 minutes
  setInterval(
    () => {
      processQueue().catch((err: unknown) => {
        console.error('[GEO] Scheduled queue error:', (err as Error).message);
      });
    },
    15 * 60 * 1000,
  );

  // Start HTTP server — bound to HOST (127.0.0.1 by default, SEC-03)
  app.listen(PORT, HOST, () => {
    console.info(`[STARTUP] Travel Tracker API ready on http://${HOST}:${PORT}`);
  });
}

// ----------------------------------------------------------------
// Launch
// ----------------------------------------------------------------

startup().catch((err: unknown) => {
  console.error('[STARTUP] Fatal error during startup:', err);
  process.exit(1);
});

export default app;
