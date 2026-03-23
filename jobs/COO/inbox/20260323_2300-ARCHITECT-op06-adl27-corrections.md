# Completion Report: ADL-27 + OP-06 Corrections

**From:** Architect
**To:** COO
**Date:** 2026-03-23
**Re:** ADL-27 and OP-06 Hardening Checklist — correction brief response
**Branch:** `chore/op06-adl27-corrections`

---

All four issues from the correction brief have been addressed. Documents updated:

- `/workspace/jobs/architect/tech/ADL-27-admin-role-model.md`
- `/workspace/jobs/architect/tech/OP-06-hardening-checklist.md`

---

## Changes made

### Blocker 1 — ADL-27: First-login lockout (RESOLVED)

**File:** `ADL-27-admin-role-model.md`

Added a new `findOrCreateByClerkId — owner flag at user creation` subsection in the
Implementation section. Key spec:

```typescript
const isOwner = clerkId === process.env.OWNER_CLERK_ID ? 1 : 0;
// INSERT INTO users (..., is_owner) VALUES (..., isOwner)
```

`findOrCreateByClerkId` is now the **primary** owner assignment. When creating a new user
row, the function must check `clerkId === process.env.OWNER_CLERK_ID` and set `is_owner = 1`
if it matches. This ensures the owner is never locked out on a fresh DB.

The startup `setOwner` pass is redefined as a **reconciliation/drift-correction pass only**,
not the primary mechanism. Rationale for the dual mechanism (primary + reconciliation) is
documented inline.

The Rationale section was also updated to document the first-login lockout bug explicitly,
linking it to the implementation fix.

---

### Blocker 2 — ADL-27 vs HC-04 route list inconsistency (RESOLVED)

**File:** `ADL-27-admin-role-model.md`

Replaced the prior write-only route list with a complete route list covering all GET,
POST, PATCH, and DELETE routes on `adminRouter`. Added explicit spec:

> `requireOwner` must be applied at the **`adminRouter` level** — one `router.use(requireOwner)`
> call at the top of the admin router, not per-handler.

Routes outside `adminRouter` that also require `requireOwner` are listed separately:
`GET /api/map/shading`, `PATCH /api/map/shading/:stateKey`, `POST /api/cities`.

Consistency note with HC-04 is explicit: GETs on companion names and shading config are
owner-private per AD-07/AD-08 and must be protected. Future route additions on `adminRouter`
are automatically covered by the router-level guard.

---

### Gap 3 — HC-02: Concrete env var values (RESOLVED)

**File:** `OP-06-hardening-checklist.md`

Expanded the HC-02 Remediation section with:

- **`CLERK_ISSUER=https://just-raptor-89.clerk.accounts.dev`** — format explanation
  (always `https://<instance-slug>.clerk.accounts.dev` for Clerk-hosted instances).

- **`CLERK_AUDIENCE`** — documented as the Clerk Frontend API URL, most likely
  `https://just-raptor-89.clerk.accounts.dev` for this instance, but with an explicit
  instruction for the Backend agent to verify the actual `aud` claim value by decoding
  a real Clerk JWT and cross-checking the Clerk Dashboard JWT template. The `aud` value
  can vary by Clerk configuration and must be confirmed before implementation.

- **BYPASS_AUTH behaviour** — clarified that `jwtVerify` is never called under
  `BYPASS_AUTH=true`, so `CLERK_ISSUER` and `CLERK_AUDIENCE` are not read during contract
  test sessions. Contract tests are unaffected.

Two additional verification steps added: contract test for mismatched `aud`, and code
review confirming BYPASS_AUTH short-circuit runs before `jwtVerify`.

---

### Gap 4 — HC-07b: Backfill SQL (RESOLVED)

**File:** `OP-06-hardening-checklist.md`

Replaced the vague "retrieve it from the users table" note with a three-step structured
remediation:

**Step 1 — Audit SQL** (unchanged from original)

**Step 2 — Backfill SQL** (new — concrete SQL for all three tables):
```sql
UPDATE trips
SET user_id = (SELECT id FROM users WHERE clerk_id = '<OWNER_CLERK_ID>')
WHERE user_id IS NULL;

UPDATE trip_places
SET user_id = (SELECT id FROM users WHERE clerk_id = '<OWNER_CLERK_ID>')
WHERE user_id IS NULL;

UPDATE items
SET user_id = (SELECT id FROM users WHERE clerk_id = '<OWNER_CLERK_ID>')
WHERE user_id IS NULL;
```

**Step 3 — Post-backfill verification** (new): re-run the audit query and confirm all
three counts return 0 before proceeding to HC-07c. Explicit warning: do not apply the
NOT NULL migration while any null-owned records remain.

---

### Minor — HC-07c: Verification step for generated migration SQL (RESOLVED)

**File:** `OP-06-hardening-checklist.md`

Extended the HC-07c Verification section to include a review step before `db:migrate`:

> After running `db:generate`, review the generated migration file in
> `src/backend/migrations/` before running `db:migrate`. Confirm the migration contains
> the expected `ALTER TABLE` statements for trips, trip_places, and items — and nothing
> else. Given the known drizzle-kit patch history (ADL-15, patches/drizzle-kit+0.31.9.patch),
> verify the generated SQL does not include unintended table recreations, duplicate index
> creation, or truncated CHECK constraints.

---

## Confirmation: all four gaps addressed

| # | Gap | Status |
|---|-----|--------|
| Blocker 1 | ADL-27 first-login lockout | ADDRESSED |
| Blocker 2 | ADL-27 vs HC-04 route list inconsistency | ADDRESSED |
| Gap 3 | HC-02 concrete env var values | ADDRESSED |
| Gap 4 | HC-07b backfill SQL | ADDRESSED |
| Minor | HC-07c migration SQL review step | ADDRESSED |

---

## PR

PR number to be added once opened.
