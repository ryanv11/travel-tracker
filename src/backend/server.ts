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
 *   1. getDb()                  — verify DB connection
 *   2. seedAdminData()          — trip_categories, activities, companions, map_shading_config
 *   3. seedCountries()          — countries table from data/countries.json
 *   4. seedRegions()            — regions table from data/regions.json
 *   5. processQueue()           — resolve any pending city geocoding
 *   6. schedule processQueue every 15 minutes
 */

import 'dotenv/config';
import { config } from 'dotenv';
config({ path: '.env.local' }); // explicit .env.local load

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';

import { getDb } from './db/index.js';
import { requireAuth } from './middleware/auth.js';
import { errorHandler } from './middleware/error-handler.js';
import { tripsRouter } from './routes/trips.js';
import { citiesRouter } from './routes/cities.js';
import { mapRouter } from './routes/map.js';
import { adminRouter } from './routes/admin.js';
import { seedAdminData, seedCountries, seedRegions } from './services/startup.service.js';
import { processQueue } from './services/geocoding.service.js';

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

// ----------------------------------------------------------------
// App setup
// ----------------------------------------------------------------

const app = express();

// 1. Helmet — HTTP security headers (SEC-01)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"], // React needs inline styles
        imgSrc: ["'self'", 'data:', 'blob:', '*.maptiler.com'],
        connectSrc: ["'self'", '*.maptiler.com'], // MapLibre tile fetches
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
const limiter = rateLimit({
  windowMs: 60_000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// C3 / SEC-M1: Secondary rate limit for POST /api/cities — 20 req/min (geocoding cost)
// Independent of global limiter; configured separately as each city creation triggers geocoding.
const citiesCreateLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});
app.post('/api/cities', citiesCreateLimiter);

// 5. Auth — Clerk JWT verification via jose (NR-14 / ADL-20)
// Applies to all /api/* routes. Exceptions: /health (public, registered after).
// NOTE: /api/map/shading routes are protected here; flagged for COO review in
// NR-14 completion report — map shading may need to be public in future.
app.use('/api/', requireAuth);

// ----------------------------------------------------------------
// Static files — GeoJSON boundary data
// ----------------------------------------------------------------

// Serve geo/ directory at /geo/ for FRONTEND map rendering
app.use('/geo', express.static(path.join(__dirname, '../../geo')));

// ----------------------------------------------------------------
// Route handlers
// ----------------------------------------------------------------

app.use('/api/trips', tripsRouter);   // includes nested /:tripId/places and /:tripId/items
app.use('/api/cities', citiesRouter);
app.use('/api/map', mapRouter);
app.use('/api/admin', adminRouter);

// Health check (useful for development)
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// 7. Global error handler — MUST be last (SEC-06)
app.use(errorHandler);

// ----------------------------------------------------------------
// Startup sequence
// ----------------------------------------------------------------

async function startup(): Promise<void> {
  console.info('[STARTUP] Travel Tracker API starting...');

  // 1. Verify DB connection
  const db = getDb();
  console.info('[STARTUP] Database connection: OK');

  // 2. Seed admin data (trip_categories, activities, companions, map_shading_config)
  await seedAdminData();

  // 3. Seed countries if empty
  await seedCountries();

  // 4. Seed regions if empty (US, AU, CA — Correction 2)
  await seedRegions();

  // 4b. Seed bypass test user when BYPASS_AUTH=true (contract test / CI environment).
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

  // 5. Process any pending geocoding (offline-safe — GE-12)
  processQueue().catch((err: unknown) => {
    console.error('[STARTUP] Geocoding queue error:', (err as Error).message);
  });

  // 6. Schedule geocoding queue every 15 minutes
  setInterval(() => {
    processQueue().catch((err: unknown) => {
      console.error('[GEO] Scheduled queue error:', (err as Error).message);
    });
  }, 15 * 60 * 1000);

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
