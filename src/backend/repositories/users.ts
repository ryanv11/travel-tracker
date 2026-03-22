/**
 * Travel Tracker — Users Repository
 *
 * Per ADL-18, all user-scoped queries go through repositories.
 * This repository handles Clerk identity → internal user resolution.
 *
 * Hard rule (ADL-20): No @clerk/* imports anywhere in backend code.
 * Authentication is done via jose + Clerk's JWKS endpoint.
 */

import { eq } from 'drizzle-orm';
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
    const id = crypto.randomUUID();
    const now = new Date();
    const inserted = await db
      .insert(users)
      .values({
        id,
        clerkId,
        email,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return inserted[0];
  },
};
