/**
 * CHECK 3 of the backend scope guard — ownership classification completeness.
 * QUAL-47, extending QUAL-43 / ADL-53.
 *
 * THIS IS NOT A SECOND INSTRUMENT. It has no npm script and no CI step of its
 * own: `scripts/scope-completeness-check.sh` runs it and folds its verdict into
 * the one verdict, exactly as it does for CHECK 1 and CHECK 2. It lives in its own
 * file for one reason — it reads the schema STRUCTURALLY (Drizzle's own table
 * metadata) rather than by grepping `schema.ts`, and that requires TypeScript.
 *
 * WHY STRUCTURAL AND NOT TEXTUAL. CHECKS 1 and 2 match text because the property
 * they assert IS textual ("this string appears nowhere"). This one asserts a
 * property of the SCHEMA — which tables exist and which foreign keys they carry —
 * and a regex over `schema.ts` answers that only for as long as everyone keeps
 * writing `.references(() => users.id` on one line, in that spelling, inside a
 * recognisable `export const X = sqliteTable(` block. Drizzle's `getTableConfig`
 * reads the built table object, so line breaks, import aliases, formatting and
 * helper functions cannot hide a foreign key from it.
 *
 * WHAT IT ENFORCES (each failure names the table and the fix):
 *
 *   3.1 COMPLETENESS   Every table exported by `schema.ts` is classified in
 *                      `src/backend/db/ownership.ts` exactly once. A new table
 *                      nobody classified fails the build. (Being in "both lists"
 *                      is not expressible — see 3.6.)
 *   3.2 NO PHANTOMS    Every manifest entry names a table the schema still
 *                      exports. Note that the manifest holds table OBJECTS, not
 *                      names, so an entry for a DELETED table cannot go stale
 *                      quietly — it stops the type check and stops this module
 *                      loading, which the shell guard reports as a failure
 *                      (verified by injection). What 3.2 catches on top of that is
 *                      an entry for a table defined somewhere other than
 *                      `schema.ts` — classified, but outside the set this check
 *                      reasons about.
 *   3.3 OWNERSHIP IS   Every `owned-by-column` table really carries a `users.id`
 *       REAL           foreign key, on a column named `user_id`. The NAME is
 *                      load-bearing: CHECK 1 finds hand-authored ownership by
 *                      matching that name, so an ownership column called
 *                      `owner_id` would be invisible to it. This is the motivating
 *                      case for the whole check.
 *   3.4 EVERY OTHER    Any table carrying a `users.id` foreign key that is NOT
 *       USER FK IS     `owned-by-column` must state what that key means instead
 *       EXPLAINED      (`cities.created_by_user_id` is provenance, not ownership).
 *   3.5 DERIVED        Every `owned-via-parent` table really carries a foreign key
 *       OWNERSHIP      to the parent it names, and that chain terminates in an
 *       IS FOUNDED     `owned-by-column` table without cycling.
 *   3.6 REASONS EXIST  Declared reasons are non-empty. Their QUALITY is a review
 *                      matter, not a machine one — this only stops a blank string.
 *
 * FAIL-CLOSED SETUP ASSERTIONS. Every check below is of the form "for each table
 * that ...", so a broken enumeration makes all of them vacuously true. Three
 * assertions run first and fail the check if they do not hold: the schema module
 * yielded tables at all; the manifest is non-empty; and a table named `users` with
 * an `id` column exists and is the target of at least one foreign key. That last
 * one is the one that matters — every question this check asks is phrased in terms
 * of `users.id`, so if the identity table were renamed, "tables carrying a
 * `users.id` foreign key" would silently become the empty set and this file would
 * report PASS while inspecting nothing.
 *
 * NOTHING HERE IS AN ALLOWLIST (OP-30). See the header of `db/ownership.ts`.
 */

import { is } from 'drizzle-orm';
import { getTableConfig, SQLiteTable } from 'drizzle-orm/sqlite-core';
import { TABLE_CLASSIFICATION } from '../src/backend/db/ownership.js';
import * as schema from '../src/backend/db/schema.js';

const IDENTITY_TABLE = 'users';
const IDENTITY_COLUMN = 'id';
const OWNERSHIP_COLUMN = 'user_id';

const failures: string[] = [];
const fail = (message: string, ...detail: string[]): void => {
  failures.push([`CLASSIFY ${message}`, ...detail.map((d) => `    ${d}`)].join('\n'));
};

