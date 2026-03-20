TO: BACKEND
FROM: COO
DATE: 2026-03-21 10:30
RE: NR-14 — Clerk auth middleware + users repository

---

## OVERVIEW

Implement Clerk JWT verification and user identity on the backend per ADL-20.

**Hard rule (ADL-20 seam):** The backend must NOT import any `@clerk/*` package. Authentication is done exclusively via `jose` + Clerk's JWKS endpoint. The backend is auth-provider-agnostic at the code level.

---

## ENVIRONMENT VARIABLES

These are already set in `.env.local`:

| Variable | Purpose |
|----------|---------|
| `CLERK_JWKS_URI` | `https://just-raptor-89.clerk.accounts.dev/.well-known/jwks.json` |
| `CLERK_SECRET_KEY` | Clerk secret key (available if needed for server-side Clerk API calls — not needed for JWT verify) |

---

## TASK 1 — AUTH MIDDLEWARE (`src/backend/middleware/auth.ts`)

The file already exists as a stub. Replace it with a real implementation.

**What it must do:**
1. Extract the Bearer token from the `Authorization` header
2. Verify the JWT signature using Clerk's JWKS endpoint (`CLERK_JWKS_URI`) via `jose`'s `createRemoteJWKSet` + `jwtVerify`
3. On success: extract `sub` (Clerk user ID, e.g. `user_2abc...`) and `email` from the token claims; call `userRepository.findOrCreateByClerkId()` to resolve the internal user; attach `req.user = { id, clerkId, email }` and call `next()`
4. On failure (missing token, invalid token, expired): respond `401 Unauthorized`

**jose usage pattern:**
```ts
import { createRemoteJWKSet, jwtVerify } from 'jose';

const JWKS = createRemoteJWKSet(new URL(process.env.CLERK_JWKS_URI!));

export async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { payload } = await jwtVerify(token, JWKS);
    const clerkId = payload.sub!;
    const email = payload.email as string;
    const user = await userRepository.findOrCreateByClerkId(clerkId, email);
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}
```

Check if `jose` is already in `package.json` — if not, `npm install jose`.

---

## TASK 2 — USERS REPOSITORY (`src/backend/repositories/users.ts`)

Per ADL-18, all user-scoped queries go through repositories.

```ts
export const userRepository = {
  findOrCreateByClerkId(clerkId: string, email: string): Promise<User>
}
```

**`findOrCreateByClerkId` logic:**
1. `SELECT * FROM users WHERE clerk_id = ?`
2. If found: return the user row (optionally update `email` and `updated_at` if email differs)
3. If not found: INSERT a new row with `id = uuidv4()`, `clerk_id`, `email`, `created_at = now()`, `updated_at = now()`; return the new row

Use `crypto.randomUUID()` (Node built-in) for UUID v4 generation — no extra package needed.

**Note:** The `users` table is being created by the Database agent in a parallel task. Coordinate: do not run your task until the Database migration has been applied and the `users` table exists in `schema.ts`.

---

## TASK 3 — PROTECT ALL API ROUTES

Apply `requireAuth` middleware to every `/api/*` route group in `server.ts`.

Pattern:
```ts
app.use('/api', requireAuth, tripsRouter);
app.use('/api', requireAuth, placesRouter);
// etc.
```

Or apply it once at the `/api` prefix level if the router mounting allows it.

**Exceptions (must remain public, no auth):**
- `GET /health` — health check
- `GET /api/map/state` — map shading (check with COO if this should be protected — flag in completion report if uncertain)

---

## TASK 4 — WIRE USER ID INTO ROUTE HANDLERS

Currently route handlers call `getDb()` directly (ADL-18 violation — tracked, being resolved). For this task, at minimum ensure that any route handler calling a repository passes `req.user.id` as the `userId` parameter.

If repositories don't yet accept `userId`, add it as a parameter. The WHERE clause pattern is:
```ts
db.select().from(trips).where(eq(trips.userId, userId))
```

This task is scoped to **making auth work end-to-end** — a complete ADL-18 repository migration is tracked separately. At minimum, `GET /api/trips` and `GET /api/trips/:id` must filter by `req.user.id`.

---

## DELIVERY REQUIREMENTS

1. `npm install jose` if not present
2. `src/backend/middleware/auth.ts` — real JWT verify implementation
3. `src/backend/repositories/users.ts` — `findOrCreateByClerkId`
4. All `/api/*` routes protected (except `/health`)
5. `GET /api/trips` and `GET /api/trips/:id` filter by `req.user.id`
6. `npm run test:backend` passes
7. `npm run type:check` passes

---

## COMPLETION REPORT

File to: `/workspace/jobs/COO/inbox/` using standard filename format.

Include:
- Auth middleware implemented (yes/no)
- Users repository implemented (yes/no)
- Routes protected (list any exceptions/flags)
- Whether `/api/map/state` was left public or protected (and reasoning)
- Test pass counts
- Commit hash
