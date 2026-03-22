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
import { adminRouter } from './routes/admin.js';
import { citiesRouter } from './routes/cities.js';
import { mapRouter } from './routes/map.js';
import { tripsRouter } from './routes/trips.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// SEC-02: CORS allowlist
const ALLOWED_ORIGINS = (
  process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173,http://localhost:3001'
)
  .split(',')
  .map((o) => o.trim());

const app = express();

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
    credentials: true,
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

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Global error handler — MUST be last (SEC-06)
app.use(errorHandler);

export default app;
