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
  // OP-11: wait for the initial (unsorted) list to actually render before interacting —
  // the <select> exists in the DOM before the trips fetch resolves, so selectOption()
  // doesn't wait for data. Without this, page.content() below could snapshot the page
  // before React Query's fetch (or the post-sort re-render) had committed, making
  // 'Apple Trip' intermittently absent — a real race, not a CI-speed artifact.
  await expect(page.getByText('Zebra Trip')).toBeVisible();

  // Select by option value — matches <option value="name_asc">Name A–Z</option>
  await page.locator('select').selectOption('name_asc');

  // Wait for the re-sorted render to commit before reading DOM order.
  await expect(page.getByText('Apple Trip')).toBeVisible();

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
