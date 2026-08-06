/**
 * BUG-75 v3 §B3 / M1 / F3 — shared unique-violation detection for the
 * caught-violation → re-select-and-reuse control flow (cities.ts create-path
 * INSERTs; geocoding.service.ts's resolveCity stamp).
 *
 * Live-verified against THIS project's @libsql/client + drizzle-orm/libsql
 * versions with two independent probes (not assumed from library docs):
 *   1. A bare @libsql/client insert against a UNIQUE column throws a
 *      LibsqlError with `.code === 'SQLITE_CONSTRAINT_UNIQUE'` directly.
 *   2. The SAME violation through `drizzle-orm/libsql`'s `db.insert()` is
 *      wrapped in a `DrizzleQueryError` whose own `.code` is undefined —
 *      the real code lives one level down, at `err.cause.code`.
 * Both shapes are checked so the helper is correct regardless of which layer
 * throws (raw client calls in tests/scripts vs every route/service call,
 * which all go through drizzle). Deliberately narrow to the UNIQUE code:
 * other SQLITE_CONSTRAINT_* codes (FK, CHECK, NOT NULL) must NOT be
 * swallowed into a false "reuse" branch — those are genuine bugs, not a
 * twin-merge signal.
 */
export function isUniqueViolation(err: unknown): boolean {
  return hasUniqueCode(err) || hasUniqueCode((err as { cause?: unknown } | undefined)?.cause);
}

function hasUniqueCode(err: unknown): boolean {
  return (
    err instanceof Error && (err as Error & { code?: unknown }).code === 'SQLITE_CONSTRAINT_UNIQUE'
  );
}
