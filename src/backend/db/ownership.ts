/**
 * Travel Tracker — Table ownership classification (QUAL-47, extending QUAL-43 / ADL-53)
 *
 * EVERY table defined in `schema.ts` is classified here, exactly once. This file
 * answers one question, in writing, for every table in the database:
 *
 *     "Whose data is this, and how is that expressed?"
 *
 * `scripts/scope-completeness-check.sh` CHECK 3 enforces the answer exists and is
 * consistent with the schema — a table added to `schema.ts` and not classified here
 * FAILS THE BUILD.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * THIS IS NOT AN ALLOWLIST (OP-30)
 * ────────────────────────────────────────────────────────────────────────────
 * Nothing here is exempted from scrutiny and nothing here turns a check green by
 * silencing it. An entry is a CLASSIFICATION, and the classification is what the
 * check verifies against the real schema:
 *
 *   - an `owned-by-column` entry is checked to actually carry a `user_id` foreign
 *     key into `users.id` — claiming ownership you do not have fails;
 *   - an `owned-via-parent` entry is checked to actually carry a foreign key to the
 *     `parent` it names, and that chain is walked until it terminates in an
 *     `owned-by-column` table — an unfounded claim of derived ownership fails;
 *   - a table carrying a `users.id` foreign key that is NOT `owned-by-column` must
 *     state, in `userFkNote`, what that foreign key means instead.
 *
 * Adding an entry therefore makes a claim the build tests. Deleting or weakening a
 * check because an entry is inconvenient is a scanner suppression and needs COO
 * sign-off; reclassifying a table to dodge a failure is worse, because it is a
 * claim in writing that someone will later rely on.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHY THE CLASSIFICATION COVERS EVERY TABLE, NOT ONLY THE USER-FK ONES
 * ────────────────────────────────────────────────────────────────────────────
 * Ten of this schema's user-data tables carry NO `users.id` foreign key at all —
 * the item extension tables and the junction tables own no user column and are
 * scoped through their parent (`assertOwned`/`assertWritable` in
 * `repositories/scope.ts`). A check triggered only by "carries a `users.id` FK"
 * cannot see them, so a new table of that shape would be unclassified, unscoped
 * and invisible. Classifying every table closes that by construction: the trigger
 * is "a table exists", which nothing can be added without.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * THE OWNERSHIP LIST IS DERIVED FROM THIS MANIFEST, NOT MAINTAINED BESIDE IT
 * ────────────────────────────────────────────────────────────────────────────
 * `UserOwnedTable` — the compile-time constraint on `scopeToUser` — is extracted
 * from the `owned-by-column` entries below rather than hand-written as a second
 * union. Two lists can disagree; one list cannot. "This table is in both lists" is
 * therefore not a failure this codebase can express, which is why CHECK 3 does not
 * test for it.
 */

import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import {
  activities,
  cities,
  companions,
  countries,
  itemCarRentals,
  itemExperiences,
  itemFlights,
  itemHotels,
  itemRestaurants,
  items,
  mapShadingConfig,
  regions,
  tripActivitiesMap,
  tripCategories,
  tripCategoriesMap,
  tripCompanionsMap,
  tripCountries,
  tripPlaceActivitiesMap,
  tripPlaces,
  trips,
  users,
} from './schema.js';

/**
 * Common to every entry.
 *
 * `userFkNote` is REQUIRED — enforced by CHECK 3, not by the type, because the
 * requirement depends on the schema rather than on the entry — whenever the table
 * carries a `users.id` foreign key AND is not `owned-by-column`. A user reference
 * on a table that is not user-owned-by-column always means something other than
 * ownership, and that meaning has to be stated rather than assumed by the next
 * reader. It is available on every kind so that stating it is never blocked by the
 * shape of the manifest; today only `cities` needs one.
 */
type EntryBase = { table: SQLiteTable; userFkNote?: string };

/**
 * User data whose ownership is carried by its OWN `user_id` column.
 *
 * These are the tables `scopeToUser` accepts. The column MUST be named `user_id`
 * (`userId` in Drizzle) — CHECK 1 of the scope guard finds hand-authored ownership
 * by matching that name, so an ownership column called anything else would be
 * invisible to it. CHECK 3 enforces the name.
 */
type OwnedByColumnEntry = EntryBase & { kind: 'owned-by-column' };

