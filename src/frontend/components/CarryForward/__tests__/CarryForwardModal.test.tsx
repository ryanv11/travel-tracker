/**
 * Scenario tests for CarryForwardModal (AC-17, IT-07).
 *
 * Mocks:
 *   - useCarryForward() from hooks/usePlaces — controls mutation state
 *
 * Covers:
 *   - No candidates are pre-selected on mount (opt-in model, FIX 3 / P0-05)
 *   - Toggling a candidate selects/deselects it
 *   - Execute button count reflects selection
 *   - Execute button disabled when 0 candidates selected
 *   - Success message shown after successful carry-forward
 *   - onClose NOT called immediately after success (BUG-03 regression)
 *   - Skip button calls onClose directly
 *
 * TODO (Frontend to fill in):
 *   - BUG-03 race condition: verify setTimeout delay — requires fake timer setup
 *     if not already using vitest fake timers. Template below uses vi.useFakeTimers().
 *
 * Source: src/frontend/components/CarryForward/CarryForwardModal.tsx
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CarryForwardCandidate } from '../../../types/api.js';
import { CarryForwardModal } from '../CarryForwardModal.js';

// ----------------------------------------------------------------
// Mock hooks
// ----------------------------------------------------------------

const mockMutateAsync = vi.fn();
const mockCarryForward = {
  mutateAsync: mockMutateAsync,
  isPending: false,
  error: null,
};

vi.mock('../../../hooks/usePlaces.js', () => ({
  useCarryForward: () => mockCarryForward,
}));

// ----------------------------------------------------------------
// Fixtures
// ----------------------------------------------------------------

const candidate1: CarryForwardCandidate = {
  id: 101,
  item_type: 'restaurant',
  status: 'next_time',
  restaurant_name: 'Sukiyabashi Jiro',
  hotel_property_name: null,
  notes: null,
  source_trip_name: 'Japan 2022',
  source_trip_end_date: '2022-04-20',
};

const candidate2: CarryForwardCandidate = {
  id: 102,
  item_type: 'experience',
  status: 'next_time',
  restaurant_name: null,
  hotel_property_name: null,
  notes: 'Tokyo DisneySea — book early',
  source_trip_name: 'Japan 2022',
  source_trip_end_date: '2022-04-20',
};

const defaultProps = {
  tripId: 1,
  placeId: 10,
  cityId: 5,
  candidates: [candidate1, candidate2],
  onClose: vi.fn(),
};

// ----------------------------------------------------------------
// Tests
// ----------------------------------------------------------------

describe('CarryForwardModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCarryForward.isPending = false;
    mockCarryForward.error = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders a heading', () => {
    render(<CarryForwardModal {...defaultProps} />);
    expect(screen.getByText('Carry-forward suggestions')).toBeInTheDocument();
  });

  it('renders all candidate names', () => {
    render(<CarryForwardModal {...defaultProps} />);
    expect(screen.getByText('Sukiyabashi Jiro')).toBeInTheDocument();
    // Text appears in both the label and the italic notes div — use getAllByText
    expect(screen.getAllByText(/Tokyo DisneySea/).length).toBeGreaterThan(0);
  });

  // FIX 3 (P0-05): modal opens with empty selection (opt-in model)
  it('no candidates are pre-selected on mount', () => {
    render(<CarryForwardModal {...defaultProps} />);
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(2);
    checkboxes.forEach((cb) => {
      expect(cb).not.toBeChecked();
    });
  });

  it('shows carry-forward button with count of 0 on mount (button disabled)', () => {
    render(<CarryForwardModal {...defaultProps} />);
    // No count in label when 0 selected; button is disabled
    const btn = screen.getByRole('button', { name: /Carry Forward/ });
    expect(btn).toBeDisabled();
  });

  it('selects a candidate when toggled', async () => {
    render(<CarryForwardModal {...defaultProps} />);
    const checkboxes = screen.getAllByRole('checkbox');
    await userEvent.click(checkboxes[0]);
    expect(checkboxes[0]).toBeChecked();
  });

  it('updates button count after selection', async () => {
    render(<CarryForwardModal {...defaultProps} />);
    const checkboxes = screen.getAllByRole('checkbox');
    await userEvent.click(checkboxes[0]);
    expect(screen.getByRole('button', { name: /Carry Forward \(1\)/ })).toBeInTheDocument();
  });

  it('disables execute button when no candidates are selected', () => {
    render(<CarryForwardModal {...defaultProps} />);
    const btn = screen.getByRole('button', { name: /Carry Forward/ });
    expect(btn).toBeDisabled();
  });

  it('deselects a candidate when toggled twice', async () => {
    render(<CarryForwardModal {...defaultProps} />);
    const checkboxes = screen.getAllByRole('checkbox');
    await userEvent.click(checkboxes[0]);
    await userEvent.click(checkboxes[0]);
    expect(checkboxes[0]).not.toBeChecked();
  });

  it('calls carryForward.mutateAsync with selected IDs on execute', async () => {
    mockMutateAsync.mockResolvedValue({ count: 2, created_item_ids: [201, 202] });
    render(<CarryForwardModal {...defaultProps} />);
    // Select both candidates first
    const checkboxes = screen.getAllByRole('checkbox');
    await userEvent.click(checkboxes[0]);
    await userEvent.click(checkboxes[1]);
    await userEvent.click(screen.getByRole('button', { name: /Carry Forward \(2\)/ }));
    expect(mockMutateAsync).toHaveBeenCalledWith({
      tripId: 1,
      placeId: 10,
      sourceItemIds: expect.arrayContaining([101, 102]),
    });
  });

  it('shows success message after carry-forward', async () => {
    mockMutateAsync.mockResolvedValue({ count: 2, created_item_ids: [201, 202] });
    render(<CarryForwardModal {...defaultProps} />);
    const checkboxes = screen.getAllByRole('checkbox');
    await userEvent.click(checkboxes[0]);
    await userEvent.click(checkboxes[1]);
    await userEvent.click(screen.getByRole('button', { name: /Carry Forward \(2\)/ }));
    await waitFor(() => {
      expect(screen.getByText(/2 items added to your trip as suggestions/)).toBeInTheDocument();
    });
  });

  // BUG-03 regression: onClose must NOT be called immediately after success.
  // There must be a delay (setTimeout) before dismissing the modal so the user
  // can see the success message.
  it('BUG-03 regression: onClose is not called immediately after success', async () => {
    // No fake timers needed — we just verify onClose is not called while
    // the success message is visible. The real 1500ms setTimeout will fire
    // harmlessly after the test ends.
    mockMutateAsync.mockResolvedValue({ count: 2, created_item_ids: [201, 202] });
    render(<CarryForwardModal {...defaultProps} />);
    const checkboxes = screen.getAllByRole('checkbox');
    await userEvent.click(checkboxes[0]);
    await userEvent.click(checkboxes[1]);
    await userEvent.click(screen.getByRole('button', { name: /Carry Forward \(2\)/ }));
    await waitFor(() => {
      expect(screen.getByText(/2 items added/)).toBeInTheDocument();
    });
    // onClose not yet called — success message is still visible
    expect(defaultProps.onClose).not.toHaveBeenCalled();
  });

  it('calls onClose after the success timeout elapses', async () => {
    vi.useFakeTimers();
    mockMutateAsync.mockResolvedValue({ count: 1, created_item_ids: [201] });
    render(<CarryForwardModal {...defaultProps} />);
    // Select one candidate first, then click carry forward
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    // Use fireEvent (synchronous) to avoid userEvent's internal timer dependency
    fireEvent.click(screen.getByRole('button', { name: /Carry Forward \(1\)/ }));
    // Flush promises (mutateAsync resolves via microtask)
    await act(async () => {
      await Promise.resolve();
    });
    // Success message should now be set; advance timers past the 1500ms delay
    act(() => {
      vi.runAllTimers();
    });
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose immediately when Skip is clicked', async () => {
    render(<CarryForwardModal {...defaultProps} />);
    await userEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('renders singular "1 item" in success message for count=1', async () => {
    mockMutateAsync.mockResolvedValue({ count: 1, created_item_ids: [201] });
    render(<CarryForwardModal {...defaultProps} />);
    // Select one candidate before executing
    const checkboxes = screen.getAllByRole('checkbox');
    await userEvent.click(checkboxes[0]);
    await userEvent.click(screen.getByRole('button', { name: /Carry Forward \(1\)/ }));
    await waitFor(() => {
      expect(screen.getByText(/1 item added to your trip as suggestions/)).toBeInTheDocument();
    });
  });
});
