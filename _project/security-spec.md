# Travel Tracker — Security Specification
**Version:** 1.1
**Date:** 2026-03-07
**Author:** COO
**Status:** Active — binding on all jobs from this date forward

---

## Purpose

This document defines security requirements across all phases of the Travel Tracker project.
Security is designed for all phases now. Implementation is proportionate to actual exposure
at each phase — the goal is to avoid both under-engineering (security debt) and
over-engineering (security theatre that slows delivery and adds no real protection).

**Reading guide:**
- Phase 1 implementors (BACKEND): SEC-01 through SEC-13 are your requirements.
  Everything else is awareness and forward-planning only.
- Future phases: each phase gate section tells you exactly what to implement before launch.

---

## Threat Model

### Data Flow Diagram (Phase 1 — local beta)

```
[User] ──browser──► [React Frontend :5173]
                           │ fetch()
                           ▼
                    [Express API :3001]  ──► [SQLite file (dev.db)]
                           │
                           ├──► [Nominatim API] (geocoding, internet)
                           │
                           └──► [geo/ static files] (GeoJSON, local)

[MapLibre GL JS] ──tile requests──► [MapTiler CDN] (map tiles, internet)
```

### Data Flow Diagram (Phase 2 — hosted)

```
[User] ──HTTPS──► [Reverse Proxy (nginx/Caddy)]
                           │
                           ▼
                    [Express API :3001]  ──► [PostgreSQL]
                           │
                           ├──► [Nominatim API]
                           └──► [geo/ static files]

[MapLibre GL JS] ──tile requests──► [MapTiler CDN]
```

### STRIDE Summary

| Component | Spoofing | Tampering | Repudiation | Info Disclosure | DoS | Elevation |
|-----------|----------|-----------|-------------|-----------------|-----|-----------|
| Express API (Phase 1) | Low — localhost only | Medium — no auth | Low | Medium — personal data in DB | Low | Low |
| Express API (Phase 2) | **High** — public internet | **High** | Medium | **High** | **High** | **High** |
| SQLite file (Phase 1) | n/a | Low — local only | n/a | Medium — plaintext file | n/a | n/a |
| PostgreSQL (Phase 2) | Low — private network | Low | n/a | Medium | Low | Low |
| Nominatim calls | n/a | n/a | n/a | Low — city names only | Low | n/a |
| MapTiler tiles | n/a | n/a | n/a | Low — tile requests | Low | n/a |

**Phase 1 residual risks (accepted):**
- SQLite file is unencrypted on disk. Personal travel data is exposed to anyone with filesystem access.
  Accepted: this is a personal single-user app; OS-level encryption (FileVault) mitigates.
- No auth on localhost API. Accepted: localhost only; no other user on the machine.

**Phase 2 — all HIGH STRIDE items must be resolved before launch.** See Phase 2 gate below.

---

## Phase Gates — Required Before Launch

| Gate | Required controls | Blocks |
|------|-------------------|--------|
| **Phase 1 launch** | SEC-01 through SEC-13 | Local beta |
| **Phase 2 launch** | Phase 1 + Phase 2 requirements below | Hosted web launch |
| **Phase 3 launch** | Phase 2 + Phase 3 requirements below | Companion access launch |

No phase launches without its gate controls in place. COO sign-off required at each gate.

---

## SEC-01: HTTP Security Headers — Phase 1

**Owner: BACKEND**
**Required by: Phase 1**

Install and configure `helmet` in `server.ts` as the first middleware registered.
Use default Helmet settings with the following overrides:

```typescript
import helmet from 'helmet';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],  // React needs inline styles
      imgSrc: ["'self'", "data:", "blob:", "*.maptiler.com"],
      connectSrc: ["'self'", "*.maptiler.com"],  // MapLibre tile fetches
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,  // Required for MapLibre WebGL
}));
```

The `crossOriginEmbedderPolicy: false` override is required because MapLibre GL JS
uses SharedArrayBuffer which conflicts with COEP in some configurations.

**Headers applied by default Helmet (verify all are present):**
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 0` (modern browsers handle this natively; Helmet disables the buggy header)
- `Referrer-Policy: no-referrer`
- `Strict-Transport-Security` (HSTS — only meaningful on HTTPS; fine to include now)

---

## SEC-02: CORS — Phase 1

**Owner: BACKEND**
**Required by: Phase 1**

Do not use `cors()` with no options. Use an allowlist from the start.

```typescript
import cors from 'cors';

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173,http://localhost:3001')
  .split(',')
  .map(o => o.trim());

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. curl, Postman, Electron in-process)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin '${origin}' not allowed`));
    }
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],  // Authorization reserved for Phase 2
  credentials: true,  // Reserved for Phase 2 session cookies — no cost to enable now
}));
```

