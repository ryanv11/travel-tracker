-- HC-07b — Null userId Audit and Backfill
-- OP-06 Security Hardening Checklist, NR-14 pre-condition
-- Author: Backend agent
-- Date: 2026-03-23
--
-- Context:
--   The trips, trip_places, and items tables have nullable user_id columns.
--   This is a pre-auth migration artifact (ADL-16: NULL = no owner yet).
--   Before HC-03 (map shading scoped to a user) can be enabled, any
--   null-owned records must be backfilled to the owner's UUID. Otherwise,
--   the owner's pre-auth trips will disappear from their map when shading
--   is scoped.
--
-- Usage:
--   Replace <OWNER_CLERK_ID> with the value of OWNER_CLERK_ID from .env.local.
--   Run against the target database (dev.db for development, or the hosted
--   LibSQL/SQLite database for production).
--
--   Example (sqlite3 CLI):
--     sqlite3 dev.db < HC-07b-backfill.sql
--
--   Or pipe with substitution:
--     CLERK_ID="user_abc123"
--     sqlite3 dev.db "$(sed "s/<OWNER_CLERK_ID>/$CLERK_ID/g" HC-07b-backfill.sql)"

-- ============================================================
-- STEP 1 — AUDIT: Count null user_id rows before backfill
-- ============================================================
-- All three counts should be 0 if the system was always auth-gated.
-- Any non-zero count indicates pre-auth records that need backfilling.

SELECT 'trips' AS tbl, COUNT(*) AS null_count FROM trips WHERE user_id IS NULL
UNION ALL
SELECT 'trip_places', COUNT(*) FROM trip_places WHERE user_id IS NULL
UNION ALL
SELECT 'items', COUNT(*) FROM items WHERE user_id IS NULL;

-- ============================================================
-- STEP 2 — IDENTIFY OWNER: Look up internal UUID from Clerk ID
-- ============================================================
-- The OWNER_CLERK_ID is the `sub` claim value from the owner's Clerk JWT.
-- It is stored in .env.local as OWNER_CLERK_ID.
-- The internal users.id (UUID v4) is the authoritative application principal.
-- All ownership columns reference users.id, never the Clerk ID directly.

SELECT id AS owner_uuid
FROM users
WHERE clerk_id = '<OWNER_CLERK_ID>';

-- ============================================================
-- STEP 3 — BACKFILL: Assign null-owned rows to the owner
-- ============================================================
-- Only run these statements if Step 1 returned non-zero counts.
-- These use a correlated subquery so the OWNER_CLERK_ID substitution
-- remains the only change needed across all three statements.

UPDATE trips
SET user_id = (SELECT id FROM users WHERE clerk_id = '<OWNER_CLERK_ID>')
WHERE user_id IS NULL;

UPDATE trip_places
SET user_id = (SELECT id FROM users WHERE clerk_id = '<OWNER_CLERK_ID>')
WHERE user_id IS NULL;

UPDATE items
SET user_id = (SELECT id FROM users WHERE clerk_id = '<OWNER_CLERK_ID>')
WHERE user_id IS NULL;

-- ============================================================
-- STEP 4 — VERIFY: All counts must be 0 after backfill
-- ============================================================
-- Re-run the same audit query. If any count is non-zero, the backfill
-- did not complete successfully — investigate before proceeding.

SELECT 'trips' AS tbl, COUNT(*) AS null_count FROM trips WHERE user_id IS NULL
UNION ALL
SELECT 'trip_places', COUNT(*) FROM trip_places WHERE user_id IS NULL
UNION ALL
SELECT 'items', COUNT(*) FROM items WHERE user_id IS NULL;

-- Expected result:
-- trips       | 0
-- trip_places | 0
-- items       | 0
