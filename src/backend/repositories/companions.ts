/**
 * Travel Tracker — Companions Repository
 *
 * ADL-28 (AD-08): companions are per-user. Every function scopes to userId —
 * no user's companion row is ever returned or mutated unless the userId
 * matches. Per ADL-18, all user-scoped queries go through a repository.
 */

import { and, asc, eq, inArray } from 'drizzle-orm';
import { companions, getDb } from '../db/index.js';
import type { Companion } from '../db/schema.js';

export const companionRepository = {
  /** Returns all companions owned by userId (active + inactive), name ascending. */
  async findAll(userId: string): Promise<Companion[]> {
    const db = getDb();
    return db
      .select()
      .from(companions)
      .where(eq(companions.userId, userId))
      .orderBy(asc(companions.name));
  },

  /** Returns only active companions for userId, name ascending. */
  async findActive(userId: string): Promise<Companion[]> {
    const db = getDb();
    return db
      .select()
      .from(companions)
      .where(and(eq(companions.userId, userId), eq(companions.isActive, 1)))
      .orderBy(asc(companions.name));
  },

  /** Returns a single companion by id, only if owned by userId. */
  async findById(userId: string, id: number): Promise<Companion | null> {
    const db = getDb();
    const rows = await db
      .select()
      .from(companions)
      .where(and(eq(companions.id, id), eq(companions.userId, userId)))
      .limit(1);
    return rows[0] ?? null;
  },

  /** Creates a new companion for userId. */
  async create(userId: string, name: string): Promise<Companion> {
    const db = getDb();
    const now = new Date().toISOString();
    const inserted = await db
      .insert(companions)
      .values({ userId, name, createdAt: now, updatedAt: now })
      .returning();
    return inserted[0];
  },

  /**
   * Updates name and/or is_active for a companion owned by userId.
   * Returns null if the companion does not exist or is not owned by userId.
   */
  async update(
    userId: string,
    id: number,
    data: { name?: string; isActive?: number },
  ): Promise<Companion | null> {
    const db = getDb();
    const now = new Date().toISOString();
    const updates: Partial<typeof companions.$inferInsert> = { updatedAt: now };
    if (data.name !== undefined) updates.name = data.name;
    if (data.isActive !== undefined) updates.isActive = data.isActive;

    const updated = await db
      .update(companions)
      .set(updates)
      .where(and(eq(companions.id, id), eq(companions.userId, userId)))
      .returning();
    return updated[0] ?? null;
  },

  /**
   * Soft-deletes (sets is_active = 0) a companion owned by userId.
   * Returns null if the companion does not exist or is not owned by userId.
   */
  async deactivate(userId: string, id: number): Promise<Companion | null> {
    return companionRepository.update(userId, id, { isActive: 0 });
  },

  /**
   * Validates that all companionIds belong to userId.
   * Returns the subset of companionIds that are invalid — i.e. belong to a
   * different user, or do not exist at all. An empty return means every ID
   * is valid.
   *
   * ADL-28 R4: this is the sole cross-user guard for trip_companions_map
   * inserts (tripRepository.replaceAssociations calls this before inserting).
   * SQLite cannot enforce companions.user_id === trips.user_id at the schema
   * level, so this application-layer check is load-bearing.
   */
  async validateOwnership(userId: string, companionIds: number[]): Promise<number[]> {
    if (!companionIds.length) return [];
    const db = getDb();
    const rows = await db
      .select({ id: companions.id })
      .from(companions)
      .where(and(eq(companions.userId, userId), inArray(companions.id, companionIds)));
    const validIds = new Set(rows.map((r) => r.id));
    return companionIds.filter((id) => !validIds.has(id));
  },
};
