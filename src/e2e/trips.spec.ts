import { expect, test } from '@playwright/test';
import { createTrip, deleteAllTrips } from './helpers/factories';

test.beforeEach(async ({ request }) => {
  await deleteAllTrips(request);
});

test('trip list renders', async ({ page }) => {
  await page.goto('http://localhost:5173/trips');
  await expect(page.getByText('My Trips')).toBeVisible();
});

test('created trip appears in list', async ({ page, request }) => {
  await createTrip(request, { name: 'Paris 2026' });
  await page.goto('http://localhost:5173/trips');
  await expect(page.getByText('Paris 2026')).toBeVisible();
});

test('search filters trips', async ({ page, request }) => {
  await createTrip(request, { name: 'Paris 2026' });
  await createTrip(request, { name: 'Tokyo 2027' });
  await page.goto('http://localhost:5173/trips');
  await page.getByPlaceholder(/search/i).fill('Paris');
  await expect(page.getByText('Paris 2026')).toBeVisible();
  await expect(page.getByText('Tokyo 2027')).not.toBeVisible();
});

test('trip detail opens on click', async ({ page, request }) => {
  await createTrip(request, { name: 'Rome Trip' });
  await page.goto('http://localhost:5173/trips');
  await page.getByText('Rome Trip').click();
  // Right panel should show the trip name
  await expect(
    page.locator('[data-testid="trip-detail"]').or(page.getByRole('main')).getByText('Rome Trip'),
  ).toBeVisible();
});