// ----------------------------------------------------------------
// Schema enumeration (structural — Drizzle's own table metadata)
// ----------------------------------------------------------------

type ForeignKeyEdge = { columns: string[]; target: string; targetColumns: string[] };
type SchemaTable = {
  exportName: string;
  sqlName: string;
  columns: string[];
  foreignKeys: ForeignKeyEdge[];
};

/** Keyed by SQL table name — the identity the manifest and the schema share. */
const schemaTables = new Map<string, SchemaTable>();
/** Table object → SQL name, so a manifest entry can be resolved by identity. */
const tableNames = new Map<SQLiteTable, string>();

for (const [exportName, value] of Object.entries(schema)) {
  if (!is(value, SQLiteTable)) continue;
  const config = getTableConfig(value);
  const entry: SchemaTable = {
    exportName,
    sqlName: config.name,
    columns: config.columns.map((column) => column.name),
    foreignKeys: config.foreignKeys.map((foreignKey) => {
      const reference = foreignKey.reference();
      return {
        columns: reference.columns.map((column) => column.name),
        target: getTableConfig(reference.foreignTable).name,
        targetColumns: reference.foreignColumns.map((column) => column.name),
      };
    }),
  };
  schemaTables.set(entry.sqlName, entry);
  tableNames.set(value, entry.sqlName);
}

/** The columns by which `table` points at `users.id`. Empty = no such foreign key. */
const identityForeignKeyColumns = (table: SchemaTable): string[] =>
  table.foreignKeys
    .filter((fk) => fk.target === IDENTITY_TABLE && fk.targetColumns.includes(IDENTITY_COLUMN))
    .flatMap((fk) => fk.columns);

// ----------------------------------------------------------------
// Fail-closed setup assertions
// ----------------------------------------------------------------

if (schemaTables.size === 0) {
  fail(
    '— the schema enumeration found no tables.',
    'Every check below is "for each table that ...", so an empty enumeration would',
    'report PASS while inspecting nothing. Fix the enumeration, not this assertion.',
  );
}

// The `as const` manifest makes this provably non-empty at compile time too; the
// widening cast is what lets the runtime assertion coexist with that proof, and it
// keeps holding if the manifest ever stops being a const tuple.
if ((TABLE_CLASSIFICATION as readonly unknown[]).length === 0) {
  fail(
    '— the classification manifest is empty.',
    'src/backend/db/ownership.ts must classify every table in the schema.',
  );
}

const identityTable = schemaTables.get(IDENTITY_TABLE);
if (!identityTable || !identityTable.columns.includes(IDENTITY_COLUMN)) {
  fail(
    `— no table named '${IDENTITY_TABLE}' with an '${IDENTITY_COLUMN}' column exists.`,
    'This check asks every one of its questions in terms of a foreign key into',
    `${IDENTITY_TABLE}.${IDENTITY_COLUMN}. If the identity table were renamed, that set would`,
    'silently be empty and this check would pass vacuously. If the rename is deliberate,',
    'update IDENTITY_TABLE/IDENTITY_COLUMN here and in db/ownership.ts together.',
  );
}

const tablesWithIdentityFk = [...schemaTables.values()].filter(
  (table) => identityForeignKeyColumns(table).length > 0,
);

if (identityTable && tablesWithIdentityFk.length === 0) {
  fail(
    `— no table carries a foreign key into ${IDENTITY_TABLE}.${IDENTITY_COLUMN}.`,
    'This schema has user-owned tables, so an empty result means the foreign-key',
    'enumeration is broken, not that ownership vanished.',
  );
}

// ----------------------------------------------------------------
// 3.1 / 3.2 — the manifest covers the schema exactly once
// ----------------------------------------------------------------

type ResolvedEntry = {
  kind: (typeof TABLE_CLASSIFICATION)[number]['kind'];
  sqlName: string;
  table: SchemaTable;
  parentName?: string;
  why?: string;
  userFkNote?: string;
};

const classified = new Map<string, ResolvedEntry>();

