import { expect, test } from '@playwright/test';
import { createTrip, deleteAllTrips } from './helpers/factories';

test.beforeEach(async ({ request }) => {
  await deleteAllTrips(request);
});

test('root / redirects to /map', async ({ page }) => {
  await page.goto('http://localhost:5173/');
  await expect(page).toHaveURL(/\/map/);
});

test('Map nav link navigates to /map', async ({ page }) => {
  await page.goto('http://localhost:5173/trips');
  await page.getByRole('link', { name: 'Map' }).click();
  await expect(page).toHaveURL(/\/map/);
});

test('Trips nav link navigates to /trips', async ({ page }) => {
  await page.goto('http://localhost:5173/map');
  await page.getByRole('link', { name: 'Trips' }).click();
  await expect(page).toHaveURL(/\/trips/);
  await expect(page.getByText('My Trips')).toBeVisible();
});

test('Admin nav link navigates to /admin', async ({ page }) => {
  await page.goto('http://localhost:5173/trips');
  await page.getByRole('link', { name: 'Admin' }).click();
  await expect(page).toHaveURL(/\/admin/);
  await expect(page.getByRole('heading', { name: 'Admin' })).toBeVisible();
});

test('deep link to /trips/:id shows trip detail', async ({ page, request }) => {
  const trip = await createTrip(request, { name: 'Deep Link Trip' });
  await page.goto(`http://localhost:5173/trips/${trip.id}`);
  await expect(page.getByText('Deep Link Trip').first()).toBeVisible();
});

test('no trip selected shows empty detail state', async ({ page }) => {
  // With no trips and no ID in the URL, right panel shows the selection prompt
  await page.goto('http://localhost:5173/trips');
  await expect(page.getByText('Select a trip')).toBeVisible();
});
