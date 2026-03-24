# ADL-28 — Per-User Map Shading Config and Companions

**Date:** 2026-03-23
**Status:** Decided
**BRD refs:** AD-07 (map shading per-user), AD-08 (companions per-user), AD-09 (categories/activities global)
**Depends on:** ADL-27 (is_owner column, requireOwner middleware)
**Prerequisite for:** Backend implementation of AD-07, AD-08

---

## Context

AD-07 and AD-08 require that map shading configuration and companions become per-user rather
than global. Currently both tables are global (no `userId` column) and protected by
`requireOwner` middleware — only the app owner can read or write them.

The per-user split means any authenticated user manages their own shading colours and their
own companions list. The `requireOwner` guard is replaced by `req.user.id` scoping at the
data layer.

A third requirement, AD-09, confirms that trip categories and activities remain global seeded
defaults. This ADL confirms AD-09 is unaffected.

---

## Current state

**`map_shading_config`** — `state_key` (PK), `display_name`, `color_hex`, `updated_at`.
6 rows (one per known shading state). No userId. Protected by `requireOwner`.

**`companions`** — `id` (PK, autoincrement), `name` (UNIQUE), `is_active`, `created_at`,
`updated_at`. Arbitrary rows. No userId. Protected by `requireOwner`.

**`trip_companions_map`** — junction: `trip_id` FK → `trips.id`, `companion_id` FK →
`companions.id`. A companion is attached to a trip via this table.

**`trips`** — already userId-scoped (`user_id` column, required). Companion references inside
a trip therefore derive ownership via the trip's `user_id`.

**`users`** — `id` (UUID v4 PK), `clerk_id`, `is_owner`.

---

## Question 1: Schema approach for `map_shading_config` (AD-07)

### Options considered

**Option A — Add `userId` FK to the existing `map_shading_config` table**

Change the PK to `(state_key, user_id)`. Each user has 6 rows. All 6 must be written when
a new user is created (either eagerly on first login or lazily on first config access).

- Row count: 6 × N users. At 1,000 users → 6,000 rows.
- Pro: Simple uniform query — `WHERE state_key = ? AND user_id = ?` everywhere.
- Pro: No fallback logic. Each user's config is fully explicit.
- Con: Requires seeding 6 rows on user creation or lazy insertion on first access.
- Con: Startup seed logic becomes more complex (must create default rows per user).

**Option B — Sparse override table with global defaults as fallback**

Keep the existing `map_shading_config` as the global defaults table. Add a new
`user_shading_config` table for per-user overrides. Query logic: try `user_shading_config`
first, fall back to `map_shading_config` global defaults.

- Row count: only rows where user deviates from defaults. Most users → 0 rows.
- Pro: Efficient storage. Users who never customise have zero config rows.
- Pro: Global defaults can be updated by the owner and all non-overriding users see them.
- Con: More complex query logic (LEFT JOIN + COALESCE or application-layer fallback).
- Con: Global defaults concept creates an unexpected coupling — owner changes to global
  defaults would silently affect all users who haven't overridden that state key.
- Con: The notion of "global defaults" is already embodied in the seed data. The owner
  is just the first user, and their config should be no more authoritative than anyone else's.

### Decision: Option A — `userId` FK on `map_shading_config`, composite PK

**Rationale:**

1. The 6-row × N-user scale is negligible. Even at 10,000 users → 60,000 rows. SQLite
   handles this trivially; libSQL handles it for production.

2. Option B's global-defaults coupling is architecturally problematic. If the owner changes
   a global default, it retroactively affects every user who hasn't overridden that state key,
   which violates AD-07's isolation guarantee. Option A has no such coupling.

3. Lazy seeding (seed 6 rows on first access to `/api/map/shading/config` when no rows exist
   for the user) avoids the cost of seeding on every user creation. The default seed data is
   hardcoded application constants — no DB query needed to initialise them.

4. Query simplicity. Every shading query is `WHERE user_id = ?` — no COALESCE or fallback.

