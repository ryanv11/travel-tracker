# Staging Turso Database — Seed & Reset Runbook

**Tracker:** BRD-NF09 | **BRD ref:** NF-09, NF-03 | **Architect ref:** ADL-32 §5, §9
**Author:** Database | **Date:** 2026-07-21

## 1. Scope

ADL-32 §9 assigned Database "the staging Turso database and seed strategy (`db:seed`
on creation; document a reset cadence so preview environments don't accumulate cruft)".
Ryan (PO) has already provisioned two Turso databases: `travel-tracker-prod` and
`travel-tracker-staging`. This doc does not create databases — it documents how the
staging one gets seeded on creation and kept clean over time, and records what was
verified and what remains for whoever holds the actual credentials to spot-check.

## 2. Topology recap (from ADL-32 §5)

- One shared staging Turso database, pointed at by every Railway PR preview
  environment's `SQLITE_PATH`/`TURSO_AUTH_TOKEN`. No per-PR isolation — deliberate,
  per ADL-32 (this is a solo/low-traffic project; per-PR DB isolation infra is not
  proportionate).
- Production Turso database is separate and never touched by preview environments.
- `npm run db:migrate` runs automatically before the server starts, in every hosted
  environment (production and preview), against whichever Turso instance that
  environment's env vars target (Backend's implementation, ADL-32 §9).

## 3. Verification performed this thread

No credentials for the real `travel-tracker-staging` instance exist in the sandbox
this thread ran in (Turso databases are provisioned outside this environment, and no
`TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` for staging were available to inject). Two
things were verified as substitutes, both scientifically valid because
`@libsql/client` and drizzle-kit's libSQL driver use the same code path regardless of
transport (local `file:` vs. remote `libsql://` differ only in which client
implementation is dispatched, not in query/migration semantics):

1. **`db:migrate` against a fresh empty database.** Ran `drizzle-kit migrate` against
   a brand-new, empty local libSQL file (never touched by any prior migration or
   schema). All 11 migration files (`0000`–`0010`) applied cleanly in one pass — no
   errors, no manual intervention. This is the same code path a genuinely fresh Turso
   database would go through on first deploy.
2. **`db:seed` — code-path and idempotency check.** `src/backend/db/seed.ts` goes
   through `getDb()` exactly like every other DB access in the app — it has no
   filesystem-specific assumptions (no direct file I/O, no path manipulation beyond
   what `SQLITE_PATH` already encodes). Ran it twice against the freshly-migrated
   database: first run inserted 11 trip_categories / 17 activities / 7 companions / 6
   map_shading_config rows; second run reported the same "N rows attempted" but row
   counts stayed identical (idempotent, `onConflictDoNothing()`). No changes were
   needed to `seed.ts`.
3. **Reset script functional test.** Inserted a small fixture (1 user, 1 trip, 1
   trip_place, 1 item) into the migrated+seeded database and ran the new
   `db:reset-staging` script (`src/backend/db/reset-staging.ts`) in both dry-run and
   `--yes` (live) mode. Dry run correctly reported per-table row counts with no
   deletes; live mode cleared all trip/user rows in the correct child-before-parent
   order (see script docstring) and re-seeded the admin lists, while leaving
   `countries`/`cities` (reference data, not touched by this script) intact.

**What was NOT verified (needs a credentialed spot-check):** an actual live
`libsql://` round-trip against the real `travel-tracker-staging` instance. Given (1)
and (2) above are transport-agnostic, there is no specific reason to expect different
behavior — the one thing that could differ is authentication, which is exactly why the
`drizzle.config.ts` fix in §4 below exists and was itself verified against a
(deliberately fake, unreachable) `libsql://` URL — see §4.

## 4. Fix found and made during verification: `drizzle.config.ts` had no path to a Turso auth token

