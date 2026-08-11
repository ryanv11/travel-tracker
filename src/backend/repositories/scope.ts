/**
 * Travel Tracker — The userId-scoping chokepoint (ADL-53 §2, QUAL-43 Stage 0)
 *
 * This module is the SINGLE place row ownership is defined. Every ownership
 * expression in `src/backend/repositories/**` resolves through it — no
 * repository writes `eq(<table>.userId, userId)` by hand, and none re-derives
 * ownership by comparing a selected user id in JavaScript.
 *
 * The chokepoint is honestly TWO mechanisms sharing ONE definition (ADL-53 F2):
 *
 *   1. `scopeToUser` / `ownedAnd` — the ownership PREDICATE, for a table that
 *      carries its own `user_id` column. Composed into the query's WHERE / JOIN
 *      condition.
 *   2. `assertOwned` / `assertWritable` — the ownership ASSERTION, for a target
 *      that carries no `user_id` column of its own (a derived or join-table read
 *      such as `trip_place_activities_map`), or for a write gate that must reject
 *      a non-owner opaquely. It expresses ownership as an EXISTENCE CHECK routed
 *      through `scopeToUser` — never as an application-layer comparison — so both
 *      mechanisms share one definition of "owned".
 *
 * Phase-3 sharing (ADL-53 D7/§7) edits `scopeToUser` and nothing else: the
 * assertion helpers pick the change up because they call it.
 *
 * MAINTENANCE NOTE: `scripts/scope-completeness-check.sh` greps ALL of
 * `src/backend/**` (minus `__tests__`) for hand-authored ownership logic and
 * permits the predicate form ONLY in this file; the JS-comparison form is
 * permitted nowhere, including here. Widened from this directory alone by QUAL-43
 * Stage 3 and ENFORCED build-wide by Stage 5 — a residual anywhere now fails the
 * build rather than warning. It matches text, not syntax, so do not quote either
 * flagged pattern in a comment in any backend source file — reword instead
 * (OP-30: fix your own text rather than weakening the scanner).
 *
 * That grep only sees ownership columns NAMED `userId`, which made the guard
 * depend on an unwritten convention. QUAL-47 closed that: CHECK 3 of the same
 * script requires every table in `schema.ts` to be classified in
 * `db/ownership.ts`, requires each user-owned table's ownership column to be
 * named `user_id`, and requires any other table carrying a `users.id` foreign key
 * to state what that key means instead (`cities.created_by_user_id` is
 * provenance). A table this file cannot scope is now a build failure rather than
 * a silent omission.
 */

import { and, eq, type SQL } from 'drizzle-orm';
import { getDb, trips } from '../db/index.js';
import type { UserOwnedTable } from '../db/ownership.js';
import { LockError, NotFoundError } from '../errors.js';

/**
 * The user-owned tables — every table in `schema.ts` carrying a `user_id`
 * column. A table not in this union cannot be passed to `scopeToUser`, so
 * "is this table user data?" is answered once, in the type system, rather than
 * re-litigated at each call site. Passing a global reference table (`cities`,
 * `countries`, `regions`) is a compile error by construction.
 *
 * QUAL-47: this union is no longer written here. It is DERIVED from the
 * `owned-by-column` entries of `db/ownership.ts`, which classifies every table in
 * the schema and is build-enforced by CHECK 3 of the scope guard. Re-exported
 * from here because this is where callers already look for it. A table becomes
 * user-owned by being classified there — there is no second list to keep in step.
 */
export type { UserOwnedTable };

/**
 * The single ownership predicate. Phase-3 sharing changes ONLY this function
 * (`owner` → `owner OR shared-with(user, resource)`).
 */
export function scopeToUser(table: UserOwnedTable, userId: string): SQL {
  return eq(table.userId, userId);
}

/**
 * Composes the ownership predicate with caller conditions — the shape
 * repositories actually use. Ownership comes first, matching the `and(...)`
 * ordering the repositories already had.
 */
export function ownedAnd(
  table: UserOwnedTable,
  userId: string,
  ...extra: (SQL | undefined)[]
): SQL {
  return and(scopeToUser(table, userId), ...extra)!;
}

/**
 * Asserts a trip exists and is owned by `userId`.
 *
 * Ownership is an existence check composed from `scopeToUser`, so a trip owned
 * by someone else is indistinguishable from one that does not exist: both raise
 * `NotFoundError` (404, opaque per SE-05 — never 403).
 *
 * `trips` is the only owning row this assertion is needed for today: the
 * child tables that lack their own scope (`trip_place_activities_map`) hang off
 * a trip. A future owning class adds a sibling function here rather than a
 * second, independent definition of ownership elsewhere.
 */
export async function assertOwned(userId: string, tripId: number): Promise<void> {
  const db = getDb();
  const rows = await db
    .select({ id: trips.id })
    .from(trips)
    .where(and(eq(trips.id, tripId), scopeToUser(trips, userId)))
    .limit(1);
  if (!rows.length) throw new NotFoundError('Trip');
}

/**
 * Asserts a trip exists, is owned by `userId`, AND is not locked — the write
 * gate. This is `assertOwned` plus the lock check; the two are done in one
 * query rather than two so the write path costs exactly what it did before.
 *
 * Throws `NotFoundError` (404) when the trip is missing or owned by another
 * user, `LockError` (403) when it is locked. Order matters and is preserved:
 * a non-owner never learns that a trip is locked.
 */
export async function assertWritable(userId: string, tripId: number): Promise<void> {
  const db = getDb();
  const rows = await db
    .select({ status: trips.status })
    .from(trips)
    .where(and(eq(trips.id, tripId), scopeToUser(trips, userId)))
    .limit(1);
  if (!rows.length) throw new NotFoundError('Trip');
  if (rows[0].status === 'locked') throw new LockError();
}
