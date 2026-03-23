# ADL-27 — Admin Panel Role Model

**Date:** 2026-03-23
**Status:** Decided
**Tracker:** OP-06, NR-14
**Prerequisite for:** HC-04, HC-05, HC-06 (OP-06 hardening checklist)

---

## Context

The app is single-owner today. NR-14 requires that admin panel writes (and city creation)
be restricted to the owner before any non-owner user accesses the app.

The question is: how is "owner" status determined and enforced at the application layer?

Three options were considered.

---

## Options considered

### Option A — First-registered user is the owner (implicit)

The first user to authenticate becomes the owner, identified by a flag in the users table
(`is_owner: integer, default 0`). Set to 1 for the first user during `findOrCreateByClerkId`.

**Pros:** Simple. No environment variable or config required. Works correctly in prod
(owner is always already registered before NR-14 opens access to others).

**Cons:** If the owner resets auth or the test user is seeded first (`BYPASS_AUTH=true`),
the bypass test user becomes the owner. This is a correctness risk in dev/CI.

### Option B — Owner determined by env var (OWNER_USER_ID)

Set `OWNER_USER_ID=<clerk-id>` in `.env.local`. The middleware `requireOwner` checks
`req.user.clerkId === process.env.OWNER_USER_ID`.

**Pros:** Explicit, auditable, not coupled to registration order. Easy to change.
Works regardless of test user seeding.

**Cons:** Requires a manual config step (add env var). No DB enforcement — if env var
is missing, owner check falls back to rejecting everyone or a misconfigured permissive state.

### Option C — is_owner column, set during initial seed / admin setup flow

Add `isOwner: integer` to the users table. Owner is set to 1 only for the user with
the Clerk ID matching `OWNER_CLERK_ID` env var at server startup.

**Pros:** DB-enforced. The middleware checks `req.user.id` against the DB record, not
just the env var comparison. Survives env var misconfiguration because the DB record
is the authoritative source after initial seeding.

**Cons:** More complex. Requires schema migration. Startup logic must set `is_owner = 1`
on the correct user and `is_owner = 0` on all others.

---

## Decision

**Option C — `is_owner` column on the users table, seeded from `OWNER_CLERK_ID` env var.**

### Rationale

1. **DB enforcement is primary.** Option B relies entirely on an in-memory env var comparison
   per request. Option C seeds the owner flag once at startup and enforces it via a DB lookup
   that is already performed during auth (`findOrCreateByClerkId` returns the user row, which
   now includes `is_owner`). No extra query required.

2. **Survives mis-configuration.** If `OWNER_CLERK_ID` is not set or wrong, startup should
   warn but proceed — there is simply no owner in the DB, and all admin routes return 403.
   This is a safe failure mode (lockout, not escalation).

   **First-login safety:** The startup `setOwner` call only works if a user row already
   exists for the owner's clerkId. On a fresh DB, no such row exists at startup time, so
   the UPDATE hits 0 rows silently. The owner then authenticates, `findOrCreateByClerkId`
   creates them with `is_owner = 0` (default), and they receive 403 on every admin route.
   This is the first-login lockout bug. The fix is to set `is_owner = 1` directly in
   `findOrCreateByClerkId` when `clerkId === process.env.OWNER_CLERK_ID` (see Implementation
   section). The startup reconciliation pass remains as defence-in-depth only.

3. **Compatible with mobile (NF-06).** The owner flag lives in the database, not in a
   frontend session — it works identically for a Clerk-authenticated iOS client.

4. **BYPASS_AUTH safety.** When `BYPASS_AUTH=true`, the test user UUID is hardcoded. The
   test user will NOT have `is_owner = 1` unless the test explicitly seeds it. Contract
   tests that test admin writes can seed the flag; tests that verify non-owner rejection
   do not. This is correct and testable.

---

## Implementation

### Schema change

```typescript
// users table — add isOwner column
isOwner: integer('is_owner').notNull().default(0),
```

Migration: `ALTER TABLE users ADD is_owner integer NOT NULL DEFAULT 0`

### Env var

`OWNER_CLERK_ID=<clerk-user-id-string>` — set in `.env.local`, documented in
`.env.local.example`. Must match the Clerk user ID of the app owner.