**`.env.local` default:** `ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3001`
**Phase 2 change:** Set `ALLOWED_ORIGINS` to the hosted domain only. No code change.

---

## SEC-03: Network Binding — Phase 1

**Owner: BACKEND**
**Required by: Phase 1**

The Express server must bind to `127.0.0.1` by default, not `0.0.0.0`.

```typescript
const HOST = process.env.HOST ?? '127.0.0.1';
const PORT = parseInt(process.env.PORT ?? '3001', 10);
server.listen(PORT, HOST, () => console.log(`[API] Listening on http://${HOST}:${PORT}`));
```

**`.env.local` default:** `HOST=127.0.0.1`
**Phase 2 change:** Deploy behind a reverse proxy. Set `HOST=0.0.0.0` on the server host only.

---

## SEC-04: Input Validation — Phase 1

**Owner: BACKEND**
**Required by: Phase 1**

All API endpoints must validate inputs using **Zod** before touching the database.

Rules:
- Use allowlists for string enums — reject any value not in the allowed set.
- Reject unexpected fields: use `z.object({...}).strict()` where the request shape is fully known.
- Apply `.trim()` to all string inputs to prevent whitespace-padded duplicates.
- Cross-field validation (e.g. end_date >= start_date) via `.refine()`.

See the full schema pattern in the security addendum
(`jobs/backend/inbox/20260307_1710-COO-security-addendum.txt`).

**FRONTEND reuse:** Zod schemas in `src/backend/validation/` are importable by FRONTEND
for client-side validation — one definition, zero drift between client and server rules.

---

## SEC-05: Request Size Limits — Phase 1

**Owner: BACKEND**
**Required by: Phase 1**

```typescript
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
```

---

## SEC-06: Error Handling — Phase 1

**Owner: BACKEND**
**Required by: Phase 1**

Global error handler must be the last middleware registered. Must never return stack traces,
internal error messages, or implementation details to the client.

See full implementation in the security addendum.

Typed application errors (NotFoundError, LockError, ConflictError, ValidationError)
set their own `statusCode`. All other errors return 500 with a generic message.

---

## SEC-07: Rate Limiting — Phase 1

**Owner: BACKEND**
**Required by: Phase 1**

```typescript
import rateLimit from 'express-rate-limit';
const limiter = rateLimit({ windowMs: 60_000, max: 300, standardHeaders: true, legacyHeaders: false });
app.use('/api/', limiter);
```

300 req/min is generous for local single-user use. The structure (not the number) is what matters now.
Phase 2 tightens this to ~60 general / ~20 for writes. No code change needed — config only.

---

## SEC-08: Structured Logging — Phase 1

**Owner: BACKEND**
**Required by: Phase 1**

Never log `req.body`, `res.body`, or any user-supplied content. Log method, path,
status code, and duration only. Full error details (including stack trace) are logged
server-side only and never returned to the client.

---

## SEC-09: Authentication Stub — Phase 1

**Owner: BACKEND**
**Required by: Phase 2 — stub only in Phase 1**

Empty passthrough function registered at `app.use('/api/', authenticate)`.
Phase 2 replaces the function body with real auth. No route files change.

See full stub in the security addendum.

---

## SEC-10: Dependency Security — All Phases

**Owner: all jobs**

- `npm audit` before closing any thread that installs new packages. HIGH/CRITICAL must be resolved.
- `package-lock.json` always committed. Never install from non-npm sources without COO approval.
- `.env.local` is gitignored. Never commit secrets.

---

## SEC-11: SQL Injection Prevention — Phase 1

**Owner: BACKEND, DATABASE**
**Required by: Phase 1**

Drizzle ORM uses parameterized queries exclusively. This satisfies the SQL injection
requirement provided the following rule is never violated:

> **Never construct SQL strings by concatenating user input.** Drizzle's query builder
> is the only permitted way to interact with the database.

If a query cannot be expressed through Drizzle's query builder and raw SQL is required,
it must use Drizzle's `sql` template tag with parameterized values:

```typescript
// Correct — parameterized
import { sql } from 'drizzle-orm';
db.execute(sql`SELECT * FROM trips WHERE id = ${userInputId}`);

// FORBIDDEN — string concatenation
db.execute(`SELECT * FROM trips WHERE id = ${userInputId}`);
```

Any use of string-concatenated SQL is a blocking defect. No exceptions.

---

## SEC-12: Output Encoding / XSS Prevention — Phase 1

**Owner: BACKEND (API), FRONTEND (rendering)**
**Required by: Phase 1**

BACKEND responsibility:
- API responses are JSON. Express's `res.json()` handles JSON serialization correctly.
- Never construct HTML responses from user data. The API returns data only — FRONTEND renders it.
- Never use `res.send()` with user-supplied strings that could be interpreted as HTML.

FRONTEND responsibility (spec for when FRONTEND begins):
- All user-supplied content rendered via React's JSX is automatically escaped. Do not use
  `dangerouslySetInnerHTML` anywhere. If it appears in a code review, it is a blocking defect.
- URL fields (e.g. `photo_album_ref`) rendered as links must be sanitised before use:
  only `https://` and `file://` schemes are permitted. Reject `javascript:` and `data:` schemes.
