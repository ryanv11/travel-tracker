/**
 * Travel Tracker — Trip Categories Repository
 *
 * ADL-46 (AD-09, D3): trip categories are per-user, following ADL-28's
 * companions pattern verbatim. Every function scopes to userId — no user's
 * category row is ever returned or mutated unless the userId matches. Per
 * ADL-18, all user-scoped queries go through a repository.
 *
 * Lazy seed (ADL-46 §3.2.1): a user's default categories are seeded on first
 * access (read OR write) via ensureSeeded, counting ALL rows (not active), so
 * a brand-new user whose first action is a POST still receives the defaults,
 * and a user who deactivates everything is not re-seeded. onConflictDoNothing
 * on the (user_id, name) unique index makes concurrent first-requests safe.
 */

import { and, asc, eq, inArray } from 'drizzle-orm';
import { getDb, tripCategories } from '../db/index.js';
import type { TripCategory } from '../db/schema.js';
import { TRIP_CATEGORIES } from '../db/seed-data.js';
import { ownedAnd, scopeToUser } from './scope.js';

export const tripCategoryRepository = {
  /**
   * Seeds the default categories for userId. Uses onConflictDoNothing on the
   * (user_id, name) unique index — idempotent and safe under concurrency.
   */
  async seedDefaults(userId: string): Promise<void> {
    const db = getDb();
    const now = new Date().toISOString();
    await db
      .insert(tripCategories)
      .values(
        TRIP_CATEGORIES.map((c) => ({ userId, name: c.name, createdAt: now, updatedAt: now })),
      )
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
      .select({ id: tripCategories.id })
      .from(tripCategories)
      .where(scopeToUser(tripCategories, userId))
      .limit(1);
    if (!rows.length) {
      await tripCategoryRepository.seedDefaults(userId);
    }
  },

  /** Returns all categories owned by userId (active + inactive), name ascending. */
  async findAll(userId: string): Promise<TripCategory[]> {
    const db = getDb();
    return db
      .select()
      .from(tripCategories)
      .where(scopeToUser(tripCategories, userId))
      .orderBy(asc(tripCategories.name));
  },

  /** Returns only active categories for userId, name ascending. */
  async findActive(userId: string): Promise<TripCategory[]> {
    const db = getDb();
    return db
      .select()
      .from(tripCategories)
      .where(ownedAnd(tripCategories, userId, eq(tripCategories.isActive, 1)))
      .orderBy(asc(tripCategories.name));
  },

  /** Returns a single category by id, only if owned by userId. */
  async findById(userId: string, id: number): Promise<TripCategory | null> {
    const db = getDb();
    const rows = await db
      .select()
      .from(tripCategories)
      .where(and(eq(tripCategories.id, id), scopeToUser(tripCategories, userId)))
      .limit(1);
    return rows[0] ?? null;
  },

  /** Creates a new category for userId. */
  async create(userId: string, name: string): Promise<TripCategory> {
    const db = getDb();
    const now = new Date().toISOString();
    const inserted = await db
      .insert(tripCategories)
      .values({ userId, name, createdAt: now, updatedAt: now })
      .returning();
    return inserted[0];
  },

  /**
   * Updates name and/or is_active for a category owned by userId.
   * Returns null if the category does not exist or is not owned by userId.
   */
  async update(
    userId: string,
    id: number,
    data: { name?: string; isActive?: number },
  ): Promise<TripCategory | null> {
    const db = getDb();
    const now = new Date().toISOString();
    const updates: Partial<typeof tripCategories.$inferInsert> = { updatedAt: now };
    if (data.name !== undefined) updates.name = data.name;
    if (data.isActive !== undefined) updates.isActive = data.isActive;

    const updated = await db
      .update(tripCategories)
      .set(updates)
      .where(and(eq(tripCategories.id, id), scopeToUser(tripCategories, userId)))
      .returning();
    return updated[0] ?? null;
  },

  /**
   * Soft-deletes (sets is_active = 0) a category owned by userId.
   * Returns null if the category does not exist or is not owned by userId.
   */
  async deactivate(userId: string, id: number): Promise<TripCategory | null> {
    return tripCategoryRepository.update(userId, id, { isActive: 0 });
  },

  /**
   * Validates that all categoryIds belong to userId.
   * Returns the subset of categoryIds that are invalid — i.e. belong to a
   * different user, or do not exist at all. An empty return means every ID
   * is valid.
   *
   * ADL-46 §3.3 / F1: once categories are per-user, a trip may reference a
   * category belonging to a different user. SQLite cannot enforce
   * trip_categories.user_id === trips.user_id at the schema level, so this
   * application-layer check is load-bearing (tripRepository.replaceAssociations
   * calls it before inserting into trip_categories_map).
   */
  async validateOwnership(userId: string, categoryIds: number[]): Promise<number[]> {
    if (!categoryIds.length) return [];
    const db = getDb();
    const rows = await db
      .select({ id: tripCategories.id })
      .from(tripCategories)
      .where(ownedAnd(tripCategories, userId, inArray(tripCategories.id, categoryIds)));
    const validIds = new Set(rows.map((r) => r.id));
    return categoryIds.filter((id) => !validIds.has(id));
  },
};
