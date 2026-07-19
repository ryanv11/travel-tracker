/**
 * Unit tests for place validation schemas.
 *
 * Pure Zod schema tests — no DB, no HTTP.
 * BUG-28: cross-field arrived_on <= departed_on refinement.
 *
 * Source: src/backend/validation/places.schemas.ts
 */
import { describe, expect, it } from 'vitest';
import { CreatePlaceSchema, UpdatePlaceDatesSchema } from '../places.schemas.js';

function fails(schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown): void {
  expect(schema.safeParse(value).success).toBe(false);
}

function passes(schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown): void {
  expect(schema.safeParse(value).success).toBe(true);
}

// ----------------------------------------------------------------
// CreatePlaceSchema
// ----------------------------------------------------------------

describe('CreatePlaceSchema (BUG-28 date order)', () => {
  it('accepts arrived_on before departed_on', () => {
    passes(CreatePlaceSchema, {
      city_id: 1,
      arrived_on: '2026-06-01',
      departed_on: '2026-06-05',
    });
  });

  it('accepts arrived_on equal to departed_on (same day)', () => {
    passes(CreatePlaceSchema, {
      city_id: 1,
      arrived_on: '2026-06-03',
      departed_on: '2026-06-03',
    });
  });

  it('rejects arrived_on after departed_on with a clear message', () => {
    const result = CreatePlaceSchema.safeParse({
      city_id: 1,
      arrived_on: '2026-06-10',
      departed_on: '2026-06-05',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(JSON.stringify(result.error.issues)).toContain(
        'departed_on must be on or after arrived_on',
      );
    }
  });

  it('accepts one date with the other null or absent', () => {
    passes(CreatePlaceSchema, { city_id: 1, arrived_on: '2026-06-01' });
    passes(CreatePlaceSchema, { city_id: 1, arrived_on: '2026-06-01', departed_on: null });
    passes(CreatePlaceSchema, { city_id: 1, departed_on: '2026-06-05' });
    passes(CreatePlaceSchema, { city_id: 1 });
  });

  it('still rejects unknown keys (strict)', () => {
    fails(CreatePlaceSchema, { city_id: 1, nope: true });
  });
});

// ----------------------------------------------------------------
// UpdatePlaceDatesSchema
// ----------------------------------------------------------------

describe('UpdatePlaceDatesSchema (BUG-28 date order)', () => {
  it('accepts arrived_on before departed_on', () => {
    passes(UpdatePlaceDatesSchema, { arrived_on: '2026-06-01', departed_on: '2026-06-05' });
  });

  it('accepts arrived_on equal to departed_on (same day)', () => {
    passes(UpdatePlaceDatesSchema, { arrived_on: '2026-06-03', departed_on: '2026-06-03' });
  });

  it('rejects arrived_on after departed_on with a clear message', () => {
    const result = UpdatePlaceDatesSchema.safeParse({
      arrived_on: '2026-06-10',
      departed_on: '2026-06-05',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(JSON.stringify(result.error.issues)).toContain(
        'departed_on must be on or after arrived_on',
      );
    }
  });

  it('accepts single-field bodies (merged-result check happens in the route)', () => {
    passes(UpdatePlaceDatesSchema, { arrived_on: '2026-06-10' });
    passes(UpdatePlaceDatesSchema, { departed_on: '2026-06-01' });
    passes(UpdatePlaceDatesSchema, { arrived_on: null });
    passes(UpdatePlaceDatesSchema, {});
  });

  it('accepts nulls alongside a date (clearing one side)', () => {
    passes(UpdatePlaceDatesSchema, { arrived_on: null, departed_on: '2026-06-05' });
    passes(UpdatePlaceDatesSchema, { arrived_on: '2026-06-10', departed_on: null });
  });

  it('still rejects unknown keys (strict)', () => {
    fails(UpdatePlaceDatesSchema, { arrived_on: '2026-06-01', nope: 1 });
  });
});