### New schema for `map_shading_config`

The current `stateKey` singleton PK becomes a composite PK of `(state_key, user_id)`.

```typescript
export const mapShadingConfig = sqliteTable(
  'map_shading_config',
  {
    stateKey: text('state_key').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    displayName: text('display_name').notNull(),
    colorHex: text('color_hex').notNull(),
    updatedAt: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
  },
  (t) => [
    primaryKey({ columns: [t.stateKey, t.userId] }),
    index('idx_map_shading_user').on(t.userId),
    check(
      'chk_map_shading_state_key',
      sql`${t.stateKey} IN ('active', 'planned', 'visited_once', 'visited_once_planning', 'visited_multiple', 'visited_multiple_planning')`,
    ),
  ],
);
```

**Note:** `state_key` loses its role as the sole PK. The composite PK `(state_key, user_id)`
enforces that each user has at most one row per state key.

**Cascade on user delete:** `onDelete: 'cascade'` on `user_id` ensures that deleting a user
removes their shading config. This is correct — config is meaningless without the user.

---

## Question 2: Schema approach for `companions` (AD-08)

### Changes

Add `userId` column (FK → `users.id`) to the `companions` table.

The existing UNIQUE constraint on `name` must be changed to UNIQUE on `(name, user_id)` —
two different users can have a companion named "Partner".

```typescript
export const companions = sqliteTable(
  'companions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    isActive: integer('is_active').notNull().default(1),
    createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
    updatedAt: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
  },
  (t) => [
    uniqueIndex('uniq_companions_user_name').on(t.userId, t.name),
    index('idx_companions_user').on(t.userId),
    check('chk_companions_is_active', sql`${t.isActive} IN (0, 1)`),
  ],
);
```

**Cascade on user delete:** `onDelete: 'cascade'` removes companions when the user is
deleted. `trip_companions_map` already cascades on `trip_id` delete, but companions now
also cascade directly on user delete.

### Cross-user companion assignment enforcement (AD-08 complication)

Trips are already userId-scoped. `trip_companions_map` links a `trip_id` to a `companion_id`.
After AD-08, `companions.user_id` must match `trips.user_id` for any
`trip_companions_map` row.

SQLite does not support multi-table CHECK constraints or deferred cross-FK validation, so
this invariant cannot be enforced at the DB level without a trigger. The backend application
layer is the correct enforcement point.

**Enforcement rule:** When inserting into `trip_companions_map`, the backend must verify that
the companion's `user_id` matches the trip's `user_id` before inserting. This check belongs
in the trips repository's `replaceAssociations` function (or an extracted helper).

**Implementation note for Backend agent:** In `tripRepository.replaceAssociations`, before
batch-inserting companion associations, query `companions` to verify each `companionId` in
the provided list has `user_id = userId` (the calling user). Any ID that fails this check
must produce a 400 validation error — it is not a 404 (the companion may exist, but it
belongs to a different user).

The user never sees other users' companion IDs — they can only assign companions from their
own list — so in practice this cross-user assignment is an API abuse scenario, not a normal
UI path.

---

## Question 3: Migration path

### Existing data

The existing global rows must be assigned to the owner. The migration cannot know the
owner's `users.id` from the schema alone — it must look it up via `is_owner = 1`.

If no owner row exists in `users` at migration time (fresh DB), the migration produces 0
rows for shading config. The lazy-seed logic (see Repository section) handles that case
on first access.

### Migration SQL

This requires two migration files:

**Migration A** — `companions`: drop the global UNIQUE on name, add `user_id` column (NOT
NULL with a temporary default for the migration), update existing rows to the owner's id,
drop the default, rebuild UNIQUE index.

SQLite does not support `DROP INDEX` in `ALTER TABLE`, nor `ALTER COLUMN`. The standard
Drizzle/SQLite approach is table recreation:

