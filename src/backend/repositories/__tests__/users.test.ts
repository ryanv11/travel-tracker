/**
 * Unit tests for userRepository (src/backend/repositories/users.ts).
 *
 * Covers:
 *   - findOrCreateByClerkId: creates new user when not found
 *   - findOrCreateByClerkId: returns existing user when found
 *   - findOrCreateByClerkId: updates email when it has changed
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
});
