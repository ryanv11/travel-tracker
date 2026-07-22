/**
 * WP-04 — mobile Trips layout E2E coverage.
 *
 * Runs at a 390×844 viewport (iPhone-class, matches the spec's reference
 * frame) so `useIsMobile()` picks the mobile branch (<768px cutoff). Covers
 * the net-new list↔detail slide surface plus every preservation-list item
 * that has mobile-specific markup (compact Edit/Photos icon pair, bottom tab
 * bar list-view-only, no-horizontal-scroll).
 *
 * Locator scoping: per the WP-03/WP-04 brief, all detail-view assertions are
 * scoped through `getByTestId('trip-detail-panel')` rather than `.nth()`/
 * `.first()` tricks — the list and detail panels are BOTH mounted at all
 * times (for the slide transition), so unscoped locators are even more likely
 * to hit the wrong (fading-out) panel here than in the desktop two-panel
 * layout that motivated the existing `.nth()`/`.first()` workarounds.
 */
import { expect, test } from '@playwright/test';
import {
  createPlace,
  createTrip,
  deleteAllTrips,
  getOrCreateCity,
  transitionTripStatus,
} from './helpers/factories';

test.use({ viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ request }) => {
  await deleteAllTrips(request);
});

test.describe('Mobile list view', () => {
  test('renders trip list with FAB, search, and status chips', async ({ page, request }) => {
    await createTrip(request, { name: 'Lisbon Weekend' });
    await page.goto('http://localhost:5173/trips');

    await expect(page.getByText('My Trips')).toBeVisible();
    await expect(page.getByText('Lisbon Weekend')).toBeVisible();
    await expect(page.getByPlaceholder('Search trips or places…')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Planning/ })).toBeVisible();
    // Bottom tab bar is present in list view (C9) — scoped via <nav> since the
    // mobile detail view's back bar also has an accessible name of "Trips"
    // (never simultaneously mounted with the tab bar, but scope explicitly
    // rather than relying on that).
    await expect(
      page.locator('nav').getByRole('button', { name: 'Trips', exact: true }),
    ).toBeVisible();
  });

  test('FAB opens the New Trip form', async ({ page }) => {
    await page.goto('http://localhost:5173/trips');
    await page.getByRole('button', { name: 'New Trip' }).click();
    await expect(page.getByText('New Trip', { exact: true })).toBeVisible();
  });

  test('status chip filters and per-status counts are preserved (NTH-03)', async ({
    page,
    request,
  }) => {
    await createTrip(request, { name: 'Planning Trip' });
    const active = await createTrip(request, { name: 'Active Trip' });
    await transitionTripStatus(request, active.id, 'active');

    await page.goto('http://localhost:5173/trips');
    await expect(page.getByRole('button', { name: /^Planning \(1\)/ })).toBeVisible();
    await page.getByRole('button', { name: /^Planning/ }).click();
    await expect(page.getByText('Planning Trip')).toBeVisible();
    await expect(page.getByText('Active Trip')).not.toBeVisible();
  });

  test('sort control reorders the list (TR-09)', async ({ page, request }) => {
    await createTrip(request, { name: 'Zebra Trip' });
    await createTrip(request, { name: 'Apple Trip' });
    await page.goto('http://localhost:5173/trips');
    await expect(page.getByText('Zebra Trip')).toBeVisible();

    await page.locator('select').selectOption('name_asc');
    await expect(page.getByText('Apple Trip')).toBeVisible();

    const html = await page.content();
    expect(html.indexOf('Apple Trip')).toBeLessThan(html.indexOf('Zebra Trip'));
  });

  test('bulk multi-select delete with 5s undo bar (FEAT-BD/NTH-01)', async ({ page, request }) => {
    await createTrip(request, { name: 'Doomed Trip' });
    await createTrip(request, { name: 'Safe Trip' });
    await page.goto('http://localhost:5173/trips');

    page.on('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Select' }).click();
    await page.getByLabel('Select trip Doomed Trip').click();
    await page.getByRole('button', { name: 'Delete' }).click();

    // Undo bar appears immediately
    await expect(page.getByText(/Deleting 1 trip/)).toBeVisible();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByText(/Deleting 1 trip/)).not.toBeVisible();
    // Undo cancelled the delete — trip still present after the original 5s window
    await page.waitForTimeout(5_500);
    await expect(page.getByText('Doomed Trip')).toBeVisible();
  });

  test('status filter chip row is the one permitted horizontal-scroll exception', async ({
    page,
  }) => {
    await page.goto('http://localhost:5173/trips');
    // Structural check (not data-dependent overflow): this row is the one
    // element on the mobile Trips screen deliberately given overflow-x, per
    // the COO/PO 2026-07-21 no-horizontal-scroll constraint's sole exception.
    const chipRow = page.getByRole('button', { name: 'All', exact: true }).locator('..');
    const overflowX = await chipRow.evaluate((el) => getComputedStyle(el).overflowX);
    expect(overflowX).toBe('auto');
  });
});

