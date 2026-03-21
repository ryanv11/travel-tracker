# Travel Tracker — Pre-Shared-Access Hardening Gate
**ID:** NR-14 / OP-06
**Version:** 1.0
**Date:** 2026-03-21
**Author:** COO
**Status:** Draft — awaiting PO notes + Architect review on Phase 2 items

---

## Purpose

This document defines what must be true before any non-owner user accesses the app.
It is structured as three gates, each building on the last:

| Gate | Trigger | What it unlocks |
|---|---|---|
| **1.5 — Auth Hardening** | Before sharing access with anyone | App is safe to deploy; auth is real; no bypasses |
| **2.0 — Hosted Deployment** | Before deploying to a server | Transport security, rate limits, observability |
| **3.0 — Companion Access** | Before a second user has their own data | RBAC, isolation, invite flow |

COO sign-off required at each gate. PO UAT required before Gate 2.0 and Gate 3.0.

---

## Gate 1.5 — Auth Hardening (immediate priority)

These items must be verified or implemented before the app is shared with anyone,
even informally. Most are verifications of already-delivered work.

### 1.5-A: BYPASS_AUTH disabled in all non-local environments ⚠️

**Current state:** `BYPASS_AUTH=true` in `.env.local`. The middleware creates a hardcoded
test user (`test-user-000...`) when this flag is set. If this value were present in a
deployed environment, every request would be attributed to that fake user — bypassing
all auth entirely.

**Required:**
- [ ] `.env.example` must document `BYPASS_AUTH=false` as the production default, with an
  explicit warning that `true` is local dev only
- [ ] Any deployment checklist / runbook must include: verify `BYPASS_AUTH` is unset or `false`
- [ ] Consider: add a startup warning to `server.ts` that logs loudly if `BYPASS_AUTH=true`
  and `NODE_ENV !== 'development'`

**Owner:** Backend
**Effort:** Small — doc + one console.warn guard

---

### 1.5-B: Clerk auth is enforced end-to-end ✓ (verify)

**Current state:** `requireAuth` is mounted at `app.use('/api/', requireAuth)` in `server.ts`.
All API routes are covered. JWT verification via Clerk JWKS.

**Required:**
- [ ] Verify: `GET /api/trips` with no Authorization header returns 401 (not 200)
- [ ] Verify: `GET /api/trips` with an expired/invalid JWT returns 401
- [ ] Verify: `BYPASS_AUTH=false` in `.env.test` (contract tests should run real auth path
  via `server-test-app.ts` — confirm this is already the case)

**Owner:** QA / COO
**Effort:** Spot-check — 10 minutes

---

### 1.5-C: Ownership checks — trip/place/item routes ✓ (verify)

**Current state:** `userId` is threaded through all trips, places, items, cities, and
trip-countries routes. Every query scopes to the authenticated user's ID.

**Required:**
- [ ] Verify: User A cannot read User B's trip via `GET /api/trips/:id` (returns 404, not 403 — trip simply doesn't exist for that user)
- [ ] Verify: User A cannot delete User B's item via `DELETE /api/trips/:id/items/:itemId`
- [ ] Verify: User A cannot add a place to User B's trip

This can be tested manually with two separate Clerk accounts or two valid JWTs.

**Owner:** QA
**Effort:** Small — IDOR spot-check with two test users

---

### 1.5-D: Admin routes — global data, not per-user ⚠️ (decision required)

**Current state:** Admin routes (`/api/admin/*` — categories, activities, companions,
country/region config) are auth-gated but have no per-user ownership. Any authenticated
user can create, rename, or deactivate categories, activities, and companions.

**The question:** Is admin data global (shared across all users) or per-user?

- **If global:** Any authenticated user can modify the admin lists. Acceptable if all
  users are trusted (e.g. the owner + one trusted companion). Needs no code change.
- **If per-user:** Each user has their own categories/activities/companions. Requires
  a schema change (add `user_id` to admin tables) and query scoping — significant work.
- **If owner-only:** Only the account that created the data can modify admin settings.
  Requires either a role claim from Clerk or a simple `is_owner` flag on the user record.

**PO decision required** before this can be implemented. Current recommendation:
treat admin as **owner-only** — only the primary account can modify global settings.
Other users (companions) get read-only access to admin lists when selecting categories etc.

**Owner:** PO decision → Architect spec → Backend implementation
**Effort:** Medium if owner-only (role check); Large if per-user (schema migration)

---

### 1.5-E: `geo/` static files — no auth required (accepted risk)

**Current state:** `app.use('/geo', express.static(...))` serves GeoJSON files without
authentication. These are public geographic data (country/region boundaries) — not
user data. No ownership model makes sense here.

**Decision:** Accepted as-is. GeoJSON files contain no personal data.

---

## Gate 2.0 — Hosted Deployment

These items must be in place before any deployment to a server accessible over a network.
Not required for local-only sharing via localhost.

### 2.0-A: HTTPS / TLS ⛔ (open — blocks hosted deployment)

**Current state:** No TLS. HTTP only on localhost:3001.

**Required:**
- TLS terminated at a reverse proxy (nginx, Caddy, or cloud load balancer)
- HTTP → HTTPS redirect on port 80
- TLS 1.2 minimum, TLS 1.3 preferred
- HSTS header already set by Helmet — verify it works end-to-end