for (const entry of TABLE_CLASSIFICATION) {
  const sqlName = tableNames.get(entry.table);
  const table = sqlName ? schemaTables.get(sqlName) : undefined;

  // 3.2 — a manifest entry naming something the schema no longer exports.
  if (!sqlName || !table) {
    fail(
      `${entry.kind} entry names a table that schema.ts does not export.`,
      'The table was removed or is no longer exported. Delete the entry in the same PR',
      'that removed the table — a manifest that keeps entries for tables that no longer',
      'exist stops being a statement about the current schema.',
    );
    continue;
  }

  // 3.1 (duplicate half) — the same table classified twice.
  if (classified.has(sqlName)) {
    fail(
      `${sqlName} is classified more than once in db/ownership.ts.`,
      `First as '${classified.get(sqlName)?.kind}', again as '${entry.kind}'.`,
      'A table has exactly one classification. Delete the entry that is wrong.',
    );
    continue;
  }

  classified.set(sqlName, {
    kind: entry.kind,
    sqlName,
    table,
    parentName: 'parent' in entry ? tableNames.get(entry.parent) : undefined,
    why: 'why' in entry ? entry.why : undefined,
    userFkNote: 'userFkNote' in entry ? entry.userFkNote : undefined,
  });
}

// 3.1 (completeness half) — the real target: a new table nobody classified.
for (const table of schemaTables.values()) {
  if (classified.has(table.sqlName)) continue;
  const identityColumns = identityForeignKeyColumns(table);
  fail(
    `${table.sqlName} (exported as '${table.exportName}') is not classified.`,
    'Every table in schema.ts must be classified in src/backend/db/ownership.ts —',
    'whose data is this, and how is that expressed. Add ONE entry:',
    "  owned-by-column   — user data with its own user_id column (scopeToUser accepts it)",
    '  owned-via-parent  — user data scoped through a parent (assertOwned/assertWritable)',
    '  global-reference  — not user data; readable by everyone',
    identityColumns.length > 0
      ? `NOTE: this table already points at ${IDENTITY_TABLE}.${IDENTITY_COLUMN} via ` +
        `${identityColumns.join(', ')} — decide whether that column is OWNERSHIP or something else.`
      : 'This table carries no user foreign key, so decide how it is scoped before adding it.',
  );
}

// ----------------------------------------------------------------
// 3.3 / 3.4 — every user foreign key is either ownership or explained
// ----------------------------------------------------------------

for (const entry of classified.values()) {
  const identityColumns = identityForeignKeyColumns(entry.table);

  if (entry.kind === 'owned-by-column') {
    if (identityColumns.length === 0) {
      fail(
        `${entry.sqlName} is classified 'owned-by-column' but carries no foreign key into ` +
          `${IDENTITY_TABLE}.${IDENTITY_COLUMN}.`,
        'scopeToUser composes an ownership predicate on that column, so the classification',
        'claims something the schema does not provide. Either add the column, or classify',
        'the table as owned-via-parent (scoped through a parent) or global-reference.',
      );
      continue;
    }
    if (!identityColumns.includes(OWNERSHIP_COLUMN)) {
      fail(
        `${entry.sqlName} carries its user foreign key on '${identityColumns.join(', ')}', not ` +
          `'${OWNERSHIP_COLUMN}'.`,
        'This is the case this check exists for. CHECK 1 of this guard finds hand-authored',
        `ownership by matching the ${OWNERSHIP_COLUMN} column name, so an ownership column`,
        'called anything else is invisible to it — ownership could then be written by hand',
        'anywhere in the backend and nothing would object.',
        `Rename the column to '${OWNERSHIP_COLUMN}' (a migration), or, if it is not ownership,`,
        'reclassify the table and state what the key means in userFkNote.',
      );
    }
    continue;
  }

  // 3.4 — not owned-by-column, yet points at a user. Say what it means.
  if (identityColumns.length > 0 && !(entry.userFkNote ?? '').trim()) {
    fail(
      `${entry.sqlName} is classified '${entry.kind}' and carries a foreign key into ` +
        `${IDENTITY_TABLE}.${IDENTITY_COLUMN} via ${identityColumns.join(', ')}, with no userFkNote.`,
      'A user reference on a table that is not owned-by-column means something other than',
      'ownership — provenance, authorship, a last-editor stamp. State which, in userFkNote,',
      "so the next reader does not have to guess (cities.created_by_user_id is the worked",
      'example). If it IS ownership, classify the table owned-by-column instead.',
    );
  }
}

// ----------------------------------------------------------------
// 3.5 — derived ownership is founded on a real foreign-key chain
// ----------------------------------------------------------------

