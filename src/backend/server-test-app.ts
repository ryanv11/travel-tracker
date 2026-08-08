/**
 * Travel Tracker — Express App (Test Export)
 *
 * This module exports the configured Express app WITHOUT starting the HTTP
 * server or running startup tasks (seeding, geocoding). It is used exclusively
 * by backend integration tests via supertest, which provides its own HTTP layer.
 *
 * The module re-uses the same middleware and route registrations as server.ts,
 * ensuring tests exercise exactly the same request pipeline as production.
 *
 * Do NOT import this file in server.ts or any production code path.
 */

import 'dotenv/config';
import { config } from 'dotenv';

config({ path: '.env.local' });

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

import { requireAuth } from './middleware/auth.js';
import { errorHandler } from './middleware/error-handler.js';
import { activitiesRouter } from './routes/activities.js';
import { adminRouter } from './routes/admin.js';
import { categoriesRouter } from './routes/categories.js';
import { citiesRouter } from './routes/cities.js';
import { companionsRouter } from './routes/companions.js';
import { geocodeRouter } from './routes/geocode.js';
import { mapRouter } from './routes/map.js';
import { meRouter } from './routes/me.js';
import { tripsRouter } from './routes/trips.js';
import { buildHealthPayload } from './services/build-info.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// SEC-02: CORS allowlist
const ALLOWED_ORIGINS = (
  process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173,http://localhost:3001'
)
  .split(',')
  .map((o) => o.trim());

const app = express();

// Trust proxy — mirrors server.ts (BUG-60 / ADL-37). Kept in sync so tests exercise
// the same request pipeline as production. Railway is a single trusted edge hop, hence
// the integer `1` (not `true`, which would be spoofable — see ADL-37). Harmless under
// supertest's loopback transport (no X-Forwarded-For present).
app.set('trust proxy', 1);

// Helmet — HTTP security headers (SEC-01)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:', '*.maptiler.com'],
        connectSrc: ["'self'", '*.maptiler.com'],
        frameSrc: ["'none'"],
      },
    },
    frameguard: { action: 'deny' },
    crossOriginEmbedderPolicy: false,
  }),
);

// CORS (SEC-02)
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin '${origin}' not allowed`));
      }
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);

// Body parsers with 100KB limit (SEC-05)
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// Rate limiter on /api/ (SEC-07)
const limiter = rateLimit({
  windowMs: 60_000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Secondary rate limiter for POST /api/cities
const citiesCreateLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});
app.post('/api/cities', citiesCreateLimiter);

// Auth — Clerk JWT verification via jose (NR-14 / ADL-20)
app.use('/api/', requireAuth);

// Static GeoJSON files
app.use('/geo', express.static(path.join(__dirname, '../../geo')));

// Route handlers
app.use('/api/trips', tripsRouter);
app.use('/api/cities', citiesRouter);
app.use('/api/map', mapRouter);
app.use('/api/admin', adminRouter);
app.use('/api/companions', companionsRouter); // ADL-28 (AD-08): requireAuth only, userId-scoped
app.use('/api/categories', categoriesRouter); // ADL-46 (AD-09, D3): requireAuth only, userId-scoped
app.use('/api/activities', activitiesRouter); // ADL-46 (AD-09, D3): requireAuth only, userId-scoped
app.use('/api/geocode', geocodeRouter); // ADL-46 (D7): geocoding proxy — requireAuth, egress chokepoint
app.use('/api/me', meRouter); // BUG-26: identity endpoint for frontend owner gating

// Health check — same handler shape as server.ts (QUAL-26: liveness + build identity).
// Kept identical so integration tests exercise the real payload rather than a stub that
// could drift away from what production actually returns.
app.get('/health', (_req, res) => res.json(buildHealthPayload()));

// Global error handler — MUST be last (SEC-06)
app.use(errorHandler);

export default app;
