TO: DATABASE
FROM: COO
DATE: 2026-03-21 13:00
RE: NR-03 — Add user_id to trips, items, trip_places (ADL-16)

---

## OVERVIEW

ADL-16 established that `user_id` (TEXT/UUID FK) must be added to `trips`, `items`, and `trip_places` as the ownership boundary for multi-user support. This migration creates those columns.

No data migration required — columns are nullable. Existing rows will have `user_id = NULL` until a user signs in and the association is made. The repository layer (ADL-18, dispatched separately to Backend) will enforce `WHERE user_id = ?` on all queries.

---

## SCHEMA CHANGES

Add to `src/backend/db/schema.ts`:

### `trips` table
```ts
userId: text('user_id').references(() => users.id),
```
Add after existing columns, before the undocumented columns were (those are already removed).

### `items` table
```ts
userId: text('user_id').references(() => users.id),
```

### `tripPlaces` table
```ts
userId: text('user_id').references(() => users.id),
```

All three are:
- **Nullable** — existing rows have no owner yet
- **FK to `users.id`** — references the `users` table added in NR-14
- **No `notNull()`** — intentional, do not add it

Also add an index on `user_id` for each table for query performance:

```ts
// In the table index definitions (third argument to sqliteTable, or via .index())
userIdIdx: index('trips_user_id_idx').on(table.userId),
```

Check how existing indexes are defined in `schema.ts` and follow the same pattern.

---

## MIGRATION WORKFLOW

```bash
npm run db:generate   # generates migration SQL
npm run db:migrate    # applies to dev.db
```

Never use `db:push`.

---

## DELIVERY REQUIREMENTS

1. `user_id` added to `trips`, `items`, `trip_places` in `schema.ts`
2. Index on `user_id` for each of the three tables
3. Migration generated and applied cleanly
4. `npm run test:backend` passes
5. `npm run type:check` passes

---

## BRANCHING

```bash
git checkout main && git pull
git checkout -b feat/nr03-user-id-columns
git push -u origin feat/nr03-user-id-columns
gh pr create --title "feat: NR-03 — add user_id to trips, items, trip_places (#6)" \
  --body "Part 1 of ADL-18. Adds nullable user_id FK to ownership tables.\n\nRefs #6\nBRD N/A — ADL-16"
```

Note: use `Refs #6` not `Closes #6` — issue #6 covers the full ADL-18 migration including the backend repository layer, which is a separate dispatch.

---

## COMPLETION REPORT

File to: `/workspace/jobs/COO/inbox/YYYYMMDD_HHMM-DATABASE-nr03-user-id-columns.md`

Include:
- Confirmation of three tables updated + indexes added
- Migration filename
- Test pass count
- PR link