test.describe('Mobile list↔detail transition', () => {
  test('selecting a trip slides to detail view; back button returns to list', async ({
    page,
    request,
  }) => {
    const trip = await createTrip(request, { name: 'Kyoto Trip' });
    await page.goto('http://localhost:5173/trips');

    await page.getByText('Kyoto Trip').click();
    await expect(page).toHaveURL(new RegExp(`/trips/${trip.id}`));

    const detailPanel = page.getByTestId('trip-detail-panel');
    await expect(detailPanel.getByText('Kyoto Trip')).toBeVisible();

    // Bottom tab bar hides once a trip is selected (C9 — list-view only).
    // Scoped via <nav> since the detail view's own back bar button also has
    // an accessible name of "Trips" (never simultaneously mounted with the
    // tab bar, but scope explicitly rather than relying on that).
    await expect(
      page.locator('nav').getByRole('button', { name: 'Trips', exact: true }),
    ).not.toBeVisible();

    // Back bar (inside the detail panel, NOT the bottom tab bar) returns to the list
    await detailPanel.getByRole('button', { name: 'Trips', exact: true }).click();
    await expect(page).toHaveURL(/\/trips$/);
    await expect(
      page.locator('nav').getByRole('button', { name: 'Trips', exact: true }),
    ).toBeVisible();
  });

  test('deep link to /trips/:id opens directly in detail view', async ({ page, request }) => {
    const trip = await createTrip(request, { name: 'Deep Link Mobile Trip' });
    await page.goto(`http://localhost:5173/trips/${trip.id}`);
    await expect(
      page.getByTestId('trip-detail-panel').getByText('Deep Link Mobile Trip'),
    ).toBeVisible();
  });
});