```sql
-- Step 1: create new companions table with user_id
CREATE TABLE `companions_new` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `name` text NOT NULL,
  `is_active` integer NOT NULL DEFAULT 1,
  `created_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  `updated_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE(`user_id`, `name`),
  CHECK(`is_active` IN (0, 1))
);

-- Step 2: migrate existing rows to the owner
INSERT INTO `companions_new` (`id`, `user_id`, `name`, `is_active`, `created_at`, `updated_at`)
SELECT c.`id`, u.`id`, c.`name`, c.`is_active`, c.`created_at`, c.`updated_at`
FROM `companions` c
CROSS JOIN (SELECT `id` FROM `users` WHERE `is_owner` = 1 LIMIT 1) u;

-- Step 3: replace table
DROP TABLE `companions`;
ALTER TABLE `companions_new` RENAME TO `companions`;

-- Step 4: recreate index
CREATE INDEX `idx_companions_user` ON `companions`(`user_id`);
```

**Note on orphaned rows:** If there are existing companion rows and no owner user exists
(is_owner = 1 in users), the INSERT in Step 2 will insert 0 rows (CROSS JOIN with empty
set produces no output). Those existing global companion rows are abandoned. This is
acceptable — they were placeholder data before the per-user model existed. A backfill
script can recover them if needed, but this scenario only arises in development; in
production the owner will always exist before non-owner data is significant.

**Migration B** — `map_shading_config`: drop the single-column PK, add `user_id` column,
rebuild as composite PK.

```sql
-- Step 1: create new map_shading_config table with composite PK
CREATE TABLE `map_shading_config_new` (
  `state_key` text NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `display_name` text NOT NULL,
  `color_hex` text NOT NULL,
  `updated_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY(`state_key`, `user_id`),
  CHECK(`state_key` IN ('active', 'planned', 'visited_once', 'visited_once_planning', 'visited_multiple', 'visited_multiple_planning'))
);

-- Step 2: migrate existing rows to the owner
INSERT INTO `map_shading_config_new` (`state_key`, `user_id`, `display_name`, `color_hex`, `updated_at`)
SELECT m.`state_key`, u.`id`, m.`display_name`, m.`color_hex`, m.`updated_at`
FROM `map_shading_config` m
CROSS JOIN (SELECT `id` FROM `users` WHERE `is_owner` = 1 LIMIT 1) u;

-- Step 3: replace table
DROP TABLE `map_shading_config`;
ALTER TABLE `map_shading_config_new` RENAME TO `map_shading_config`;

