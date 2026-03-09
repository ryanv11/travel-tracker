/**
 * Unit tests for computeState() — map shading state logic.
 *
 * Pure function: no DB, no mocks. Tests the 7 possible state keys
 * and the active override rule (MP-06).
 *
 * Source: src/backend/services/shading.service.ts
 * Spec:   docs/map-shading-spec.md §2
 */
import { describe, it, expect } from 'vitest';
import { computeState } from '../shading.service.js';

describe('computeState()', () => {
  // ----------------------------------------------------------------
  // Active override (MP-06) — hasActive takes priority over all else
  // ----------------------------------------------------------------

  describe('active override (MP-06)', () => {
    it('returns "active" when hasActive is true, regardless of other counts', () => {
      expect(computeState(0, 0, true)).toBe('active');
    });

    it('returns "active" when hasActive is true and completedCount > 0', () => {
      expect(computeState(3, 0, true)).toBe('active');
    });

    it('returns "active" when hasActive is true and planningCount > 0', () => {
      expect(computeState(0, 2, true)).toBe('active');
    });

    it('returns "active" when hasActive is true and both counts are non-zero', () => {
      expect(computeState(2, 1, true)).toBe('active');
    });
  });

  // ----------------------------------------------------------------
  // visited_multiple_planning: completed >= 2 AND planning >= 1
  // ----------------------------------------------------------------

  describe('visited_multiple_planning', () => {
    it('returns "visited_multiple_planning" for completedCount=2, planningCount=1', () => {
      expect(computeState(2, 1, false)).toBe('visited_multiple_planning');
    });

    it('returns "visited_multiple_planning" for completedCount=5, planningCount=3', () => {
      expect(computeState(5, 3, false)).toBe('visited_multiple_planning');
    });
  });

  // ----------------------------------------------------------------
  // visited_multiple: completed >= 2, planning = 0
  // ----------------------------------------------------------------

  describe('visited_multiple', () => {
    it('returns "visited_multiple" for completedCount=2, planningCount=0', () => {
      expect(computeState(2, 0, false)).toBe('visited_multiple');
    });

    it('returns "visited_multiple" for completedCount=10, planningCount=0', () => {
      expect(computeState(10, 0, false)).toBe('visited_multiple');
    });
  });

  // ----------------------------------------------------------------
  // visited_once_planning: completed = 1, planning >= 1
  // ----------------------------------------------------------------

  describe('visited_once_planning', () => {
    it('returns "visited_once_planning" for completedCount=1, planningCount=1', () => {
      expect(computeState(1, 1, false)).toBe('visited_once_planning');
    });

    it('returns "visited_once_planning" for completedCount=1, planningCount=4', () => {
      expect(computeState(1, 4, false)).toBe('visited_once_planning');
    });
  });

  // ----------------------------------------------------------------
  // visited_once: completed = 1, planning = 0
  // ----------------------------------------------------------------

  describe('visited_once', () => {
    it('returns "visited_once" for completedCount=1, planningCount=0', () => {
      expect(computeState(1, 0, false)).toBe('visited_once');
    });
  });

  // ----------------------------------------------------------------
  // planned: completed = 0, planning >= 1
  // ----------------------------------------------------------------

  describe('planned', () => {
    it('returns "planned" for completedCount=0, planningCount=1', () => {
      expect(computeState(0, 1, false)).toBe('planned');
    });

    it('returns "planned" for completedCount=0, planningCount=3', () => {
      expect(computeState(0, 3, false)).toBe('planned');
    });
  });

  // ----------------------------------------------------------------
  // never_visited: completed = 0, planning = 0, no active
  // ----------------------------------------------------------------

  describe('never_visited', () => {
    it('returns "never_visited" for all zeros', () => {
      expect(computeState(0, 0, false)).toBe('never_visited');
    });
  });
});