While verifying `db:migrate` would work against a *remote* Turso URL (not just a local
file), a real gap surfaced: **`drizzle-kit`'s own connection (used by `db:generate` /
`db:migrate`) is separate from the app's runtime connection (`getDb()` in
`src/backend/db/index.ts`)**. ADL-32 §9 only scoped the runtime side to Backend ("add
`authToken` to the `createClient({ url, authToken })` call... in `db/index.ts`") — it
didn't mention `drizzle.config.ts`, which drizzle-kit reads independently. Without a
fix there, `db:migrate` would have no way to authenticate against a real Turso
database at all, regardless of what Backend wires into `db/index.ts`.

Two things had to change in `drizzle.config.ts` (not `db/index.ts` — out of scope for
this thread per the brief, and untouched):

1. Thread `TURSO_AUTH_TOKEN` into `dbCredentials`.
2. **`dialect` has to be `'turso'`, not `'sqlite'`, for drizzle-kit to accept an
   `authToken` credential at all.** This was caught by TypeScript, not by guesswork:
   `node_modules/drizzle-kit/index.d.ts`'s `Config` type has separate union branches
   for `dialect: 'sqlite'` (`dbCredentials: { url: string }` — no `authToken` field
   exists in this branch) and `dialect: 'turso'` (`dbCredentials: { url: string,
   authToken?: string }`). `'turso'` and `'sqlite'` are otherwise the same SQL grammar
   (both libSQL) — this is a config-surface distinction in drizzle-kit, not a schema
   or ORM dialect change, and does not touch ADL-25 (backend db typing stays
   `LibSQLDb`).

The config now picks `dialect: 'turso'` + `authToken` only when `SQLITE_PATH` starts
with `libsql://`; local `file:` dev is unaffected (`dialect: 'sqlite'`, no token).
Verified both branches: local `file:` migration ran clean (as in §3.1); a deliberately
fake `libsql://...unreachable-host` URL with a dummy token correctly selected the
`turso` dialect and attempted a real HTTP round-trip (failed with a 404 from the fake
host, as expected — proving the auth token and turso wire protocol were actually
engaged, not silently skipped).

**Action for whoever runs the first real deploy against staging:** no code change
needed beyond what's in this PR — just set `TURSO_AUTH_TOKEN` (and `SQLITE_PATH` to
the staging `libsql://` URL) in Railway's Preview environment variables, and the same
again for production with the production values. `npm run db:migrate` should then work
identically to what was verified in §3.1.

## 5. Reset cadence

### 5.1 What accumulates, and why it's low-stakes here

- **Test/UAT trip data.** Every trip, place, and item a human creates while poking at
  a preview URL (manual QA, UAT screenshots, exploratory testing) persists in the
  shared staging database indefinitely — there's no TTL or per-session cleanup.
- **Users.** `findOrCreateByClerkId` (auth middleware) provisions a `users` row on
  first sign-in against any preview. Over many previews this accumulates rows for
  whichever Clerk identities were used to test.
- **Cross-preview visibility, not corruption.** Because every open PR's preview
  points at the *same* staging database (ADL-32, deliberate — no per-PR isolation),
  if two PRs are open at once, testing one preview will show trip data created while
  testing the other. This is expected behavior, not a bug: it means "staging has
  today's test trips in it," not "staging is corrupted." The one thing that would
  turn this into real friction is if two concurrent UAT sessions used same-named test
  trips and asserted on exact row counts — practically, this hasn't been a
  documented problem, and per ADL-32's own reasoning (solo project, low traffic,
  don't over-engineer), building concurrency isolation for a hypothetical is not
  proportionate. If it does become a real friction point, revisit — the fix would be
  a naming convention for UAT test trips (e.g. a prefix), not new infrastructure.
- **Reference data does NOT accumulate cruft.** `countries`/`regions` are seeded
  once (idempotent, "insert if table empty") by `startup.service.ts` on every server
  boot, and `cities` grows only from real place names (deduplicated by the BUG-33
  unique index) — bounded by real-world geography, not test noise.

### 5.2 The reset itself

`npm run db:reset-staging` (`src/backend/db/reset-staging.ts`, new this thread):

- **Dry run by default** — prints a row count per table that *would* be deleted,
  changes nothing. Pass `--yes` to actually delete.