-- Step 4: recreate index
CREATE INDEX `idx_map_shading_user` ON `map_shading_config`(`user_id`);
```

**Same note applies:** If no owner row exists, 0 rows are migrated. Lazy-seed handles it.

Both migrations are generated via `npm run db:generate` after updating `schema.ts`, then
applied via `npm run db:migrate`. The SQL above describes the logical intent — the
actual generated SQL from Drizzle will produce equivalent table recreations automatically.

---

## Question 4: Access control changes

### Current state

`requireOwner` guards all companion and shading config routes:
- `adminRouter.use(requireOwner)` at the router level covers all `/api/admin/*` routes,
  including `/api/admin/companions`.
- `requireOwner` per-handler covers `/api/map/shading/config` (GET and PATCH).

### New access pattern

With per-user data, any authenticated user should be able to manage their own companions
and shading config. `requireOwner` is replaced by user-id scoping at the data layer.

**Rule:**
- `requireAuth` is sufficient for all companion and shading config endpoints.
- `req.user.id` must be passed to every repository function that touches these tables.
- The repository layer must scope all queries to `WHERE user_id = req.user.id`.
- The caller can never read or mutate another user's rows because the query predicates
  enforce isolation.

### SE-03 scope clarification

SE-03 states: "Admin operations (category, activity, companion management; map shading
config; city creation) must be restricted to the designated owner."

**AD-07 and AD-08 change the SE-03 scope for companions and shading config only.** The
BRD v2.5 explicitly introduced AD-07/08/09 as the admin split model. AD-07 and AD-08 move
companions and shading config out of the owner-only admin category. The remaining SE-03
scope after AD-07/08 is:

- Category management — still owner-only (`/api/admin/categories`)
- Activity management — still owner-only (`/api/admin/activities`)
- City creation — still owner-only (`POST /api/cities`)
- Country/region config — still owner-only

**Companions** and **map shading config** move to: any authenticated user, data-scoped by
`req.user.id`.

This is not a security regression — it is an intended architectural split per BRD §5.10.

### Route changes summary

| Route | Before | After |
|-------|--------|-------|
| `GET /api/admin/companions` | requireOwner | requireAuth + userId scope |
| `GET /api/admin/companions/active` | requireOwner | requireAuth + userId scope |
| `POST /api/admin/companions` | requireOwner | requireAuth + userId scope |
| `PATCH /api/admin/companions/:id` | requireOwner | requireAuth + userId scope |
| `DELETE /api/admin/companions/:id` | requireOwner (soft-delete) | requireAuth + userId scope |
| `GET /api/map/shading/config` | requireOwner | requireAuth + userId scope |
| `PATCH /api/map/shading/config/:stateKey` | requireOwner | requireAuth + userId scope |
| `GET /api/map/shading` | requireOwner | requireAuth + userId scope |
| `GET /api/map/shading/countries/:code` | requireAuth (no owner) | requireAuth + userId scope |
| `GET /api/map/shading/regions/:code` | requireAuth (no owner) | requireAuth + userId scope |

**Companion route relocation note:** The companion CRUD routes are currently mounted under
`/api/admin/companions` via `adminRouter`. Since companions are no longer owner-only, the
Backend agent should consider whether to:
- (a) Keep the routes at `/api/admin/companions` but lift `requireOwner` from those
  specific routes while leaving the router-level guard in place for others, or
- (b) Move companion routes to a new `/api/companions` router.

**Recommendation: option (b)** — move to `/api/companions`. Keeping companions under
`/api/admin/` when they are no longer an admin-only resource is misleading to API consumers
and creates a guard-bypass footgun (the router-level `requireOwner` must be explicitly
worked around). A new router is cleaner, avoids the footgun, and better represents the data
model change.

The `adminRouter` continues to mount categories, activities, and all country/region routes
under `requireOwner`. Companions route is extracted.

---

## Question 5: AD-09 interaction

AD-09 states: "Trip categories and activities are global seeded defaults shared across all
users. Any user can add custom entries. Entries cannot be deleted — only deactivated by the
app owner."

**`trip_categories` and `activities` tables are unaffected by this ADL.**

They retain their current schema (no `userId` column), their current UNIQUE-on-name
constraints, and their current access control:
- Owner-only: deactivate (PATCH `is_active = 0`), and currently create.
- AD-09 says any user can add custom entries — this is a future behaviour change to the
  POST handler that is independent of AD-07/08. If the COO wants to open category/activity
  creation to non-owners per AD-09, that is a separate brief.

The `adminRouter` guard for categories and activities remains `requireOwner` at the router
level.

---

## Question 6: Repository layer

### Companions repository (new: `src/backend/repositories/companions.ts`)

Create a new dedicated repository following the ADL-18 pattern established in
`tripRepository`, `userRepository`, etc.

```typescript
export const companionRepository = {
  /** Returns all companions owned by userId (active + inactive). */
  async findAll(userId: string): Promise<Companion[]>

  /** Returns only active companions for userId. */
  async findActive(userId: string): Promise<Companion[]>

  /** Returns a single companion by id, only if owned by userId. */
  async findById(userId: string, id: number): Promise<Companion | null>

  /** Creates a new companion for userId. */
  async create(userId: string, name: string): Promise<Companion>

  /** Updates name or is_active for a companion owned by userId. */
  async update(userId: string, id: number, data: { name?: string; isActive?: number }): Promise<Companion | null>

  /** Soft-deletes (sets is_active = 0) a companion owned by userId. */
  async deactivate(userId: string, id: number): Promise<Companion | null>

  /**
   * Validates that all companionIds belong to userId.
   * Returns the set of invalid IDs (belongs to a different user or does not exist).
   * Called by tripRepository.replaceAssociations before inserting trip_companions_map rows.
   */
  async validateOwnership(userId: string, companionIds: number[]): Promise<number[]>
}
```

All functions scope to `WHERE companions.user_id = userId`. The `validateOwnership` function
is the cross-user guard for `trip_companions_map` inserts.

### Map shading config repository (new: `src/backend/repositories/shadingConfig.ts`)

```typescript
/** Default seed values for the 6 shading states. */
const DEFAULT_SHADING_CONFIG: Array<{ stateKey: string; displayName: string; colorHex: string }>

