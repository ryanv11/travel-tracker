/**
 * Regression coverage for TripForm (BUG-91).
 *
 * No test file existed for TripForm before this thread (confirmed: repo-wide
 * search for "TripForm.test" turned up nothing).
 *
 * BUG-91: found in non-owner UAT — selecting a country from the "Countries"
 * picker while creating a trip saved and closed the whole form prematurely,
 * before the user could set/review dates in the same flow. Root cause,
 * confirmed by reproducing it against this exact component before writing
 * the fix: the "Search countries…" input is a plain text field inside the
 * <form>, and pressing Enter there falls through to the browser's native
 * "Enter submits the form" behaviour (any single-line text input submits the
 * enclosing form on Enter when the form has a submit button — it does NOT
 * require focus to be on the submit button itself). Clicking a country row
 * was already safe (the rows are `type="button"`, confirmed by reproduction
 * too) — only the Enter-in-search-field path was broken.
 *
 * Owner-scope: the tracker's UNVERIFIED note asked whether this also affects
 * the owner path. TripForm has no owner/non-owner branching anywhere in this
 * file, and neither DesktopTripsLayout nor MobileTripsLayout gates the "New
 * Trip" button or TripForm's mount by owner status (grep confirms the only
 * owner-gated control in either layout is the unrelated Admin nav tab) — so
 * the bug and the fix apply identically to both.
 *
 * Mocks:
 *   - useCreateTrip/useUpdateTrip from hooks/useTrips
 *   - useActiveCategories/useActiveCompanions/useActiveActivities/useCountries
 *     from hooks/useAdmin
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TripForm } from '../TripForm';

const mockCreateTrip = vi.fn();
const mockUpdateTrip = vi.fn();

vi.mock('../../../hooks/useTrips', () => ({
  useCreateTrip: () => ({ mutateAsync: mockCreateTrip, isPending: false, error: null }),
  useUpdateTrip: () => ({ mutateAsync: mockUpdateTrip, isPending: false, error: null }),
}));

vi.mock('../../../hooks/useAdmin', () => ({
  useActiveActivities: () => ({ data: [] }),
  useActiveCategories: () => ({ data: [] }),
  useActiveCompanions: () => ({ data: [] }),
  useCountries: () => ({
    data: [
      { country_code: 'GB', name: 'United Kingdom' },
      { country_code: 'US', name: 'United States' },
    ],
  }),
}));

function renderForm(onClose = vi.fn()) {
  render(
    <MemoryRouter>
      <TripForm onClose={onClose} />
    </MemoryRouter>,
  );
  return { onClose };
}

/** Fills Name + Start/End Date so the form is otherwise submittable. */
async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  const nameInput = document.querySelector('input[maxlength="75"]') as HTMLInputElement;
  await user.type(nameInput, 'Scotland Trip');
  const dateInputs = document.querySelectorAll('input[type="date"]');
  await user.type(dateInputs[0], '2026-09-01');
  await user.type(dateInputs[1], '2026-09-10');
}

describe('TripForm — country picker (BUG-91)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateTrip.mockResolvedValue({ id: 1 });
  });

  it('clicking a country in the dropdown selects it without submitting the form', async () => {
    const user = userEvent.setup();
    const { onClose } = renderForm();

    await user.type(screen.getByPlaceholderText(/Search countries…/i), 'united k');
    const gbRow = await screen.findByText('United Kingdom');
    await user.click(gbRow);

    expect(mockCreateTrip).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    // Selected chip renders, and the search dropdown clears.
    expect(screen.getByLabelText('Remove United Kingdom')).toBeInTheDocument();
  });

  it('BUG-91 regression: pressing Enter in the country search field does not submit the form', async () => {
    const user = userEvent.setup();
    const { onClose } = renderForm();

    await fillRequiredFields(user);
    await user.type(screen.getByPlaceholderText(/Search countries…/i), 'united k{Enter}');

    expect(mockCreateTrip).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    // Still on the (open) form — the country search input still renders.
    expect(screen.getByPlaceholderText(/Search countries…/i)).toBeInTheDocument();
  });

  it('the user can still submit normally via the Create Trip button after using the picker', async () => {
    const user = userEvent.setup();
    const { onClose } = renderForm();

    await fillRequiredFields(user);
    await user.type(screen.getByPlaceholderText(/Search countries…/i), 'united k');
    await user.click(await screen.findByText('United Kingdom'));
    await user.click(screen.getByRole('button', { name: 'Create Trip' }));

    expect(mockCreateTrip).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Scotland Trip',
        start_date: '2026-09-01',
        end_date: '2026-09-10',
        country_codes: ['GB'],
      }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