for (const entry of classified.values()) {
  if (entry.kind !== 'owned-via-parent') continue;

  if (!entry.parentName) {
    fail(
      `${entry.sqlName} names a parent that schema.ts does not export.`,
      'Point it at a table that exists.',
    );
    continue;
  }

  const hasEdge = entry.table.foreignKeys.some((fk) => fk.target === entry.parentName);
  if (!hasEdge) {
    fail(
      `${entry.sqlName} claims ownership through '${entry.parentName}' but has no foreign key ` +
        'to it.',
      'Derived ownership is only as real as the foreign key it travels along. Name the parent',
      'this table actually references, or give the table its own user_id column and classify',
      'it owned-by-column.',
    );
    continue;
  }

  // Walk to an owned-by-column root. A cycle, an unclassified link, or a terminus
  // that is not user-owned all mean the claim of derived ownership never resolves
  // to an owner — the rows would have nothing to be scoped to.
  const immediateParent = classified.get(entry.parentName);
  if (!immediateParent) {
    fail(
      `${entry.sqlName} claims ownership through '${entry.parentName}', which is not classified.`,
      'Classify the parent first — an unclassified parent cannot establish an owner.',
    );
    continue;
  }

  let cursor: ResolvedEntry = immediateParent;
  const seen = new Set<string>([entry.sqlName]);
  let resolved = false;
  let cycled = false;
  let terminus = cursor;

  while (true) {
    if (cursor.kind === 'owned-by-column') {
      resolved = true;
      break;
    }
    if (cursor.kind !== 'owned-via-parent' || seen.has(cursor.sqlName)) {
      cycled = seen.has(cursor.sqlName);
      terminus = cursor;
      break;
    }
    seen.add(cursor.sqlName);
    const next: ResolvedEntry | undefined = cursor.parentName
      ? classified.get(cursor.parentName)
      : undefined;
    if (!next) {
      terminus = cursor;
      break;
    }
    cursor = next;
  }

  if (cycled) {
    fail(
      `${entry.sqlName}'s ownership chain cycles at '${terminus.sqlName}'.`,
      'A chain that loops never reaches an owner, so nothing scopes these rows.',
    );
  } else if (!resolved) {
    fail(
      `${entry.sqlName}'s ownership chain stops at '${terminus.sqlName}' (classified ` +
        `'${terminus.kind}') without reaching an owned-by-column table.`,
      'Derived ownership must terminate in a table with its own user_id column. Stopping at',
      'global reference data, at the identity table, or at a link whose own parent is missing',
      'means these rows have no owner to be scoped to.',
    );
  }
}

// ----------------------------------------------------------------
// 3.6 — declared reasons are actually declared
// ----------------------------------------------------------------

for (const entry of classified.values()) {
  if ((entry.kind === 'global-reference' || entry.kind === 'user-identity') && !entry.why?.trim()) {
    fail(
      `${entry.sqlName} is classified '${entry.kind}' with an empty reason.`,
      'State why this table is not user data. The reason is what a future reader checks',
      'against the schema when they are tempted to read user rows out of it.',
    );
  }
  if (entry.userFkNote !== undefined && !entry.userFkNote.trim()) {
    fail(`${entry.sqlName} has an empty userFkNote.`, 'State what the user foreign key means.');
  }
}

// ----------------------------------------------------------------
// Verdict
// ----------------------------------------------------------------

if (failures.length > 0) {
  for (const failure of failures) console.log(failure);
  console.log('');
  console.log('scope-completeness-check: FAIL — CHECK 3');
  console.log(`  ${failures.length} ownership-classification problem(s), listed above.`);
  console.log('  QUAL-47: every table in schema.ts is classified in src/backend/db/ownership.ts,');
  console.log('  and the classification is checked against the real schema. Fix the entry or the');
  console.log('  schema — do NOT delete the check or reclassify a table to dodge it (OP-30).');
  process.exit(1);
}

const counts = new Map<string, number>();
for (const entry of classified.values()) {
  counts.set(entry.kind, (counts.get(entry.kind) ?? 0) + 1);
}
const summary = [...counts.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([kind, count]) => `${count} ${kind}`)
  .join(', ');

console.log(
  `  Check 3 (ownership classification, enforced) — ${classified.size} schema table(s) ` +
    `classified (${summary});`,
);
console.log(
  `    ${tablesWithIdentityFk.length} carry a ${IDENTITY_TABLE}.${IDENTITY_COLUMN} foreign key, ` +
    'each either owned-by-column or explained.',
);