export const shadingConfigRepository = {
  /**
   * Returns all 6 shading config rows for userId.
   * If no rows exist (first access), seeds defaults and returns them.
   */
  async findAll(userId: string): Promise<MapShadingConfig[]>

  /**
   * Returns a single shading config row for userId and stateKey.
   * If not found, seeds defaults for this user and retries.
   */
  async findByStateKey(userId: string, stateKey: string): Promise<MapShadingConfig | null>

  /**
   * Updates display_name and/or color_hex for a user's shading config row.
   * Returns null if stateKey does not exist for this user.
   */
  async update(userId: string, stateKey: string, data: { displayName?: string; colorHex?: string }): Promise<MapShadingConfig | null>

  /**
   * Seeds default shading config rows for userId.
   * Uses INSERT OR IGNORE — safe to call multiple times.
   */
  async seedDefaults(userId: string): Promise<void>
}
```

**Lazy seeding pattern:** `findAll` and `findByStateKey` check for 0 rows returned and call
`seedDefaults` if so. This means the first `/api/map/shading/config` request by a new user
transparently creates their 6 default rows.

### Shading service changes (`src/backend/services/shading.service.ts`)

The shading computation queries already filter by `trips.user_id` implicitly (trips are
user-scoped via `tripPlaces → trips`). However, the current queries do NOT filter — they
aggregate across all users' trips. This is a data isolation bug that AD-07 resolves.

After AD-07:
- All shading queries must accept `userId: string` and add `WHERE trips.user_id = userId`
  (or equivalent via the tripPlaces join) to every aggregate query.
- `getConfigMap()` must accept `userId: string` and scope to `WHERE user_id = userId`.
- The in-memory cache keyed by `stateKey` alone becomes keyed by `userId + stateKey` or
  per-user cache maps. The simplest approach is a `Map<string, ShadingConfigMap>` keyed
  by userId, invalidated per-user on PATCH.

The public API functions (`getAllCountryShading`, `getCountryShading`, `getRegionShading`,
`getCityShading`) must all accept `userId: string`.

Route handlers must pass `req.user!.id` to these service functions.

### Trips repository changes (`src/backend/repositories/trips.ts`)

`getAssociations` currently fetches companions without user scoping — it assumes the
`tripId` ownership has already been verified by the caller. This assumption remains valid
post-AD-08 (trip is still user-scoped), but the companion names returned are now from the
per-user companions table. No scoping change needed in `getAssociations` itself — the JOIN
on `companions` will naturally return the companion row, which now has a `user_id` column
(but that column is not surfaced in the result shape).

`replaceAssociations` must add a companion ownership validation step before inserting
`trip_companions_map` rows. It should call `companionRepository.validateOwnership(userId,
companionIds)` and throw a `ValidationError` if any companion IDs are invalid for the user.
This requires adding `userId: string` to the `replaceAssociations` signature.

---

## Migration sequence for Backend agent

1. Update `src/backend/db/schema.ts`:
   - Add `userId` column to `companions` (NOT NULL, FK → users.id, cascade delete).
   - Change `companions` UNIQUE from `name` alone to `(userId, name)`.
   - Add `userId` column to `mapShadingConfig` (NOT NULL, FK → users.id, cascade delete).
   - Change `mapShadingConfig` PK from `stateKey` alone to `(stateKey, userId)`.

2. Run `npm run db:generate` to generate migration SQL.

3. Review generated migration SQL. Drizzle will generate table recreations for both tables.
   Manually verify that the `INSERT INTO ... SELECT ... CROSS JOIN (SELECT id FROM users
   WHERE is_owner = 1 LIMIT 1)` data migration is included, or add it as an additional
   statement in the migration file.

4. Run `npm run db:migrate`.

5. Create `src/backend/repositories/companions.ts` (new file).

6. Create `src/backend/repositories/shadingConfig.ts` (new file).

7. Create `src/backend/routes/companions.ts` (new router, `requireAuth`, no `requireOwner`).

8. Update `src/backend/routes/admin.ts`:
   - Remove the `createAdminListRouter(companions, 'Companion')` registration.
   - Companions are no longer an admin resource.

9. Update `src/backend/routes/map.ts`:
   - Remove `requireOwner` from shading config and shading read routes.
   - Pass `req.user!.id` to all shading service calls.

10. Update `src/backend/services/shading.service.ts`:
    - Add `userId: string` parameter to all public functions.
    - Scope all trip aggregate queries to `WHERE trips.user_id = userId`.
    - Scope config map to `WHERE user_id = userId`.
    - Per-user cache invalidation.

11. Update `src/backend/repositories/trips.ts`:
    - `replaceAssociations`: add `userId` param, validate companion ownership before insert.

12. Register the new companions router in the main app.

13. Update type exports in `schema.ts` if needed.

14. Update backend tests: companion and shading tests must pass `userId` and seed per-user
    rows rather than global rows.

---

## Risks

**R1 — Shading query user isolation was silently absent.** The current shading service
computes trip counts across all users' trips because it joins `trips` without filtering by
`userId`. This is a data isolation bug (SE-02 violation). AD-07 fixes it as part of this
change. The Backend agent must not overlook this — it is not merely a config colour
change, it is a full trip-data isolation fix for the map.

**R2 — Cache invalidation scope.** The current `invalidateConfigCache()` is global. After
per-user config, invalidation must be per-user. If the cache is naively global-keyed,
one user's PATCH invalidates all users' caches (harmless but inefficient) or — worse — a
stale global cache serves wrong colours to a different user.

**R3 — Migration data loss on no-owner state.** If no user with `is_owner = 1` exists at
migration time (dev fresh DB), the CROSS JOIN produces 0 rows and all existing global
companion and shading rows are silently discarded. This is acceptable in dev. Document this
in the migration file comments.

**R4 — `trip_companions_map` cross-user enforcement is application-only.** SQLite cannot
enforce the cross-table ownership invariant. The `validateOwnership` check in
`replaceAssociations` is the sole guard. This must be tested explicitly.

---

## What this ADL does NOT decide

- Whether to open category/activity creation to non-owners per AD-09 — separate brief.
- Mobile (iOS) client changes — architecture is compatible; mobile work is Phase 2+.
- Bulk companion import or companion endorsements — Future Features (§9 BRD).

---

## Summary

| Table | Change |
|-------|--------|
| `map_shading_config` | Add `user_id` FK; composite PK `(state_key, user_id)`; cascade delete |
| `companions` | Add `user_id` FK; UNIQUE changes to `(user_id, name)`; cascade delete |
| `trip_companions_map` | No schema change; application-layer cross-user guard added |
| `trip_categories` | No change (AD-09: global) |
| `activities` | No change (AD-09: global) |

| Access control | Change |
|----------------|--------|
| Companion routes | Move from `/api/admin/companions` + `requireOwner` to `/api/companions` + `requireAuth` + `userId` scope |
| Shading config routes | Remove `requireOwner`; add `userId` parameter to service calls |
| Shading read routes | Remove `requireOwner`; add `userId` parameter to service calls |
| Category/activity routes | No change (remain `requireOwner` on `adminRouter`) |
| SE-03 scope | Narrowed: categories, activities, city creation, country/region config remain owner-only; companions and shading config moved to per-user |
