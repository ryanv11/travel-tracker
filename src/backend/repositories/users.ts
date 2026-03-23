/**
 * Travel Tracker — Users Repository
 *
 * Per ADL-18, all user-scoped queries go through repositories.
 * This repository handles Clerk identity → internal user resolution.
 *
 * Hard rule (ADL-20): No @clerk/* imports anywhere in backend code.
 * Authentication is done via jose + Clerk's JWKS endpoint.
 */

import { eq, ne } from 'drizzle-orm';
import { getDb, users } from '../db/index.js';
import type { User } from '../db/schema.js';

export const userRepository = {
  /**
   * Resolves (or creates) an internal user record from a Clerk user ID.
   *
   * Logic:
   *   1. SELECT * FROM users WHERE clerk_id = ?
   *   2. If found: return the row (update email if it has changed)
   *   3. If not found: INSERT a new row with a UUID v4 id; return it
   *
   * ADL-27: When creating a new user, sets is_owner = 1 if clerkId matches
   * OWNER_CLERK_ID env var, 0 otherwise. This handles the fresh-DB case where
   * the owner authenticates before the startup reconciliation pass.
   *
   * @param clerkId - The Clerk user ID from the verified JWT `sub` claim.
   * @param email   - The email from the verified JWT claims.
   * @returns The resolved internal User record.
   */
  async findOrCreateByClerkId(clerkId: string, email: string): Promise<User> {
    const db = getDb();

    // 1. Look up by clerk_id
    const existing = await db.select().from(users).where(eq(users.clerkId, clerkId)).limit(1);

    if (existing.length > 0) {
      const user = existing[0];

      // Optionally update email if it has changed
      if (user.email !== email) {
        const now = new Date();
        const updated = await db
          .update(users)
          .set({ email, updatedAt: now })
          .where(eq(users.clerkId, clerkId))
          .returning();
        return updated[0];
      }

      return user;
    }

    // 3. Not found — create a new user row
    // ADL-27: set is_owner = 1 if this clerkId is the configured owner
    const isOwner = clerkId === process.env.OWNER_CLERK_ID ? 1 : 0;
    const id = crypto.randomUUID();
    const now = new Date();
    const inserted = await db
      .insert(users)
      .values({
        id,
        clerkId,
        email,
        isOwner,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return inserted[0];
  },

  /**
   * Sets is_owner = 1 for the user matching ownerClerkId, is_owner = 0 for all others.
   *
   * ADL-27: Called at startup as a defence-in-depth reconciliation pass. Corrects any
   * drift from manual DB edits, test data from BYPASS_AUTH sessions, or OWNER_CLERK_ID
   * changes after initial deployment. Safe to call repeatedly (idempotent).
   *
   * Note: If no user row exists for ownerClerkId yet (fresh DB), this updates 0 rows.
   * The primary assignment in findOrCreateByClerkId handles that case.
   *
   * @param ownerClerkId - The Clerk user ID of the app owner (from OWNER_CLERK_ID env var).
   */
  async setOwner(ownerClerkId: string): Promise<void> {
    const db = getDb();
    const now = new Date();

    // Set is_owner = 1 for the owner
    await db
      .update(users)
      .set({ isOwner: 1, updatedAt: now })
      .where(eq(users.clerkId, ownerClerkId));

    // Set is_owner = 0 for all other users
    await db
      .update(users)
      .set({ isOwner: 0, updatedAt: now })
      .where(ne(users.clerkId, ownerClerkId));
  },
};
