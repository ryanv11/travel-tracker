/**
 * Travel Tracker — Activities Repository
 *
 * ADL-46 (AD-09, D3): activities are per-user, following ADL-28's companions
 * pattern verbatim. Every function scopes to userId — no user's activity row
 * is ever returned or mutated unless the userId matches. Per ADL-18, all
 * user-scoped queries go through a repository.
 *
 * Lazy seed (ADL-46 §3.2.1): a user's default activities are seeded on first
 * access (read OR write) via ensureSeeded, counting ALL rows (not active), so
 * a brand-new user whose first action is a POST still receives the defaults,
 * and a user who deactivates everything is not re-seeded. onConflictDoNothing
 * on the (user_id, name) unique index makes concurrent first-requests safe.
 */

import { and, asc, eq, inArray } from 'drizzle-orm';
import { activities, getDb } from '../db/index.js';
import type { Activity } from '../db/schema.js';
import { ACTIVITIES } from '../db/seed-data.js';
import { ownedAnd, scopeToUser } from './scope.js';

export const activityRepository = {
  /**
   * Seeds the default activities for userId. Uses onConflictDoNothing on the
   * (user_id, name) unique index — idempotent and safe under concurrency.
   */
  async seedDefaults(userId: string): Promise<void> {
    const db = getDb();
    const now = new Date().toISOString();
    await db
      .insert(activities)
      .values(ACTIVITIES.map((a) => ({ userId, name: a.name, createdAt: now, updatedAt: now })))
      .onConflictDoNothing();
  },

  /**
   * Lazy-seed trigger (ADL-46 §3.2.1): if userId has NO rows at all (active or
   * inactive), seed the defaults. Counting all rows — not active — means a user
   * who deactivated every entry is not re-seeded. Called before every read and
   * write handler so a first-action POST still receives the defaults.
   */
  async ensureSeeded(userId: string): Promise<void> {
    const db = getDb();
    const rows = await db
      .select({ id: activities.id })
      .from(activities)
      .where(scopeToUser(activities, userId))
      .limit(1);
    if (!rows.length) {
      await activityRepository.seedDefaults(userId);
    }
  },

  /** Returns all activities owned by userId (active + inactive), name ascending. */
  async findAll(userId: string): Promise<Activity[]> {
    const db = getDb();
    return db
      .select()
      .from(activities)
      .where(scopeToUser(activities, userId))
      .orderBy(asc(activities.name));
  },

  /** Returns only active activities for userId, name ascending. */
  async findActive(userId: string): Promise<Activity[]> {
    const db = getDb();
    return db
      .select()
      .from(activities)
      .where(ownedAnd(activities, userId, eq(activities.isActive, 1)))
      .orderBy(asc(activities.name));
  },

  /** Returns a single activity by id, only if owned by userId. */
  async findById(userId: string, id: number): Promise<Activity | null> {
    const db = getDb();
    const rows = await db
      .select()
      .from(activities)
      .where(and(eq(activities.id, id), scopeToUser(activities, userId)))
      .limit(1);
    return rows[0] ?? null;
  },

  /** Creates a new activity for userId. */
  async create(userId: string, name: string): Promise<Activity> {
    const db = getDb();
    const now = new Date().toISOString();
    const inserted = await db
      .insert(activities)
      .values({ userId, name, createdAt: now, updatedAt: now })
      .returning();
    return inserted[0];
  },

  /**
   * Updates name and/or is_active for an activity owned by userId.
   * Returns null if the activity does not exist or is not owned by userId.
   */
  async update(
    userId: string,
    id: number,
    data: { name?: string; isActive?: number },
  ): Promise<Activity | null> {
    const db = getDb();
    const now = new Date().toISOString();
    const updates: Partial<typeof activities.$inferInsert> = { updatedAt: now };
    if (data.name !== undefined) updates.name = data.name;
    if (data.isActive !== undefined) updates.isActive = data.isActive;

    const updated = await db
      .update(activities)
      .set(updates)
      .where(and(eq(activities.id, id), scopeToUser(activities, userId)))
      .returning();
    return updated[0] ?? null;
  },

  /**
   * Soft-deletes (sets is_active = 0) an activity owned by userId.
   * Returns null if the activity does not exist or is not owned by userId.
   */
  async deactivate(userId: string, id: number): Promise<Activity | null> {
    return activityRepository.update(userId, id, { isActive: 0 });
  },

  /**
   * Validates that all activityIds belong to userId.
   * Returns the subset of activityIds that are invalid — i.e. belong to a
   * different user, or do not exist at all. An empty return means every ID
   * is valid.
   *
   * ADL-46 §3.3 / F1: the sole cross-user guard for both trip_activities_map
   * (trip-level, via tripRepository.replaceAssociations) and
   * trip_place_activities_map (place-level, via the places router). SQLite
   * cannot enforce activities.user_id === owner at the schema level, so this
   * application-layer check is load-bearing on BOTH write paths.
   */
  async validateOwnership(userId: string, activityIds: number[]): Promise<number[]> {
    if (!activityIds.length) return [];
    const db = getDb();
    const rows = await db
      .select({ id: activities.id })
      .from(activities)
      .where(ownedAnd(activities, userId, inArray(activities.id, activityIds)));
    const validIds = new Set(rows.map((r) => r.id));
    return activityIds.filter((id) => !validIds.has(id));
  },
};