### findOrCreateByClerkId — owner flag at user creation

`findOrCreateByClerkId` is the primary place where owner status is set. When creating a
new user row, the function must check whether the inbound `clerkId` matches
`OWNER_CLERK_ID`:

```typescript
const isOwner = clerkId === process.env.OWNER_CLERK_ID ? 1 : 0;
// INSERT INTO users (..., is_owner) VALUES (..., isOwner)
```

This ensures that even on a fresh DB (no pre-existing user row), the owner's first login
creates their row with `is_owner = 1`. The owner is never locked out regardless of DB state.

### Startup sequence

After user seeding in `startup()`, run `setOwner` as a **reconciliation pass**:

```typescript
if (process.env.OWNER_CLERK_ID) {
  await userRepository.setOwner(process.env.OWNER_CLERK_ID);
} else {
  console.warn('[SECURITY] OWNER_CLERK_ID is not set — no admin owner configured.');
}
```

`setOwner` sets `is_owner = 1` for the matching clerkId, `is_owner = 0` for all others.
This is idempotent and re-runs safely on every restart.

**Rationale for dual mechanism:** `findOrCreateByClerkId` is the primary assignment — it
handles the fresh-DB case where the owner authenticates before the startup reconciliation
has had any effect. The startup `setOwner` pass is defence-in-depth: it corrects any drift
(e.g. manual DB edits, test data left from BYPASS_AUTH sessions, or `OWNER_CLERK_ID` being
changed after initial deployment). Neither mechanism is redundant — both must be implemented.

### Middleware

```typescript
export function requireOwner(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || req.user.isOwner !== 1) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  next();
}
```

`req.user` must be augmented to include `isOwner: number` (set in `requireAuth` from
the user DB row).

### Routes to protect with requireOwner

`requireOwner` must be applied at the **`adminRouter` level** — one `router.use(requireOwner)`
call at the top of the admin router, not per-handler. This ensures every current and future
route on that router is automatically protected without requiring per-handler discipline.

Routes protected by this router-level guard (all GET, POST, PATCH, DELETE):

- `GET /api/admin/categories`
- `POST /api/admin/categories`
- `PATCH /api/admin/categories/:id`
- `DELETE /api/admin/categories/:id`
- `GET /api/admin/activities`
- `POST /api/admin/activities`
- `PATCH /api/admin/activities/:id`
- `DELETE /api/admin/activities/:id`
- `GET /api/admin/companions`
- `POST /api/admin/companions`
- `PATCH /api/admin/companions/:id`
- `DELETE /api/admin/companions/:id`
- `GET /api/admin/countries`
- `PATCH /api/admin/countries/:code`
- `GET /api/admin/regions`
- `POST /api/admin/regions`
- `PATCH /api/admin/regions/:id`
- `DELETE /api/admin/regions/:id`

Routes outside `adminRouter` that also require `requireOwner` (applied per-handler):

- `GET /api/map/shading` (shading config read — owner-private per AD-07)
- `PATCH /api/map/shading/:stateKey` (shading config update)
- `POST /api/cities` (city creation — pollutes global seed)

**Consistency with HC-04:** HC-04 requires all admin routes including GETs to be
owner-only for NR-14. Companion names and shading colour configuration are personally
identifiable / personalised (AD-07, AD-08). Applying `requireOwner` at the router level
ensures no GET route can be missed. If a future brief proposes opening specific read routes
to non-owner authenticated users, that requires an explicit security assessment at that
time; it cannot be decided by relaxing this ADL.

---

## Implications

- **Schema migration required** — `db:generate` + `db:migrate` for the new column.
- **`.env.local.example` update required** — document `OWNER_CLERK_ID`.
- **`req.user` type augmentation** — `isOwner: number` added to the Express `Request` extension.
- **Contract tests** — must seed `is_owner = 1` for tests that require owner access; leave
  unset for tests verifying non-owner rejection.
- **ADL-16 null retirement** — independent of this decision; tracked separately.

---

## What this ADL does NOT decide

- Per-user companions schema (AD-08) — separate brief when that feature is specced.
- Per-user shading config schema (AD-07) — separate brief when that feature is specced.
- Companion read access to admin data — future brief required.
