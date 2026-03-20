TO: COO
FROM: DATABASE
DATE: 2026-03-21 14:00
RE: NR-14 — users table + schema cleanup migration COMPLETE

---

## STATUS: COMPLETE

---

## TASK 1 — users table: DONE

Added to `src/backend/db/schema.ts`:
- `users` table with `id` (text PK, UUID v4), `clerk_id` (text, not null, unique), `email` (text, not null), `created_at` (integer timestamp), `updated_at` (integer timestamp)
- Type exports: `User`, `NewUser`

---

## TASK 2 — Removed 5 undocumented columns: DONE

Removed from schema.ts and dropped via migration:
- `trips.owner_account_id`
- `trips.subscription_id`
- `trips.created_by_account_id`
- `trip_places.created_by_account_id`
- `map_shading_config.subscription_id`

---

## MIGRATION

**Filename:** `src/backend/migrations/0002_aspiring_killraven.sql`

Migration generated cleanly via `npm run db:generate` and applied via `npm run db:migrate`. Migration tracking records for 0000 and 0001 were absent from `__drizzle_migrations` (table existed but was empty — prior migrations were applied outside the drizzle migrate workflow). Records were backfilled with correct journal timestamps before applying 0002.

---

## TEST RESULTS

Fixed inline DDL in two test files to remove the dropped columns:
- `src/backend/routes/__tests__/trips.delete.test.ts`
- `src/backend/routes/__tests__/cities.carry-forward.test.ts`

`npm run test:backend`: **141 passed, 0 failed** (5 test files)
`npm run type:check`: **clean** (0 errors)

---

## FLAGS FOR BACKEND

None. The 5 columns had no references in route handlers, services, or Zod schemas — only in the test DDL strings, which are now updated.

---

## COMMIT

`7450307` — feat(schema): NR-14 — add users table, drop 5 undocumented columns (ADL-19/ADL-20)
