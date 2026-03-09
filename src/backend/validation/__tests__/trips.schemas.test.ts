/**
 * Unit tests for trip validation schemas.
 *
 * Pure Zod schema tests — no DB, no HTTP.
 *
 * Source: src/backend/validation/trips.schemas.ts
 */
import { describe, it, expect } from 'vitest';
import {
  CreateTripSchema,
  UpdateTripSchema,
  UpdateTripStatusSchema,
  ListTripsQuerySchema,
} from '../trips.schemas.js';

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

function passes<T>(schema: { parse: (v: unknown) => T }, value: unknown): T {
  return schema.parse(value);
}

function fails(schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown): void {
  expect(schema.safeParse(value).success).toBe(false);
}

// ----------------------------------------------------------------
// CreateTripSchema
// ----------------------------------------------------------------

describe('CreateTripSchema', () => {
  const valid = {
    name: 'Japan 2024',
    start_date: '2024-04-01',
    end_date: '2024-04-14',
  };

  it('accepts a minimal valid trip', () => {
    const result = passes(CreateTripSchema, valid);
    expect(result.name).toBe('Japan 2024');
    expect(result.start_date).toBe('2024-04-01');
    expect(result.end_date).toBe('2024-04-14');
  });

  it('accepts all optional fields', () => {
    const result = passes(CreateTripSchema, {
      ...valid,
      photo_album_ref: 'https://photos.example.com/japan',
      category_ids: [1, 2],
      companion_ids: [3],
      activity_ids: [4, 5],
    });
    expect(result.photo_album_ref).toBe('https://photos.example.com/japan');
    expect(result.category_ids).toEqual([1, 2]);
  });

  it('rejects when name is missing', () => {
    fails(CreateTripSchema, { ...valid, name: undefined });
  });

  it('rejects an empty name', () => {
    fails(CreateTripSchema, { ...valid, name: '' });
  });

  it('rejects when start_date is missing', () => {
    fails(CreateTripSchema, { ...valid, start_date: undefined });
  });

  it('rejects an invalid date format', () => {
    fails(CreateTripSchema, { ...valid, start_date: '01/04/2024' });
  });

  it('rejects when end_date is before start_date', () => {
    fails(CreateTripSchema, { ...valid, start_date: '2024-04-14', end_date: '2024-04-01' });
  });

  it('accepts when end_date equals start_date (same day)', () => {
    const result = passes(CreateTripSchema, {
      ...valid,
      start_date: '2024-06-01',
      end_date: '2024-06-01',
    });
    expect(result.start_date).toBe('2024-06-01');
  });

  it('rejects unknown extra fields (strict mode)', () => {
    fails(CreateTripSchema, { ...valid, unknown_field: 'value' });
  });

  it('trims whitespace from name', () => {
    const result = passes(CreateTripSchema, { ...valid, name: '  Japan 2024  ' });
    expect(result.name).toBe('Japan 2024');
  });
});

// ----------------------------------------------------------------
// UpdateTripSchema
// ----------------------------------------------------------------

describe('UpdateTripSchema', () => {
  it('accepts an empty update (all fields optional)', () => {
    const result = passes(UpdateTripSchema, {});
    expect(result).toEqual({});
  });

  it('accepts a partial update with name only', () => {
    const result = passes(UpdateTripSchema, { name: 'Updated Name' });
    expect(result.name).toBe('Updated Name');
  });

  it('accepts updating dates', () => {
    const result = passes(UpdateTripSchema, {
      start_date: '2024-05-01',
      end_date: '2024-05-10',
    });
    expect(result.start_date).toBe('2024-05-01');
  });

  it('rejects when both dates present and end_date < start_date', () => {
    fails(UpdateTripSchema, { start_date: '2024-05-10', end_date: '2024-05-01' });
  });

  it('allows end_date without start_date (no cross-validation without both)', () => {
    // Only cross-validates when BOTH dates are provided.
    const result = passes(UpdateTripSchema, { end_date: '2024-05-01' });
    expect(result.end_date).toBe('2024-05-01');
  });

  it('rejects unknown extra fields (strict mode)', () => {
    fails(UpdateTripSchema, { name: 'Valid', extra: 'bad' });
  });

  it('rejects an empty string for name', () => {
    fails(UpdateTripSchema, { name: '' });
  });
});

// ----------------------------------------------------------------
// UpdateTripStatusSchema
// ----------------------------------------------------------------

describe('UpdateTripStatusSchema', () => {
  const validStatuses = ['planning', 'active', 'review_pending', 'locked'] as const;

  validStatuses.forEach((status) => {
    it(`accepts status "${status}"`, () => {
      expect(passes(UpdateTripStatusSchema, { status }).status).toBe(status);
    });
  });

  it('rejects an invalid status', () => {
    fails(UpdateTripStatusSchema, { status: 'completed' });
  });

  it('rejects when status field is missing', () => {
    fails(UpdateTripStatusSchema, {});
  });

  it('rejects extra fields (strict mode)', () => {
    fails(UpdateTripStatusSchema, { status: 'planning', extra: 'bad' });
  });
});

// ----------------------------------------------------------------
// ListTripsQuerySchema
// ----------------------------------------------------------------

describe('ListTripsQuerySchema', () => {
  it('accepts an empty query (all filters optional)', () => {
    const result = passes(ListTripsQuerySchema, {});
    expect(result).toEqual({});
  });

  it('accepts a valid status filter', () => {
    const result = passes(ListTripsQuerySchema, { status: 'planning' });
    expect(result.status).toBe('planning');
  });

  it('accepts category_id as a number', () => {
    const result = passes(ListTripsQuerySchema, { category_id: 3 });
    expect(result.category_id).toBe(3);
  });

  it('coerces category_id from string (query param)', () => {
    const result = passes(ListTripsQuerySchema, { category_id: '3' });
    expect(result.category_id).toBe(3);
  });

  // NOTE: strict enum validation — unknown status returns 400, not empty array.
  // This was verified in the contract test suite (trips.contract.test.ts).
  it('rejects an unknown status value', () => {
    fails(ListTripsQuerySchema, { status: 'unknown' });
  });

  it('rejects a non-positive category_id', () => {
    fails(ListTripsQuerySchema, { category_id: 0 });
  });

  it('rejects a negative activity_id', () => {
    fails(ListTripsQuerySchema, { activity_id: -1 });
  });
});
