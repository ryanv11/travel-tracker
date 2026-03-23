/**
 * Unit tests for userRepository (src/backend/repositories/users.ts).
 *
 * Covers:
 *   - findOrCreateByClerkId: creates new user when not found
 *   - findOrCreateByClerkId: returns existing user when found
 *   - findOrCreateByClerkId: updates email when it has changed
 *   - findOrCreateByClerkId: sets isOwner=1 when clerkId matches OWNER_CLERK_ID (ADL-27)
 *   - setOwner: sets is_owner=1 for owner, 0 for all others (ADL-27)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDb } from './test-db.js';

// ----------------------------------------------------------------
// Mock getDb
// ----------------------------------------------------------------

let testDb: TestDb | null = null;

vi.mock('../../db/index.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../db/index.js')>();
  return {
    ...real,
    getDb: () => {
      if (!testDb) throw new Error('[TEST] testDb not initialised');
      return testDb;
    },
  };
});

const { userRepository } = await import('../users.js');

// ----------------------------------------------------------------
// Test setup
// ----------------------------------------------------------------

beforeEach(async () => {
  testDb = await createTestDb();
});

afterEach(() => {
  testDb = null;
});

// ----------------------------------------------------------------
// findOrCreateByClerkId
// ----------------------------------------------------------------

describe('userRepository.findOrCreateByClerkId', () => {
  it('creates a new user when the clerkId is not found', async () => {
    const user = await userRepository.findOrCreateByClerkId('clerk_abc', 'alice@example.com');

    expect(user.id).toBeTypeOf('string');
    expect(user.clerkId).toBe('clerk_abc');
    expect(user.email).toBe('alice@example.com');
  });

  it('returns the existing user on second call with the same clerkId', async () => {
    const first = await userRepository.findOrCreateByClerkId('clerk_abc', 'alice@example.com');
    const second = await userRepository.findOrCreateByClerkId('clerk_abc', 'alice@example.com');

    expect(second.id).toBe(first.id);
    expect(second.clerkId).toBe('clerk_abc');
  });

  it('creates distinct users for different clerkIds', async () => {
    const userA = await userRepository.findOrCreateByClerkId('clerk_aaa', 'a@example.com');
    const userB = await userRepository.findOrCreateByClerkId('clerk_bbb', 'b@example.com');

    expect(userA.id).not.toBe(userB.id);
    expect(userA.clerkId).toBe('clerk_aaa');
    expect(userB.clerkId).toBe('clerk_bbb');
  });

  it('updates email when it has changed', async () => {
    await userRepository.findOrCreateByClerkId('clerk_abc', 'old@example.com');
    const updated = await userRepository.findOrCreateByClerkId('clerk_abc', 'new@example.com');

    expect(updated.email).toBe('new@example.com');
  });

  it('generates a UUID v4 id for new users', async () => {
    const user = await userRepository.findOrCreateByClerkId('clerk_new', 'new@example.com');

    // UUID v4 pattern: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    expect(user.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('does not change the id when email is updated', async () => {
    const original = await userRepository.findOrCreateByClerkId('clerk_abc', 'old@example.com');
    const updated = await userRepository.findOrCreateByClerkId('clerk_abc', 'new@example.com');

    expect(updated.id).toBe(original.id);
  });

  it('sets isOwner=0 for new users when OWNER_CLERK_ID is not set', async () => {
    delete process.env.OWNER_CLERK_ID;
    const user = await userRepository.findOrCreateByClerkId('clerk_abc', 'alice@example.com');
    expect(user.isOwner).toBe(0);
  });

  it('sets isOwner=1 when clerkId matches OWNER_CLERK_ID (ADL-27 fresh-DB case)', async () => {
    process.env.OWNER_CLERK_ID = 'clerk_owner';
    try {
      const user = await userRepository.findOrCreateByClerkId('clerk_owner', 'owner@example.com');
      expect(user.isOwner).toBe(1);
    } finally {
      delete process.env.OWNER_CLERK_ID;
    }
  });

  it('sets isOwner=0 for non-owner users when OWNER_CLERK_ID is set', async () => {
    process.env.OWNER_CLERK_ID = 'clerk_owner';
    try {
      const user = await userRepository.findOrCreateByClerkId('clerk_other', 'other@example.com');
      expect(user.isOwner).toBe(0);
    } finally {
      delete process.env.OWNER_CLERK_ID;
    }
  });

  it('returns isOwner field from existing user row', async () => {
    // Create user first, then retrieve it
    const user = await userRepository.findOrCreateByClerkId('clerk_abc', 'alice@example.com');
    const same = await userRepository.findOrCreateByClerkId('clerk_abc', 'alice@example.com');
    expect(same.isOwner).toBe(user.isOwner);
  });
});

// ----------------------------------------------------------------
// setOwner (ADL-27)
// ----------------------------------------------------------------

describe('userRepository.setOwner', () => {
  it('sets is_owner=1 for the matching clerkId', async () => {
    await userRepository.findOrCreateByClerkId('clerk_owner', 'owner@example.com');
    await userRepository.setOwner('clerk_owner');

    // Re-fetch to verify
    const updated = await userRepository.findOrCreateByClerkId('clerk_owner', 'owner@example.com');
    expect(updated.isOwner).toBe(1);
  });

  it('sets is_owner=0 for all other users', async () => {
    await userRepository.findOrCreateByClerkId('clerk_owner', 'owner@example.com');
    await userRepository.findOrCreateByClerkId('clerk_other', 'other@example.com');

    await userRepository.setOwner('clerk_owner');

    const other = await userRepository.findOrCreateByClerkId('clerk_other', 'other@example.com');
    expect(other.isOwner).toBe(0);
  });

  it('is idempotent — calling twice gives the same result', async () => {
    await userRepository.findOrCreateByClerkId('clerk_owner', 'owner@example.com');
    await userRepository.setOwner('clerk_owner');
    await userRepository.setOwner('clerk_owner');

    const user = await userRepository.findOrCreateByClerkId('clerk_owner', 'owner@example.com');
    expect(user.isOwner).toBe(1);
  });

  it('handles fresh DB with no matching user row (updates 0 rows silently)', async () => {
    // No rows exist — setOwner should not throw
    await expect(userRepository.setOwner('clerk_nonexistent')).resolves.toBeUndefined();
  });

  it('changes owner: previous owner becomes non-owner', async () => {
    // First: set clerk_owner_a as owner
    await userRepository.findOrCreateByClerkId('clerk_owner_a', 'a@example.com');
    await userRepository.findOrCreateByClerkId('clerk_owner_b', 'b@example.com');
    await userRepository.setOwner('clerk_owner_a');

    let userA = await userRepository.findOrCreateByClerkId('clerk_owner_a', 'a@example.com');
    let userB = await userRepository.findOrCreateByClerkId('clerk_owner_b', 'b@example.com');
    expect(userA.isOwner).toBe(1);
    expect(userB.isOwner).toBe(0);

    // Now: change owner to clerk_owner_b
    await userRepository.setOwner('clerk_owner_b');

    userA = await userRepository.findOrCreateByClerkId('clerk_owner_a', 'a@example.com');
    userB = await userRepository.findOrCreateByClerkId('clerk_owner_b', 'b@example.com');
    expect(userA.isOwner).toBe(0);
    expect(userB.isOwner).toBe(1);
  });
});