test.describe('Mobile detail view — preservation list', () => {
  test('compact Edit/Photos icon pair works; Edit hidden when locked', async ({
    page,
    request,
  }) => {
    const trip = await createTrip(request, { name: 'Icon Pair Trip' });
    await page.goto(`http://localhost:5173/trips/${trip.id}`);
    const detail = page.getByTestId('trip-detail-panel');

    await expect(detail.getByRole('button', { name: 'Photos' })).toBeVisible();
    await detail.getByRole('button', { name: 'Photos' }).click();
    await expect(detail.getByText('Photos feature coming soon!')).toBeVisible();

    await detail.getByRole('button', { name: 'Edit' }).click();
    await expect(page.getByText('Edit Trip')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();

    // Lock the trip, then confirm Edit hides but Photos stays (matches desktop rule)
    await transitionTripStatus(request, trip.id, 'active');
    await transitionTripStatus(request, trip.id, 'review_pending');
    await transitionTripStatus(request, trip.id, 'locked');
    await page.goto(`http://localhost:5173/trips/${trip.id}`);
    await expect(
      page.getByTestId('trip-detail-panel').getByRole('button', { name: 'Edit' }),
    ).not.toBeVisible();
    await expect(
      page.getByTestId('trip-detail-panel').getByRole('button', { name: 'Photos' }),
    ).toBeVisible();
  });

  test('status stepper transition + Unlock affordance (C2) work on mobile', async ({
    page,
    request,
  }) => {
    const trip = await createTrip(request, { name: 'Mobile Status Trip' });
    await page.goto(`http://localhost:5173/trips/${trip.id}`);
    const detail = page.getByTestId('trip-detail-panel');

    await expect(detail.getByRole('button', { name: 'Mark as Active' })).toBeVisible();
    await detail.getByRole('button', { name: 'Mark as Active' }).click();
    await expect(detail.getByRole('button', { name: 'Move to Review' })).toBeVisible({
      timeout: 5_000,
    });

    await transitionTripStatus(request, trip.id, 'review_pending');
    await transitionTripStatus(request, trip.id, 'locked');
    await page.goto(`http://localhost:5173/trips/${trip.id}`);

    await expect(
      page.getByTestId('trip-detail-panel').getByText('Read-only — trip is locked.'),
    ).toBeVisible();
    await page.getByTestId('trip-detail-panel').getByRole('button', { name: 'Unlock' }).click();
    const unlockModal = page.getByRole('heading', { name: 'Unlock this trip?' }).locator('..');
    await unlockModal.getByRole('button', { name: 'Unlock' }).click();

    // Unlock returns the trip to review_pending, which both mobile and desktop
    // route to ReviewPanel instead of the detail view (pre-existing behavior,
    // unchanged by this brief) — assert the genuinely-unlocked state via
    // ReviewPanel's own UI (not just the locked banner's absence, which would
    // trivially pass if the detail content failed to render at all).
    await expect(page.getByTestId('trip-detail-panel').getByText(/Post-Trip Review/)).toBeVisible({
      timeout: 5_000,
    });
  });

  test('Set/Edit dates and Remove place are preserved (UX-02/BUG-32)', async ({
    page,
    request,
  }) => {
    const trip = await createTrip(request, { name: 'Place Actions Trip' });
    const city = await getOrCreateCity(request, 'MobilePlaceCity', 'PT');
    await createPlace(request, trip.id, city.id);

    await page.goto(`http://localhost:5173/trips/${trip.id}`);
    const detail = page.getByTestId('trip-detail-panel');
    await expect(detail.getByText('MobilePlaceCity').first()).toBeVisible();

    await expect(detail.getByRole('button', { name: 'Set dates' })).toBeVisible();

    await detail.getByRole('button', { name: 'Remove' }).click();
    const removeModal = page
      .getByRole('heading', { name: 'Remove MobilePlaceCity?' })
      .locator('..');
    await expect(removeModal).toBeVisible();
    await removeModal.getByRole('button', { name: 'Remove' }).click();
    // exact:true avoids a strict-mode violation against the (already-closing)
    // confirm dialog's own "Remove MobilePlaceCity?" heading / message text,
    // which are superset substrings of the plain city-name span — strict-mode
    // violations abort a Playwright assertion immediately rather than retrying
    // through them, so a plain substring match here would fail on the very
    // first poll regardless of how long the timeout is.
    await expect(detail.getByText('MobilePlaceCity', { exact: true })).not.toBeVisible({
      timeout: 5_000,
    });
  });

  test('trip-level items section is preserved (BUG-36/IT-01)', async ({ page, request }) => {
    const trip = await createTrip(request, { name: 'Trip Items Mobile' });
    await page.goto(`http://localhost:5173/trips/${trip.id}`);
    const detail = page.getByTestId('trip-detail-panel');

    // Scoped via the section's own testid: a plain substring match on "Trip
    // Items" would also hit the trip title heading ("Trip Items Mobile").
    const tripItemsSection = detail.getByTestId('trip-items-section');
    await expect(tripItemsSection.getByText('Trip Items', { exact: true })).toBeVisible();
    await detail.getByRole('button', { name: '+ Add Trip Item' }).click();
    await page.locator('button', { hasText: 'Flight' }).first().click();
    await page
      .locator('label')
      .filter({ hasText: 'Airline' })
      .locator('xpath=following-sibling::input')
      .fill('Mobile Air');
    await page.getByRole('button', { name: 'Add Item', exact: true }).click();

    await expect(detail.getByText('Mobile Air')).toBeVisible();
  });

  test('rating stars survive the reskin (C5)', async ({ page, request }) => {
    const trip = await createTrip(request, { name: 'Ratings Mobile Trip' });
    const city = await getOrCreateCity(request, 'RatingsMobileCity', 'IT');
    const place = await createPlace(request, trip.id, city.id);

    const createRes = await request.post(`http://localhost:3001/api/trips/${trip.id}/items`, {
      data: {
        item_type: 'restaurant',
        status: 'completed',
        trip_place_id: place.id,
        name: 'Trattoria Mobile',
        cuisine_type: 'Italian',
      },
    });
    if (!createRes.ok()) throw new Error(`seed restaurant item failed: ${createRes.status()}`);
    const item = (await createRes.json()) as { id: number };

    // ADL-14: rating is NOT settable at create time ("lazy creation on first
    // rating" — repositories/items.ts create path explicitly skips it) — set
    // it via the real PATCH path, same as the app's own edit flow does.
    const patchRes = await request.patch(
      `http://localhost:3001/api/trips/${trip.id}/items/${item.id}`,
      { data: { rating: 4 } },
    );
    if (!patchRes.ok()) throw new Error(`patch rating failed: ${patchRes.status()}`);

    await page.goto(`http://localhost:5173/trips/${trip.id}`);
    const detail = page.getByTestId('trip-detail-panel');
    await expect(detail.getByText('Trattoria Mobile')).toBeVisible();
    await expect(detail.getByText('Italian')).toBeVisible();
    // RatingStars renders a plain <span aria-label="..."> (not a labelable form
    // control), so match via attribute selector rather than getByLabel (which
    // only associates <label>-linked form controls).
    await expect(detail.locator('[aria-label="Rating: 4 out of 5"]')).toBeVisible();
  });

  test('carried-forward tag survives the reskin (C5)', async ({ page, request }) => {
    // Source trip: an item marked 'next_time' at a given city — the real
    // precondition for carry-forward eligibility (IT-07).
    const sourceTrip = await createTrip(request, { name: 'Source Trip For Carry Forward' });
    const city = await getOrCreateCity(request, 'CarryForwardCity', 'JP');
    const sourcePlace = await createPlace(request, sourceTrip.id, city.id);
    const sourceItemRes = await request.post(
      `http://localhost:3001/api/trips/${sourceTrip.id}/items`,
      {
        data: {
          item_type: 'restaurant',
          status: 'next_time',
          trip_place_id: sourcePlace.id,
          name: 'Ramen Spot To Revisit',
        },
      },
    );
    if (!sourceItemRes.ok())
      throw new Error(`seed next_time item failed: ${sourceItemRes.status()}`);
    const sourceItem = (await sourceItemRes.json()) as { id: number };

    // Target trip: same city, then execute the real carry-forward endpoint
    // (BACKEND C1 / CarryForwardModal's own mutation call) to produce a
    // genuine is_carried_forward=true item, rather than faking the flag.
    const targetTrip = await createTrip(request, { name: 'Carry Forward Target Trip' });
    const targetPlace = await createPlace(request, targetTrip.id, city.id);
    const carryRes = await request.post(
      `http://localhost:3001/api/trips/${targetTrip.id}/places/${targetPlace.id}/carry-forward`,
      { data: { source_item_ids: [sourceItem.id] } },
    );
    if (!carryRes.ok()) throw new Error(`carry-forward execute failed: ${carryRes.status()}`);

    await page.goto(`http://localhost:5173/trips/${targetTrip.id}`);
    const detail = page.getByTestId('trip-detail-panel');
    await expect(detail.getByText('Ramen Spot To Revisit')).toBeVisible();
    await expect(detail.getByText('carried forward')).toBeVisible();

    // BUG DISCOVERED (MAJOR, flagged to COO — see completion report/park doc):
    // `items.carriedFromItemId` (src/backend/db/schema.ts) has no `onDelete`
    // behavior, so SQLite's default FK enforcement blocks deleting a trip
    // whose item is still referenced as another trip's carry-forward source —
    // the next spec file's blanket `deleteAllTrips()` cleanup hit exactly this
    // and failed with a 500. Explicitly delete the referencing (target) trip
    // BEFORE the referenced (source) trip here so this test cleans up after
    // itself without depending on a schema fix that's outside Frontend's
    // remit (schema changes require Architect + Database review per
    // CLAUDE.md, not something to patch from this brief).
    const delTargetRes = await request.delete(`http://localhost:3001/api/trips/${targetTrip.id}`);
    if (!delTargetRes.ok())
      throw new Error(`cleanup: delete target trip failed: ${delTargetRes.status()}`);
    const delSourceRes = await request.delete(`http://localhost:3001/api/trips/${sourceTrip.id}`);
    if (!delSourceRes.ok())
      throw new Error(`cleanup: delete source trip failed: ${delSourceRes.status()}`);
  });
});

test.describe('Mobile no-horizontal-scroll (COO/PO 2026-07-21 constraint)', () => {
  /** Asserts the document itself never needs a horizontal scrollbar. */
  async function expectNoPageHorizontalScroll(page: import('@playwright/test').Page) {
    const [scrollWidth, viewportWidth] = await page.evaluate(() => [
      document.documentElement.scrollWidth,
      window.innerWidth,
    ]);
    expect(scrollWidth).toBeLessThanOrEqual(viewportWidth);
  }

  for (const width of [390, 360]) {
    test(`no page-level horizontal scroll at ${width}px with long/varied real data`, async ({
      page,
      request,
    }) => {
      await page.setViewportSize({ width, height: 844 });

      const trip = await createTrip(request, {
        name: 'An Extremely Long Trip Name For Wrap Testing On Narrow Mobile Screens',
      });
      const city = await getOrCreateCity(
        request,
        'A City With An Unusually Long Name For Wrap Tests',
        'DE',
      );
      const place = await createPlace(request, trip.id, city.id);

      // Long item label/notes to exercise ItemCard's wrap/truncate behavior.
      const res = await request.post(`http://localhost:3001/api/trips/${trip.id}/items`, {
        data: {
          item_type: 'note',
          status: 'consider',
          trip_place_id: place.id,
          notes:
            'This is a deliberately long note field used to verify that item card subtext wraps within its row instead of forcing the page to scroll horizontally on narrow mobile viewports.',
        },
      });
      if (!res.ok()) throw new Error(`seed long note item failed: ${res.status()}`);

      // List view
      await page.goto('http://localhost:5173/trips');
      await expect(page.getByText(/An Extremely Long Trip Name/)).toBeVisible();
      await expectNoPageHorizontalScroll(page);

      // Detail view
      await page.getByText(/An Extremely Long Trip Name/).click();
      await expect(
        page.getByTestId('trip-detail-panel').getByText(/A City With An Unusually Long Name/),
      ).toBeVisible();
      await expectNoPageHorizontalScroll(page);
    });
  }
});
