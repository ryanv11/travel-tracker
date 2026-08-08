# Correction Brief: ADL-27 + OP-06 Review Findings

**From:** COO
**To:** Architect
**Date:** 2026-03-23
**Re:** ADL-27 and OP-06 Hardening Checklist — COO review gaps

---

I've reviewed ADL-27 and OP-06. Four issues need resolution before Backend dispatch.
Two are blockers. Please update the affected documents and file a completion report.

---

## Blocker 1 — ADL-27: First-login lockout

The proposed `setOwner` startup logic:

```typescript
await userRepository.setOwner(process.env.OWNER_CLERK_ID);
```

Only works if the owner already has a user row. On a fresh DB or after a DB reset,
the owner hasn't authenticated yet — no row exists. The UPDATE hits 0 rows silently.
The owner then logs in, `findOrCreateByClerkId` creates them with `is_owner=0`
(default), and they get 403 on every admin route.

**Required fix:** `findOrCreateByClerkId` must set `is_owner=1` when the new clerkId
matches `OWNER_CLERK_ID`. The startup `setOwner` becomes a reconciliation/drift-correction
pass — not the primary mechanism. Update ADL-27 implementation spec and startup sequence
accordingly.

---

## Blocker 2 — ADL-27 vs HC-04 route list inconsistency

ADL-27 "Routes to protect with requireOwner" lists only write routes
(POST/PATCH/DELETE). But HC-04 explicitly requires **all admin routes including GETs**
to be owner-only — companion names, shading colours, and custom categories are
owner-private per AD-07/AD-08.

A backend agent reading ADL-27 as the implementation spec will miss the GET routes.

**Required fix:**
- Update ADL-27 route list to include all GET routes on `/api/admin/*` and
  `/api/map/shading`.
- Specify that `requireOwner` is applied at the `adminRouter` level (one line,
  not per-handler) so future route additions are automatically protected.
- Ensure ADL-27 and HC-04 are consistent.

---

## Gap 3 — HC-02: No concrete env var values

The remediation says add `CLERK_ISSUER` and `CLERK_AUDIENCE` but gives no values.
A backend agent cannot implement this without knowing what those values look like.

**Required fix:** Specify the expected format for each:
- `CLERK_ISSUER` — e.g. `https://just-raptor-89.clerk.accounts.dev`
- `CLERK_AUDIENCE` — document what Clerk sets in `aud` and where to find it
  (Clerk dashboard, JWT template, etc.)
- Note whether `BYPASS_AUTH=true` sessions should skip this validation (contract
  tests don't have real Clerk tokens).

---

## Gap 4 — HC-07b: Backfill steps underspecified

The audit SQL is provided but the backfill is not. "retrieve it from the users table
using the owner's Clerk ID" is not sufficient for a backend agent brief.

**Required fix:** Include concrete backfill SQL for all three tables:

```sql
UPDATE trips
SET user_id = (SELECT id FROM users WHERE clerk_id = '<OWNER_CLERK_ID>')
WHERE user_id IS NULL;
-- repeat for trip_places, items
```

And a post-backfill verification step: re-run the audit query and confirm all counts
return 0 before HC-07c migration is applied.

---

## Minor — HC-07c: Verification underspecified

The verification only checks that `schema.ts` shows `.notNull()`. Given the known
drizzle-kit patch history, the generated migration SQL should also be reviewed before
applying. Add a verification step: review the generated migration file and confirm
the ALTER TABLE statements are correct before running `db:migrate`.

---

## Deliverables expected

1. Updated `ADL-27-admin-role-model.md` — first-login fix, corrected route list
2. Updated `OP-06-hardening-checklist.md` — HC-02 env var values, HC-07b backfill
   SQL, HC-07c migration review step
3. Completion report in `jobs/COO/inbox/`
4. All changes committed to a branch and PR opened

