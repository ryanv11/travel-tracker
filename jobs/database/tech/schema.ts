/**
 * Travel Tracker — Drizzle ORM Schema (POINTER, not a copy)
 *
 * This file used to hold a full duplicate of the Drizzle schema. That duplicate
 * went stale (last touched 2026-07-23, PR #240) while the real schema kept
 * moving — by 2026-08-06 (PR #409) the two had drifted by 77 lines and the
 * duplicate still described a "Phase 2: PostgreSQL" migration path that no
 * longer applies (the project is on libSQL/Turso, not Postgres). A stale copy
 * sitting next to the real file is worse than no copy — anyone who opened this
 * one and trusted it would have been reading last month's schema.
 *
 * THE SINGLE SOURCE OF TRUTH IS:
 *   src/backend/db/schema.ts
 *
 * See also:
 * - jobs/architect/tech/20260307-ER-schema.md — original v1.1 design (historical)
 * - jobs/architect/tech/20260307-architecture-decisions-log.md and the ADL-* files
 *   in jobs/architect/tech/ — schema evolution since v1.1
 * - CLAUDE.md "Schema changes (Drizzle ORM)" — the migrate workflow (db:generate /
 *   db:migrate); db:push is disabled (ADL-15)
 *
 * Tracked as QUAL-10.
 */
export {};