- MapLibre map labels or popups containing user data must use MapLibre's text rendering,
  not innerHTML injection.

---

## SEC-13: CI Pipeline Security Gates — Phase 1

**Owner: COO (setup), all jobs (compliance)**
**Required by: Phase 1**

Before Phase 1 beta launches, a basic CI security pipeline must be running. These tools
are free for personal/open-source projects and add minimal overhead:

### 13a. Secret Scanning

**Tool:** GitHub native secret scanning (if repo is on GitHub) or Gitleaks.

Gitleaks runs as a pre-commit hook and/or CI step. Catches accidental commits of API keys,
tokens, connection strings, and `.env` files.

Setup (CI step):
```yaml
- name: Secret scan
  uses: gitleaks/gitleaks-action@v2
```

Or as a pre-commit hook in `.pre-commit-config.yaml`.

**Blocks:** Any commit containing a secret pattern. Fix: rotate the credential, then remove from history.

### 13b. Dependency Vulnerability Scanning

**Tool:** `npm audit` in CI (already required by SEC-10 for manual threads).
Also enable GitHub Dependabot alerts on the repository.

CI step:
```bash
npm audit --audit-level=high
```

Fail the pipeline on HIGH or CRITICAL. MODERATE: log and continue (COO reviews weekly).

### 13c. Static Analysis (SAST)

**Tool:** Semgrep (free, fast, TypeScript-aware).

Semgrep catches common patterns that Zod and Drizzle don't cover:
- Hardcoded secrets
- `dangerouslySetInnerHTML` usage
- Prototype pollution patterns
- Insecure `eval()` / `Function()` calls
- Unvalidated redirects

CI step:
```yaml
- name: Semgrep SAST
  uses: semgrep/semgrep-action@v1
  with:
    config: >-
      p/typescript
      p/react
      p/nodejs
      p/owasp-top-ten
```

Semgrep runs in seconds on a codebase this size. There is no reason not to have it.

**Acceptable findings:** Review all findings. Suppress false positives with an inline comment
(`# nosec` equivalent for Semgrep). Every suppression must include a justification comment.

---

## Phase 2 Security Requirements

Implement before any hosted deployment. These are not optional.

### Authentication

- Replace `authenticate()` stub with real auth.
- Use **OAuth 2.0 / OpenID Connect** (preferred) or secure session cookies.
  - OAuth2: user authenticates via a provider (Google, GitHub, or self-hosted).
  - Session: `express-session` + secure cookie flags (`HttpOnly`, `Secure`, `SameSite=Strict`).
- If JWTs: short-lived access tokens (15 min), refresh token rotation, stored in HttpOnly cookies
  (not localStorage — localStorage is readable by any script on the page).
- Password hashing (if implementing own auth): Argon2 or bcrypt. Never store plaintext. Never MD5/SHA1.

### TLS

- All traffic to the hosted Express server must be via HTTPS (TLS 1.2 minimum, TLS 1.3 preferred).
- TLS is terminated at the reverse proxy (nginx/Caddy), not in Express.
- HTTP requests to port 80 are redirected to HTTPS — never served.
- HSTS header is already set by Helmet; verify it works end-to-end.

### CORS

- Restrict `ALLOWED_ORIGINS` to the specific production domain. No wildcards.
- Remove localhost from the production allow list.

### Rate Limiting

- General API: ~60 req/min per IP
- Write endpoints (POST/PATCH/DELETE): ~20 req/min per IP
- Login/auth endpoints (if applicable): ~5 attempts per 15 min per IP, with backoff

### IDOR / Authorisation Testing

- Verify every GET/PATCH/DELETE endpoint checks that the requested resource belongs to the
  authenticated user. Example: `GET /api/trips/42` must verify trip 42 belongs to the caller.
- Test by attempting to access another user's trip ID with a different user's credentials.
- Any endpoint returning data without an ownership check is a blocking defect.

### DAST Scan

Run OWASP ZAP (free) or Burp Suite Community against the staging environment before launch.
At minimum, run the automated scan against:
- All `/api/` endpoints
- Auth endpoints
- Any file or URL reference inputs

Review findings. All HIGH findings must be resolved. MEDIUM findings reviewed by COO.

### Business Logic Testing

