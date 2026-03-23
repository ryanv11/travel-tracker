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
   warn but proceed — there is simply no owner in the DB, and all admin writes return 403.
   This is a safe failure mode (lockout, not escalation).

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

### Startup sequence

After user seeding in `startup()`:

```typescript
if (process.env.OWNER_CLERK_ID) {
  await userRepository.setOwner(process.env.OWNER_CLERK_ID);
} else {
  console.warn('[SECURITY] OWNER_CLERK_ID is not set — no admin owner configured.');
}
```

`setOwner` sets `is_owner = 1` for the matching clerkId, `is_owner = 0` for all others.
This is idempotent and re-runs safely on every restart.

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

- `POST /api/admin/*` (all admin writes)
- `PATCH /api/admin/*`
- `DELETE /api/admin/*`
- `PATCH /api/map/shading/:stateKey` (shading config update)
- `PATCH /api/admin/countries/:code`
- `POST /api/admin/regions`
- `PATCH /api/admin/regions/:id`
- `POST /api/cities` (city creation)

All admin routes — reads and writes — require `requireOwner` for NR-14. This includes
all GET routes. See OP-06 HC-04 for the accepted-risk rationale. If a future brief
proposes opening specific read routes to non-owner authenticated users, that requires
an explicit security assessment at that time; it cannot be decided by relaxing this ADL.

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
