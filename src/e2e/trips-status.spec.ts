import { expect, test } from '@playwright/test';
import { createTrip, deleteAllTrips, transitionTripStatus } from './helpers/factories';

test.beforeEach(async ({ request }) => {
  await deleteAllTrips(request);
});

test('planning → active via status bar', async ({ page, request }) => {
  const trip = await createTrip(request, { name: 'Status Trip' });
  await page.goto(`http://localhost:5173/trips/${trip.id}`);

  // Verify the Mark as Active button is present (confirms planning state)
  await expect(page.getByRole('button', { name: 'Mark as Active' })).toBeVisible();
  await page.getByRole('button', { name: 'Mark as Active' }).click();

  // After transition, the next action button confirms we're now active
  await expect(page.getByRole('button', { name: 'Move to Review' })).toBeVisible({
    timeout: 5_000,
  });
});

test('active → review pending via status bar', async ({ page, request }) => {
  const trip = await createTrip(request, { name: 'Status Trip' });
  await transitionTripStatus(request, trip.id, 'active');
  await page.goto(`http://localhost:5173/trips/${trip.id}`);

  // Verify Move to Review button is present (confirms active state)
  await expect(page.getByRole('button', { name: 'Move to Review' })).toBeVisible();
  await page.getByRole('button', { name: 'Move to Review' }).click();

  // After transition, Lock Trip button confirms we're now in review_pending
  await expect(page.getByRole('button', { name: 'Lock Trip' })).toBeVisible({ timeout: 5_000 });
});

test('review → locked via PostTripReview panel', async ({ page, request }) => {
  const trip = await createTrip(request, { name: 'Status Trip' });
  await transitionTripStatus(request, trip.id, 'active');
  await transitionTripStatus(request, trip.id, 'review_pending');
  await page.goto(`http://localhost:5173/trips/${trip.id}`);

  // review_pending trips show the PostTripReview panel; use its lock button
  await page.getByRole('button', { name: 'Complete Review & Lock Trip' }).click();

  // ReviewPanel ConfirmDialog title is "Lock trip?" — scope via heading to avoid button ambiguity
  const lockModal = page.getByRole('heading', { name: 'Lock trip?' }).locator('..');
  await expect(lockModal).toBeVisible();
  await lockModal.getByRole('button', { name: 'Lock Trip' }).click();

  // After locking, PostTripReview navigates to the trips list — go to the trip detail to verify
  await page.goto(`http://localhost:5173/trips/${trip.id}`);
  await expect(page.getByText('🔒 Read-only — trip is locked.')).toBeVisible({ timeout: 5_000 });
});

test('locked trip hides write controls', async ({ page, request }) => {
  const trip = await createTrip(request, { name: 'Locked Trip' });
  await transitionTripStatus(request, trip.id, 'active');
  await transitionTripStatus(request, trip.id, 'review_pending');
  await transitionTripStatus(request, trip.id, 'locked');
  await page.goto(`http://localhost:5173/trips/${trip.id}`);

  await expect(page.getByText('🔒 Read-only — trip is locked.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit' })).not.toBeVisible();
  await expect(page.getByRole('button', { name: /Add Place/ })).not.toBeVisible();
});

test('unlock locked trip via confirmation', async ({ page, request }) => {
  const trip = await createTrip(request, { name: 'Locked Trip' });
  await transitionTripStatus(request, trip.id, 'active');
  await transitionTripStatus(request, trip.id, 'review_pending');
  await transitionTripStatus(request, trip.id, 'locked');
  await page.goto(`http://localhost:5173/trips/${trip.id}`);

  await page.getByRole('button', { name: 'Unlock' }).click();

  // ConfirmDialog uses plain div, not role="dialog"; scope via heading
  const unlockModal = page.getByRole('heading', { name: 'Unlock this trip?' }).locator('..');
  await expect(unlockModal).toBeVisible();
  await unlockModal.getByRole('button', { name: 'Unlock' }).click();

  // Lock Trip button reappears when back in review_pending; banner gone
  await expect(page.getByRole('button', { name: 'Lock Trip' })).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText('🔒 Read-only — trip is locked.')).not.toBeVisible();
});