**Owner:** Architect (infrastructure spec) → COO (deployment)
**Effort:** Depends on hosting platform. Caddy makes this near-zero; cloud varies.

---

### 2.0-B: Trust proxy configuration ⛔ (open)

**Current state:** `app.set('trust proxy', ...)` not configured. Rate limiter and
IP-based controls will see the proxy IP, not the real client IP, behind a reverse proxy.

**Required:**
```typescript
app.set('trust proxy', 1); // trust first proxy hop
```

Add when deploying behind nginx/Caddy/load balancer.

**Owner:** Backend
**Effort:** One line

---

### 2.0-C: CORS locked to production domain ⛔ (open)

**Current state:** `ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3001` in `.env.local`.

**Required:** In production `.env`, set `ALLOWED_ORIGINS` to the actual deployed domain only.
No wildcards. Remove localhost from the production allow list.

**Owner:** COO (deployment config)
**Effort:** Config-only — no code change

---

### 2.0-D: Rate limits tightened for multi-user ⚠️ (review)

**Current state:** 300 req/min globally (single-user generous setting).

**Required for hosted:**
- General API: ~60 req/min per IP
- Write endpoints (POST/PATCH/DELETE): ~20 req/min per IP
- Auth-related (if any): ~5 attempts per 15 min per IP

**Owner:** Backend
**Effort:** Config-only in `server.ts`

---

### 2.0-E: Audit logging ⛔ (not implemented)

**Current state:** No audit log. Errors are logged but write operations are not.

**Required for hosted:** Log all POST/PATCH/DELETE with timestamp, method, path,
status code, and userId. Do not log request/response bodies.

**Owner:** Backend
**Effort:** Small — structured logger middleware

---

### 2.0-F: Secrets not in environment files ⛔ (review for production)

**Current state:** `.env.local` holds Clerk keys and DB path. Gitignored. Fine for dev.

**Required for hosted:** Clerk secret key and any DB credentials must be in a secrets
manager (platform secret store, not a `.env` file on disk).

**Owner:** COO (infrastructure decision)
**Effort:** Platform-dependent

---

### 2.0-G: DAST scan before launch ⛔ (not done)

Run OWASP ZAP or Burp Suite Community against the staging environment.
Minimum scope: all `/api/` endpoints, auth endpoints, any URL/file reference inputs.
All HIGH findings must be resolved before launch. MEDIUM reviewed by COO.

**Owner:** QA
**Effort:** Half-day setup + review

---

## Gate 3.0 — Companion Access

These items must be in place before a second user has their own data in the system.
Full spec is in `security-spec.md` §Phase 3 Security Requirements.

### Summary of Gate 3.0 items

- [ ] Ownership-based access control (ABAC) — every resource has `owner_id`, all reads/writes check it in middleware
- [ ] Admin data model decision resolved (1.5-D above) — must be settled before companion model works
- [ ] Companion roles (`read-only`, `edit`) enforced per-request in middleware, not frontend routing
- [ ] Secure invite flow — time-limited single-use token
- [ ] Rate limiting switched from per-IP to per-authenticated-user
- [ ] Privilege escalation testing (User A cannot read/modify User B's data)
- [ ] Second independent penetration test before launch

**Owner:** Architect spec required before any implementation begins.

---

## Security Backlog Updates

The following items in `security-backlog.md` need updating to reflect current state:

| ID | Old status | New status | Reason |
|---|---|---|---|
| H1 | OPEN | DONE | Clerk JWT auth implemented (issues #1–4, merged 2026-03-20) |
| H2 | OPEN | OPEN | Still required for hosted deployment (Gate 2.0-A) |
| M3 | OPEN | OPEN | Still required for reverse proxy deployment (Gate 2.0-B) |
| L1 | Design input | OPEN — decision required | Admin RBAC: PO must decide global vs per-user vs owner-only (Gate 1.5-D) |

---

## Open Questions for PO

1. **Admin data model (1.5-D):** Should categories, activities, and companions be:
   - Global (any authenticated user can manage them)?
   - Owner-only (only the primary account can modify)?
   - Per-user (each user has their own isolated lists)?

2. **Gate 1.5 timeline:** Is the intention to share access soon (i.e. Gate 1.5 is
   urgent), or is this speculative planning for later?

3. **Hosting platform:** Do you have a preferred platform in mind for Gate 2.0?
   (Affects TLS approach, secrets management, trust proxy config.)

---

## Checklist Summary

### Gate 1.5 — Auth Hardening
- [ ] 1.5-A: BYPASS_AUTH guard + .env.example warning
- [ ] 1.5-B: Auth enforcement verified (spot-check)
- [ ] 1.5-C: IDOR spot-check with two test users
- [ ] **1.5-D: PO decision on admin data model** ← blocking

### Gate 2.0 — Hosted Deployment
- [ ] 2.0-A: TLS / HTTPS (Architect spec required)
- [ ] 2.0-B: Trust proxy config
- [ ] 2.0-C: CORS locked to production domain
- [ ] 2.0-D: Rate limits tightened
- [ ] 2.0-E: Audit logging
- [ ] 2.0-F: Secrets in secret manager
- [ ] 2.0-G: DAST scan

### Gate 3.0 — Companion Access
- [ ] Full ABAC ownership model
- [ ] Admin data model resolved (from 1.5-D)
- [ ] Companion roles + invite flow
- [ ] Second pentest