/**
 * User data that carries no ownership column of its own — a junction row or an
 * item extension row. Ownership is asserted through `parent` (see `assertOwned` /
 * `assertWritable`). `parent` must be a real foreign-key target of this table, and
 * the chain must terminate in an `owned-by-column` table.
 */
type OwnedViaParentEntry = EntryBase & { kind: 'owned-via-parent'; parent: SQLiteTable };

/** Not user data. Global reference data, readable by everyone. */
type GlobalReferenceEntry = EntryBase & { kind: 'global-reference'; why: string };

/** The identity table itself — the target every user foreign key points at. */
type UserIdentityEntry = EntryBase & { kind: 'user-identity'; why: string };

export type TableClassificationEntry =
  | OwnedByColumnEntry
  | OwnedViaParentEntry
  | GlobalReferenceEntry
  | UserIdentityEntry;

/**
 * The manifest. One entry per table in `schema.ts`, in schema-file order.
 *
 * ADDING A TABLE: add an entry here in the same PR. The build fails until you do,
 * and the failure names the table.
 */
export const TABLE_CLASSIFICATION = [
  // ── Geographic hierarchy — global reference data (GE-04/05/06, GE-11/12/13) ──
  {
    kind: 'global-reference',
    table: countries,
    why: 'Seeded ISO 3166-1 country list plus per-country display config. Identical for every user.',
  },
  {
    kind: 'global-reference',
    table: regions,
    why: 'Seeded state/province tier for countries that enable it. Identical for every user.',
  },
  {
    kind: 'global-reference',
    table: cities,
    why:
      'Global gazetteer. A city created on demand by one user is immediately usable by every ' +
      'other user, and city rows outlive the account that first referenced them (ADL-46 D5, GE-16).',
    userFkNote:
      'created_by_user_id is PROVENANCE, not ownership: "which account first caused this row to ' +
      'exist". It is deliberately NULLABLE (seeded and pre-column rows have no creator) and ' +
      'ON DELETE SET NULL, because deleting a user must never delete shared city rows other ' +
      "users' trips depend on. It also participates in uniq_cities_pending_per_creator so two " +
      'users can each hold their own pending row for the same place. It must never be used to ' +
      'restrict reads — doing so would hide half the gazetteer from everyone (ADL-46 §9.2).',
  },

  // ── Per-user admin lists (ADL-28 AD-07/AD-08, ADL-46 AD-09/D3) ──
  { kind: 'owned-by-column', table: tripCategories },
  { kind: 'owned-by-column', table: activities },
  { kind: 'owned-by-column', table: companions },
  { kind: 'owned-by-column', table: mapShadingConfig },

  // ── Trips and their junctions ──
  { kind: 'owned-by-column', table: trips },
  { kind: 'owned-via-parent', table: tripCategoriesMap, parent: trips },
  { kind: 'owned-via-parent', table: tripCompanionsMap, parent: trips },
  { kind: 'owned-via-parent', table: tripActivitiesMap, parent: trips },
  { kind: 'owned-via-parent', table: tripCountries, parent: trips },

  // ── Places ──
  { kind: 'owned-by-column', table: tripPlaces },
  { kind: 'owned-via-parent', table: tripPlaceActivitiesMap, parent: tripPlaces },

  // ── Items and their per-type extension tables (ADL-11 Option B) ──
  { kind: 'owned-by-column', table: items },
  { kind: 'owned-via-parent', table: itemFlights, parent: items },
  { kind: 'owned-via-parent', table: itemHotels, parent: items },
  { kind: 'owned-via-parent', table: itemCarRentals, parent: items },
  { kind: 'owned-via-parent', table: itemRestaurants, parent: items },
  { kind: 'owned-via-parent', table: itemExperiences, parent: items },

  // ── Identity ──
  {
    kind: 'user-identity',
    table: users,
    why:
      'The identity table every user foreign key targets. Rows are reached by Clerk id in the ' +
      'auth middleware, never by a row-ownership predicate, so it is neither user-owned data ' +
      'nor global reference data.',
  },
] as const satisfies readonly TableClassificationEntry[];

/**
 * The tables `scopeToUser` accepts — derived from the manifest above, never
 * written twice. Passing a global reference table (`cities`, `countries`,
 * `regions`) is a compile error by construction, and so is passing a table whose
 * ownership is only derivable through a parent.
 */
export type UserOwnedTable = Extract<
  (typeof TABLE_CLASSIFICATION)[number],
  { kind: 'owned-by-column' }
>['table'];
