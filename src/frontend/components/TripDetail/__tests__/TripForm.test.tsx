/**
 * Regression coverage for TripForm (BUG-91).
 *
 * No test file existed for TripForm before the original BUG-91 thread
 * (confirmed: repo-wide search for "TripForm.test" turned up nothing).
 *
 * BUG-91 round 1 (PR #458): found in non-owner UAT — selecting a country
 * from the "Countries" picker while creating a trip saved and closed the
 * whole form prematurely, before the user could set/review dates in the
 * same flow. That round's root cause: the "Search countries…" input fell
 * through to the browser's native "Enter submits the form" behaviour. Fixed
 * with a scoped onKeyDown on that one input.
 *
 * BUG-91 round 2 (this file's most recent update): PO UAT 2026-08-11 found
 * the CLICK-select path (not Enter) still saved/closed the form. Extensive
 * reproduction attempts — a jsdom repro with required fields pre-filled
 * (the very case this file's original click test did NOT cover — it left
 * Name/dates empty, so even if a submit had fired, the custom validation
 * guard would have masked it either way) and a live Chromium E2E repro,
 * including one where the results dropdown was made to visually overlap the
 * Create Trip button — never reproduced a native submit from a plain click.
 * The fix removes the form's ability to implicit-submit at all, rather than
 * chasing the specific trigger: the Create/Save button is now type="button"
 * calling handleSave directly, and no button in the form is type="submit"
 * — see the in-component comment above the <form> tag for the full
 * reasoning. This closes the original Enter bug, the click regression, and
 * any other not-yet-seen implicit-submission trigger in one structural
 * change instead of one more deny-listed element.
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

  it('BUG-91 round-2 regression: clicking a country with Name+dates ALREADY filled does not submit', async () => {
    // The original click test above leaves Name/dates empty, which means it
    // cannot distinguish "the click never submitted" from "it submitted, but
    // handleSave's own validation silently swallowed it" — both look
    // identical (createTrip/onClose uncalled) when required fields are
    // empty. This is the case PO's 2026-08-11 re-UAT actually hit: fields
    // already filled, then a country clicked.
    const user = userEvent.setup();
    const { onClose } = renderForm();

    await fillRequiredFields(user);
    await user.type(screen.getByPlaceholderText(/Search countries…/i), 'united k');
    await user.click(await screen.findByText('United Kingdom'));

    expect(mockCreateTrip).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'New Trip' })).toBeInTheDocument();
    expect(screen.getByLabelText('Remove United Kingdom')).toBeInTheDocument();
  });

  it('BUG-91 round-2 regression: selecting TWO countries by click in sequence never submits early', async () => {
    const user = userEvent.setup();
    const { onClose } = renderForm();

    await fillRequiredFields(user);
    await user.type(screen.getByPlaceholderText(/Search countries…/i), 'united k');
    await user.click(await screen.findByText('United Kingdom'));
    await user.type(screen.getByPlaceholderText(/Search countries…/i), 'united s');
    await user.click(await screen.findByText('United States'));

    expect(mockCreateTrip).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Remove United Kingdom')).toBeInTheDocument();
    expect(screen.getByLabelText('Remove United States')).toBeInTheDocument();
  });

  it('BUG-91 round-2 regression: removing a selected-country chip by click never submits', async () => {
    const user = userEvent.setup();
    const { onClose } = renderForm();

    await fillRequiredFields(user);
    await user.type(screen.getByPlaceholderText(/Search countries…/i), 'united k');
    await user.click(await screen.findByText('United Kingdom'));
    await user.click(screen.getByLabelText('Remove United Kingdom'));

    expect(mockCreateTrip).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Remove United Kingdom')).not.toBeInTheDocument();
  });

  it('BUG-91 round-2: pressing Enter in the Name field no longer submits either (form has no submit-type button)', async () => {
    // Documents a deliberate behaviour change: the round-2 fix removes every
    // implicit-submission path structurally (no type="submit" button
    // anywhere in the form) rather than deny-listing individual fields, so
    // Enter no longer submits from ANY field, including Name — previously a
    // (never formally required) convenience. Saving now always requires an
    // explicit click/activation of the Create Trip / Save Changes button.
    const user = userEvent.setup();
    const { onClose } = renderForm();

    const nameInput = document.querySelector('input[maxlength="75"]') as HTMLInputElement;
    await user.type(nameInput, 'Scotland Trip{Enter}');
    const dateInputs = document.querySelectorAll('input[type="date"]');
    await user.type(dateInputs[0], '2026-09-01');
    await user.type(dateInputs[1], '2026-09-10{Enter}');

    expect(mockCreateTrip).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('BUG-91 structural invariant: the form contains no type="submit" element', () => {
    // The whole round-2 fix rests on the form having no default (submit-
    // type) button — per the HTML implicit-submission algorithm, a form
    // with no default button does nothing on Enter, from any field, in any
    // browser. A future edit re-adding type="submit" anywhere in this form
    // (e.g. "restoring" native submission for convenience) would silently
    // reopen every implicit-submission path this fix closes. Pin it.
    renderForm();
    const form = document.querySelector('form');
    expect(form?.querySelector('[type="submit"]')).toBeNull();
  });
});