Manually verify:
- Trip status transitions — only allowed transitions succeed (already specced in BACKEND)
- Locked trip write prevention — locked trips cannot be modified via API
- Carry-forward integrity — carried items have correct `is_carried_forward` + `carried_from_item_id`
- Shading state computation — test all 7 state transitions with known data

### Audit Logging

Log all write operations (POST/PATCH/DELETE) with:
- Timestamp (ISO 8601)
- HTTP method + path
- HTTP status code returned
- User ID (once auth exists)

Do not log request or response bodies.

### Data at Rest

- PostgreSQL: enable encryption at the volume/disk level (cloud provider feature — not application code).
- Ensure database connection string (`DATABASE_URL`) is stored in a secret manager, not `.env` files,
  in production.

### Pre-Launch: Independent Penetration Test

Before Phase 2 goes to production, an independent pentest is required. Scope:
- Web application (all UI flows)
- REST API (all endpoints, auth, authorisation)
- Infrastructure (cloud config, network exposure, IAM)

Deliverables: vulnerability report, severity classification (CVSS), remediation plan.
All CRITICAL and HIGH findings must be remediated before launch.
COO approves the pentest scope and signs off on the remediation report.

---

## Phase 3 Security Requirements (Companion Access)

Implement before companion access ships.

### Authorisation Model

- Implement ownership-based access control (ABAC):
  - Every resource (trip, place, item) has an `owner_id` (user ID).
  - All read/write operations check ownership in an Express middleware layer.
  - Companion access introduces a second check: companion has explicit permission on the trip.
- Never rely on the frontend to enforce access control. Every API call is independently verified.

### Companion Roles

- `read-only`: GET only. No POST/PATCH/DELETE.
- `edit`: GET + POST + PATCH on items and places. Cannot delete trips or lock/unlock.
- Role is checked per-request in middleware, not via frontend routing.

### Invite Flow

- Secure, time-limited invite token (e.g. UUID, expires in 72 hours).
- Token is single-use: invalidated on first acceptance.
- Token is not embedded in URL for long — link expires from the email/message.

### Rate Limiting

- Switch from per-IP to per-authenticated-user rate limiting.
- IP-based limits remain as a backstop against unauthenticated abuse.

### Privilege Escalation Testing

Before launch, manually verify:
- User A cannot read or modify User B's trips, even with a valid session.
- A companion with read-only cannot write via API (bypass frontend).
- A companion cannot elevate their own role.

### Second Penetration Test

A second independent pentest is required before companion access launches.
Focus: authorisation bypass, IDOR, privilege escalation, broken access control.

---

## Summary — What BACKEND Implements Now (Phase 1)

| # | Control | Phase | Package |
|---|---------|-------|---------|
| SEC-01 | Helmet HTTP security headers | 1 | `helmet` |
| SEC-02 | CORS allowlist | 1 | `cors` |
| SEC-03 | Localhost-only binding | 1 | — |
| SEC-04 | Zod input validation (allowlists, `.strict()`, cross-field) | 1 | `zod` |
| SEC-05 | Request body size limit 100KB | 1 | — |
| SEC-06 | Safe error handler (no stack trace leakage) | 1 | — |
| SEC-07 | Rate limiting 300 req/min | 1 | `express-rate-limit` |
| SEC-08 | Structured logging (no body content) | 1 | — |
| SEC-09 | Auth middleware stub (Phase 2 hook) | 1 stub / 2 impl | — |
| SEC-10 | `npm audit` on installs; lock file committed | 1 | — |
| SEC-11 | Parameterized queries only (Drizzle ORM) | 1 | — |
| SEC-12 | Output encoding / no dangerouslySetInnerHTML | 1 | — |
| SEC-13 | CI: secret scanning + dep scanning + SAST | 1 | Gitleaks, Semgrep |

Additional packages to add to `package.json`:
- `helmet`
- `express-rate-limit`
- `zod`
- `@types/helmet` (devDependency)

---

## What This Spec Does NOT Require in Phase 1

These are explicitly deferred — not forgotten:

| Item | Deferred to | Reason |
|------|-------------|--------|
| Authentication | Phase 2 | Single-user local app; no value in Phase 1 |
| HTTPS | Phase 2 | localhost only |
| IDOR testing | Phase 2 | No multi-user; no auth |
| DAST scan | Phase 2 | No public attack surface in Phase 1 |
| Encrypted at rest | Phase 2 | OS-level FileVault mitigates for personal use |
| Penetration test | Phase 2 (pre-launch) | No public exposure until Phase 2 |
| RBAC/ABAC | Phase 3 | No companion access until Phase 3 |
| Password hashing | Phase 2 (if own auth) | No auth in Phase 1 |
| Audit logging | Phase 2 | No users to audit in Phase 1 |
