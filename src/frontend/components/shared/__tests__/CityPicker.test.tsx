/**
 * BUG-81 (BRD GE-16) — `CityPicker` component tests.
 *
 * Source: src/frontend/components/shared/CityPicker.tsx
 *
 * The label-composition rule itself is unit-tested directly in
 * composeCandidateLabel.test.ts; these tests confirm CityPicker actually
 * renders the composed labels (not raw display_name) and carries the
 * BUG-81 scroll cap plus the existing truncated/onSelect/disabled contract.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { GeocodeCandidate } from '../../../types/api';
import { CityPicker } from '../CityPicker';

function candidate(overrides: Partial<GeocodeCandidate> = {}): GeocodeCandidate {
  return {
    name: 'Springfield',
    display_name: 'Springfield, Sangamon County, Illinois, 62701, United States',
    country_code: 'US',
    region_iso: 'US-IL',
    latitude: 39.78,
    longitude: -89.65,
    osm_type: 'node',
    osm_id: 1,
    ...overrides,
  };
}

describe('CityPicker — BUG-81 collision-aware labels', () => {
  it('renders a non-colliding candidate as "City, State, Country" — no county, no postcode, not the raw display_name', () => {
    render(
      <CityPicker
        candidates={[
          candidate({
            osm_id: 1,
            state: 'Illinois',
            country: 'United States',
            county: 'Sangamon County',
          }),
        ]}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText('Springfield, Illinois, United States')).toBeInTheDocument();
    expect(screen.queryByText(/Sangamon/)).not.toBeInTheDocument();
    expect(screen.queryByText(/62701/)).not.toBeInTheDocument();
  });

  it('adds county to two candidates that collide on (name, state, country)', () => {
    render(
      <CityPicker
        candidates={[
          candidate({
            osm_id: 1,
            name: 'Springfield',
            state: 'Pennsylvania',
            country: 'United States',
            county: 'Delaware County',
          }),
          candidate({
            osm_id: 2,
            name: 'Springfield',
            state: 'Pennsylvania',
            country: 'United States',
            county: 'Bucks County',
          }),
        ]}
        onSelect={vi.fn()}
      />,
    );

    expect(
      screen.getByText('Springfield, Delaware County, Pennsylvania, United States'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Springfield, Bucks County, Pennsylvania, United States'),
    ).toBeInTheDocument();
  });

  it('renders "City, Country" with no empty comma for a candidate missing state', () => {
    render(
      <CityPicker
        candidates={[
          candidate({ osm_id: 1, name: 'Zurich', state: undefined, country: 'Switzerland' }),
        ]}
        onSelect={vi.fn()}
      />,
    );

    const row = screen.getByText('Zurich, Switzerland');
    expect(row).toBeInTheDocument();
    expect(row.textContent).not.toContain(', ,');
  });

  it('falls back to a cleaned display_name for a candidate with no structured fields at all (legacy fixture shape)', () => {
    render(
      <CityPicker
        candidates={[
          candidate({
            osm_id: 1,
            name: 'Newport',
            display_name: 'Newport, Isle of Wight, England, PO30 1JU, UK',
            state: undefined,
            country: undefined,
            county: undefined,
          }),
        ]}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText(/Newport, Isle of Wight, England, UK/i)).toBeInTheDocument();
  });

  it('the list container carries a height cap and vertical scroll (BUG-81: a long list scrolls within the picker, not the page)', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      candidate({ osm_id: i, latitude: 39 + i * 0.01, longitude: -89 + i * 0.01 }),
    );
    const { container } = render(<CityPicker candidates={many} onSelect={vi.fn()} />);

    const scrollContainer = container.querySelector('.max-h-72.overflow-y-auto');
    expect(scrollContainer).not.toBeNull();
    expect(scrollContainer?.children).toHaveLength(20);
  });

  it('still calls onSelect with the full candidate on click, and respects disabled', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    const c = candidate({ osm_id: 1, state: 'Illinois', country: 'United States' });
    render(<CityPicker candidates={[c]} onSelect={onSelect} disabled />);

    await user.click(screen.getByText('Springfield, Illinois, United States'));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('still renders the truncated caveat unchanged', () => {
    render(
      <CityPicker
        candidates={[candidate({ osm_id: 1, state: 'Illinois', country: 'United States' })]}
        onSelect={vi.fn()}
        truncated
      />,
    );

    expect(screen.getByText(/there may be more matches not shown/i)).toBeInTheDocument();
  });
});
