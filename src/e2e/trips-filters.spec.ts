import { expect, test } from '@playwright/test';
import { createTrip, deleteAllTrips, transitionTripStatus } from './helpers/factories';

test.beforeEach(async ({ request }) => {
  await deleteAllTrips(request);
});

test('status chip filters to planning trips only', async ({ page, request }) => {
  await createTrip(request, { name: 'Planning Trip' });
  const active = await createTrip(request, { name: 'Active Trip' });
  await transitionTripStatus(request, active.id, 'active');

  await page.goto('http://localhost:5173/trips');
  await expect(page.getByText('Planning Trip')).toBeVisible();
  await expect(page.getByText('Active Trip')).toBeVisible();

  // Chip label includes count, e.g. "Planning (1)" — match with regex
  await page.getByRole('button', { name: /^Planning/ }).click();

  await expect(page.getByText('Planning Trip')).toBeVisible();
  await expect(page.getByText('Active Trip')).not.toBeVisible();
});

test('clicking All chip restores full list', async ({ page, request }) => {
  await createTrip(request, { name: 'Planning Trip' });
  const active = await createTrip(request, { name: 'Active Trip' });
  await transitionTripStatus(request, active.id, 'active');

  await page.goto('http://localhost:5173/trips');

  await page.getByRole('button', { name: /^Planning/ }).click();
  await expect(page.getByText('Active Trip')).not.toBeVisible();

  await page.getByRole('button', { name: /^All/ }).click();
  await expect(page.getByText('Active Trip')).toBeVisible();
  await expect(page.getByText('Planning Trip')).toBeVisible();
});

test('sort Name A–Z orders trips alphabetically', async ({ page, request }) => {
  await createTrip(request, { name: 'Zebra Trip' });
  await createTrip(request, { name: 'Apple Trip' });
  await createTrip(request, { name: 'Mango Trip' });

  await page.goto('http://localhost:5173/trips');

  // Select by option value — matches <option value="name_asc">Name A–Z</option>
  await page.locator('select').selectOption('name_asc');

  // Apple should precede Mango, Mango should precede Zebra in DOM order
  const html = await page.content();
  expect(html.indexOf('Apple Trip')).toBeLessThan(html.indexOf('Mango Trip'));
  expect(html.indexOf('Mango Trip')).toBeLessThan(html.indexOf('Zebra Trip'));
});

test('search with no match shows filtered empty state', async ({ page, request }) => {
  await createTrip(request, { name: 'Paris Trip' });
  await page.goto('http://localhost:5173/trips');

  await page.getByPlaceholder('Search trips…').fill('ZZZNOMATCH');

  await expect(page.getByText(/No trips match/)).toBeVisible();
  await expect(page.getByText('Paris Trip')).not.toBeVisible();
});

test('clearing search restores full list', async ({ page, request }) => {
  await createTrip(request, { name: 'Trip One' });
  await createTrip(request, { name: 'Trip Two' });
  await page.goto('http://localhost:5173/trips');

  await page.getByPlaceholder('Search trips…').fill('One');
  await expect(page.getByText('Trip Two')).not.toBeVisible();

  await page.getByPlaceholder('Search trips…').fill('');
  await expect(page.getByText('Trip One')).toBeVisible();
  await expect(page.getByText('Trip Two')).toBeVisible();
});
