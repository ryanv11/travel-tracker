/**
 * Unit tests for computeState() — map shading state logic.
 *
 * Pure function: no DB, no mocks. Tests the 7 possible state keys
 * and the active override rule (MP-06).
 *
 * Source: src/backend/services/shading.service.ts
 * Spec:   docs/map-shading-spec.md §2
 */
import { describe, expect, it } from 'vitest';
import { computeCountryState, computeState } from '../shading.service.js';

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
// computeCountryState() — simplified any-visit rule (MAP-01)
// Country is highlighted whenever any city in the country has a trip,
// regardless of region tier. Region detail shown via RegionLayer at zoom >= 4.
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
  // Non-region-tier countries: shade on any visit
  describe('region_tier_enabled = 0 (non-region-tier country)', () => {
    it('returns "visited_once" when one completed trip', () => {
      const row = { ...baseRow, regionTierEnabled: 0, completedCount: 1 };
      expect(computeCountryState(row, undefined)).toBe('visited_once');
    });

    it('returns "planned" when only planning trips', () => {
      const row = { ...baseRow, regionTierEnabled: 0, planningCount: 2 };
      expect(computeCountryState(row, undefined)).toBe('planned');
    });

    it('returns "active" when active trip', () => {
      const row = { ...baseRow, regionTierEnabled: 0, hasActive: 1 };
      expect(computeCountryState(row, undefined)).toBe('active');
    });

    it('returns "never_visited" when no trips', () => {
      expect(computeCountryState(baseRow, undefined)).toBe('never_visited');
    });
  });

  // Region-tier countries (US, AU, CA): shade on any visit — same as non-region-tier
  describe('region_tier_enabled = 1 (region-tier country, e.g. US/AU/CA)', () => {
    it('returns "visited_once" when one completed trip, even with partial region coverage', () => {
      const row = { ...baseRow, regionTierEnabled: 1, completedCount: 1 };
      const partialCoverage = { totalRegions: 50, visitedRegions: 1 };
      expect(computeCountryState(row, partialCoverage)).toBe('visited_once');
    });

    it('returns "visited_once" when one completed trip and coverage is undefined', () => {
      const row = { ...baseRow, regionTierEnabled: 1, completedCount: 1 };
      expect(computeCountryState(row, undefined)).toBe('visited_once');
    });

    it('returns "visited_multiple" when multiple completed trips, partial coverage', () => {
      const row = { ...baseRow, regionTierEnabled: 1, completedCount: 3 };
      const partialCoverage = { totalRegions: 50, visitedRegions: 2 };
      expect(computeCountryState(row, partialCoverage)).toBe('visited_multiple');
    });

    it('returns "planned" when only planning trips, partial coverage', () => {
      const row = { ...baseRow, regionTierEnabled: 1, planningCount: 2 };
      const partialCoverage = { totalRegions: 50, visitedRegions: 0 };
      expect(computeCountryState(row, partialCoverage)).toBe('planned');
    });

    it('returns "active" when active trip, partial coverage', () => {
      const row = { ...baseRow, regionTierEnabled: 1, hasActive: 1 };
      const partialCoverage = { totalRegions: 50, visitedRegions: 1 };
      expect(computeCountryState(row, partialCoverage)).toBe('active');
    });

    it('returns "never_visited" when no trips, even with full region coverage', () => {
      const row = { ...baseRow, regionTierEnabled: 1 };
      const fullCoverage = { totalRegions: 3, visitedRegions: 3 };
      expect(computeCountryState(row, fullCoverage)).toBe('never_visited');
    });

    it('returns "visited_multiple" when all regions visited and multiple completed trips', () => {
      const row = { ...baseRow, regionTierEnabled: 1, completedCount: 3 };
      const fullCoverage = { totalRegions: 3, visitedRegions: 3 };
      expect(computeCountryState(row, fullCoverage)).toBe('visited_multiple');
    });

    it('uses all-city stats regardless of unregioned stats', () => {
      // Visiting Colorado (region_id set) shows up in completedCount, not completedUnregioned.
      // The country should still be highlighted.
      const row = {
        ...baseRow,
        regionTierEnabled: 1,
        completedCount: 1,
        completedUnregioned: 0, // city has a region_id — would fail old case (b) check
      };
      const partialCoverage = { totalRegions: 50, visitedRegions: 1 };
      expect(computeCountryState(row, partialCoverage)).toBe('visited_once');
    });

    it('coverage parameter is ignored — same result with or without coverage', () => {
      const row = { ...baseRow, regionTierEnabled: 1, completedCount: 2 };
      const partialCoverage = { totalRegions: 50, visitedRegions: 1 };
      const fullCoverage = { totalRegions: 50, visitedRegions: 50 };
      expect(computeCountryState(row, partialCoverage)).toBe('visited_multiple');
      expect(computeCountryState(row, fullCoverage)).toBe('visited_multiple');
      expect(computeCountryState(row, undefined)).toBe('visited_multiple');
    });
  });
});
