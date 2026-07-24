/**
 * Travel Tracker — Map Shading Config Repository
 *
 * ADL-28 (AD-07): map shading config is per-user. Every function scopes to
 * userId. Config rows are lazily seeded — a user gets their 6 default rows
 * created transparently on first access (findAll / findByStateKey), rather
 * than eagerly on user creation. seedDefaults() uses INSERT OR IGNORE so it
 * is idempotent and safe to call defensively.
 */

import { and, eq } from 'drizzle-orm';
import { getDb, mapShadingConfig } from '../db/index.js';
import type { MapShadingConfig } from '../db/schema.js';
import { MAP_SHADING_CONFIG } from '../db/seed-data.js';

/** Default seed values for the 6 shading states (MP-05: 'never_visited' excluded). */
const DEFAULT_SHADING_CONFIG: Array<{ stateKey: string; displayName: string; colorHex: string }> =
  MAP_SHADING_CONFIG.map((c) => ({ ...c }));

export const shadingConfigRepository = {
  /**
   * Returns all 6 shading config rows for userId.
   * If no rows exist yet (first access), seeds defaults and returns them.
   */
  async findAll(userId: string): Promise<MapShadingConfig[]> {
    const db = getDb();
    let rows = await db.select().from(mapShadingConfig).where(eq(mapShadingConfig.userId, userId));

    if (rows.length === 0) {
      await shadingConfigRepository.seedDefaults(userId);
      rows = await db.select().from(mapShadingConfig).where(eq(mapShadingConfig.userId, userId));
    }

    return rows;
  },

  /**
   * Returns a single shading config row for userId and stateKey.
   * If not found because the user has no rows yet, seeds defaults for this
   * user and retries once.
   */
  async findByStateKey(userId: string, stateKey: string): Promise<MapShadingConfig | null> {
    const db = getDb();
    const select = () =>
      db
        .select()
        .from(mapShadingConfig)
        .where(and(eq(mapShadingConfig.userId, userId), eq(mapShadingConfig.stateKey, stateKey)))
        .limit(1);

    let rows = await select();
    if (!rows.length) {
      const anyRows = await db
        .select()
        .from(mapShadingConfig)
        .where(eq(mapShadingConfig.userId, userId))
        .limit(1);
      if (!anyRows.length) {
        await shadingConfigRepository.seedDefaults(userId);
        rows = await select();
      }
    }

    return rows[0] ?? null;
  },

  /**
   * Updates display_name and/or color_hex for a user's shading config row.
   * Returns null if stateKey does not exist for this user.
   */
  async update(
    userId: string,
    stateKey: string,
    data: { displayName?: string; colorHex?: string },
  ): Promise<MapShadingConfig | null> {
    const db = getDb();
    const now = new Date().toISOString();
    const updates: Partial<typeof mapShadingConfig.$inferInsert> = { updatedAt: now };
    if (data.displayName !== undefined) updates.displayName = data.displayName;
    if (data.colorHex !== undefined) updates.colorHex = data.colorHex;

    const updated = await db
      .update(mapShadingConfig)
      .set(updates)
      .where(and(eq(mapShadingConfig.userId, userId), eq(mapShadingConfig.stateKey, stateKey)))
      .returning();
    return updated[0] ?? null;
  },

  /**
   * Seeds default shading config rows for userId.
   * Uses INSERT OR IGNORE (onConflictDoNothing) — safe to call multiple times.
   */
  async seedDefaults(userId: string): Promise<void> {
    const db = getDb();
    const now = new Date().toISOString();
    await db
      .insert(mapShadingConfig)
      .values(
        DEFAULT_SHADING_CONFIG.map((c) => ({
          stateKey: c.stateKey,
          userId,
          displayName: c.displayName,
          colorHex: c.colorHex,
          updatedAt: now,
        })),
      )
      .onConflictDoNothing();
  },
};