- **Deletes** `items` and its per-type children (`item_flights`, `item_hotels`,
  `item_car_rentals`, `item_restaurants`, `item_experiences`), `trip_places` and its
  join table, `trips` and its join tables (`trip_countries`,
  `trip_activities_map`, `trip_companions_map`, `trip_categories_map`), and `users`
  — in that explicit child-before-parent order, via Drizzle's query builder (no raw
  SQL). The order is enforced explicitly by the script rather than relying on SQLite
  `ON DELETE CASCADE` firing, because whether libSQL enforces FK constraints
  (`PRAGMA foreign_keys`) is a connection-level setting outside this script's control
  — see the script's own docstring for the full reasoning.
- **Leaves `countries`, `regions`, `cities` untouched** — reference data, not test
  cruft (see §5.1).
- **Re-seeds** `trip_categories`/`activities`/`companions`/`map_shading_config`
  immediately after clearing (same idempotent inserts as `db:seed`), rather than
  waiting on the next Railway restart's auto-seed. `users` is intentionally NOT
  re-seeded — it self-heals on next sign-in via `findOrCreateByClerkId`, no
  placeholder rows needed.
- **Guardrail against pointing this at production by mistake:** when `SQLITE_PATH` is
  a remote `libsql://` (or `https://`) URL, the script refuses to run — even with
  `--yes` — unless the URL contains the substring `"staging"`. This is a blunt
  footgun-removal check, not a security control (documented as such in the script);
  `--i-know-what-im-doing` bypasses it if the staging DB is ever renamed. Local
  `file:` URLs are exempt (low stakes, throwaway dev data).

### 5.3 When to run it

This is a solo project with a handful of PRs open at a time — a cron job or
CI-triggered reset would be overkill for the actual traffic. Proposed cadence,
proportionate to that:

1. **Before starting a UAT/QA session against a preview** where clean state actually
   matters for what's being verified (e.g. "does an empty account show the right
   empty state") — run `npm run db:reset-staging -- --yes` against that preview's
   target first. Most UAT does not need this (it's fine to test "add a trip" against
   a database that already has other trips in it).
2. **Periodically as general hygiene** — e.g. when starting a new work session after
   staging hasn't been reset in a while, or before a round of UAT that will produce
   screenshots (so screenshots don't show unrelated leftover test trips). No fixed
   interval is mandated; this is deliberately left to judgment rather than a cron
   schedule, consistent with "don't over-engineer" for a low-traffic solo project.
3. **Not required between every PR merge or every preview deploy** — the whole point
   of the shared staging DB (vs. per-PR isolation) is that this is cheap and
   low-stakes; resetting on every deploy would be solving a problem that doesn't
   exist yet.

If this cadence turns out to be wrong in practice (either too much manual toil, or
staging gets confusing often enough to need automation), that's a signal to revisit —
not to guess up front.

## 6. What's on the person who runs the first real deploy

1. Set `SQLITE_PATH`/`TURSO_AUTH_TOKEN` in Railway's Preview environment to the
   staging Turso database's credentials (never the production ones — ADL-32).
2. Confirm `npm run db:migrate` runs clean on first boot against the real staging
   instance (expected to match §3.1 exactly, given both use the identical
   `@libsql/client`/drizzle-kit code path — but flagged as unverified live in §3,
   worth a first-deploy sanity check).
3. Run `npm run db:seed` once against real staging (also self-heals via
   `startup.service.ts` on first server boot regardless, so this is belt-and-braces).
4. From here on, use `npm run db:reset-staging` per the cadence in §5.3.

## 7. Files touched this thread

- `src/backend/db/reset-staging.ts` — new, the reset script (§5.2)
- `drizzle.config.ts` — added `TURSO_AUTH_TOKEN` support + `turso` dialect branch
  for remote URLs (§4). `db/index.ts` untouched (Backend's parallel brief).
- `.env.example` — documented `TURSO_AUTH_TOKEN`
- `package.json` — added `db:reset-staging` script
- Mirrored to `jobs/database/tech/`: `drizzle.config.ts`, `reset-staging.ts`
