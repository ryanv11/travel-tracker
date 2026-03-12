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
import { computeState, computeCountryState } from '../shading.service.js';

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

// ----------------------------------------------------------------
// computeCountryState() — SHADING-SPEC-01 v1.1 country shading rule
// ----------------------------------------------------------------

const baseRow = {
  regionTierEnabled: 0,
  hasActive: 0,
  completedCount: 0,
  planningCount: 0,
  hasActiveUnregioned: 0,
  completedUnregioned: 0,
  planningUnregioned: 0,
};

describe('computeCountryState()', () => {
  // Case (a): region tier disabled — behaves like old spec
  describe('case (a): region_tier_enabled = 0', () => {
    it('returns "visited_once" when one completed trip, no region tier', () => {
      const row = { ...baseRow, regionTierEnabled: 0, completedCount: 1 };
      expect(computeCountryState(row, undefined)).toBe('visited_once');
    });

    it('returns "planned" when only planning trips, no region tier', () => {
      const row = { ...baseRow, regionTierEnabled: 0, planningCount: 2 };
      expect(computeCountryState(row, undefined)).toBe('planned');
    });

    it('returns "active" when active trip, no region tier', () => {
      const row = { ...baseRow, regionTierEnabled: 0, hasActive: 1 };
      expect(computeCountryState(row, undefined)).toBe('active');
    });

    it('returns "never_visited" when no trips, no region tier', () => {
      expect(computeCountryState(baseRow, undefined)).toBe('never_visited');
    });
  });

  // Case (c): region tier enabled, all regions visited
  describe('case (c): all regions visited', () => {
    const fullCoverage = { totalRegions: 3, visitedRegions: 3 };

    it('returns "visited_once" when all regions visited and one completed trip', () => {
      const row = { ...baseRow, regionTierEnabled: 1, completedCount: 1 };
      expect(computeCountryState(row, fullCoverage)).toBe('visited_once');
    });

    it('returns "visited_multiple" when all regions visited and multiple completed', () => {
      const row = { ...baseRow, regionTierEnabled: 1, completedCount: 3 };
      expect(computeCountryState(row, fullCoverage)).toBe('visited_multiple');
    });

    it('returns "planned" when all regions have only planning trips', () => {
      const row = { ...baseRow, regionTierEnabled: 1, planningCount: 2 };
      expect(computeCountryState(row, fullCoverage)).toBe('planned');
    });
  });

  // Case (c) boundary: not all regions visited
  describe('case (c) boundary: partial region coverage', () => {
    const partialCoverage = { totalRegions: 3, visitedRegions: 2 };

    it('returns "never_visited" when region tier enabled but not all regions visited and no unregioned cities', () => {
      const row = { ...baseRow, regionTierEnabled: 1, completedCount: 2 };
      expect(computeCountryState(row, partialCoverage)).toBe('never_visited');
    });

    it('returns "never_visited" when coverage is undefined (no regions in DB yet)', () => {
      const row = { ...baseRow, regionTierEnabled: 1, completedCount: 1 };
      expect(computeCountryState(row, undefined)).toBe('never_visited');
    });

    it('returns "never_visited" when totalRegions = 0 (edge case)', () => {
      const row = { ...baseRow, regionTierEnabled: 1, completedCount: 1 };
      expect(computeCountryState(row, { totalRegions: 0, visitedRegions: 0 })).toBe('never_visited');
    });
  });

  // Case (b): region tier enabled, unregioned cities exist
  describe('case (b): unregioned cities have trips', () => {
    const partialCoverage = { totalRegions: 3, visitedRegions: 1 };

    it('returns "visited_once" from unregioned stats when case (b) applies', () => {
      const row = { ...baseRow, regionTierEnabled: 1, completedUnregioned: 1 };
      expect(computeCountryState(row, partialCoverage)).toBe('visited_once');
    });

    it('returns "planned" from unregioned stats when only planning trips on unregioned cities', () => {
      const row = { ...baseRow, regionTierEnabled: 1, planningUnregioned: 1 };
      expect(computeCountryState(row, partialCoverage)).toBe('planned');
    });

    it('returns "active" from unregioned stats when active trip on unregioned city', () => {
      const row = { ...baseRow, regionTierEnabled: 1, hasActiveUnregioned: 1 };
      expect(computeCountryState(row, partialCoverage)).toBe('active');
    });
  });

  // Case (c) takes priority over case (b)
  describe('case (c) takes priority when all regions visited', () => {
    const fullCoverage = { totalRegions: 2, visitedRegions: 2 };

    it('uses all-city stats (case c) rather than unregioned stats when all regions visited', () => {
      const row = {
        ...baseRow,
        regionTierEnabled: 1,
        completedCount: 3,        // all-city: 3 completed
        completedUnregioned: 1,   // unregioned: only 1
      };
      // Should return visited_multiple (from all-city stats), not visited_once (from unregioned)
      expect(computeCountryState(row, fullCoverage)).toBe('visited_multiple');
    });
  });
});
