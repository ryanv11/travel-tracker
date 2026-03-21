import { test, expect } from '@playwright/test';
import { createTrip, deleteAllTrips } from './helpers/factories';

test.beforeEach(async ({ request }) => {
  await deleteAllTrips(request);
});

test('create trip via form — appears in list', async ({ page }) => {
  await page.goto('http://localhost:5173/trips');
  await page.getByRole('button', { name: '+ New' }).click();

  await expect(page.getByText('New Trip')).toBeVisible();

  // TripForm labels are not linked via for/id — locate inputs by position in the form
  await page.locator('form input').first().fill('Barcelona 2026');
  await page.locator('form input[type="date"]').first().fill('2026-08-01');
  await page.locator('form input[type="date"]').nth(1).fill('2026-08-10');
  await page.getByRole('button', { name: 'Create Trip' }).click();

  // Trip name appears in both the list card (h3) and the detail heading (h1)
  await expect(page.getByText('Barcelona 2026').first()).toBeVisible();
});

test('form rejects end date before start date', async ({ page }) => {
  await page.goto('http://localhost:5173/trips');
  await page.getByRole('button', { name: '+ New' }).click();

  await page.locator('form input').first().fill('Invalid Trip');
  await page.locator('form input[type="date"]').first().fill('2026-08-10');

  // Force end date < start date: native setter bypasses the browser's min constraint,
  // and form.noValidate=true prevents Chrome's HTML validation from blocking React's handleSubmit.
  await page.locator('form input[type="date"]').nth(1).evaluate((el: HTMLInputElement) => {
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    nativeSetter.call(el, '2026-08-01');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.locator('form').evaluate((f: HTMLFormElement) => { f.noValidate = true; });
  await page.getByRole('button', { name: 'Create Trip' }).click();

  await expect(page.getByText(/End date must be on or after start date/)).toBeVisible();
  // Form stays open — invalid trip not created
  await expect(page.getByText('New Trip')).toBeVisible();
});

test('edit trip name via detail panel', async ({ page, request }) => {
  const trip = await createTrip(request, { name: 'Original Name' });
  await page.goto(`http://localhost:5173/trips/${trip.id}`);

  await page.getByRole('button', { name: 'Edit' }).first().click();
  await expect(page.getByText('Edit Trip')).toBeVisible();

  await page.locator('form input').first().fill('Updated Name');
  await page.getByRole('button', { name: 'Save Changes' }).click();

  // Name appears in both list card (h3) and detail heading (h1) — just verify presence
  await expect(page.getByText('Updated Name').first()).toBeVisible();
  await expect(page.getByText('Original Name')).not.toBeVisible();
});

test('delete trip via multi-select (window.confirm)', async ({ page, request }) => {
  await createTrip(request, { name: 'Trip Alpha' });
  await createTrip(request, { name: 'Trip Beta' });
  await page.goto('http://localhost:5173/trips');
  await expect(page.getByText('Trip Alpha')).toBeVisible();

  // TripsLayout uses window.confirm for the delete confirmation
  page.on('dialog', (dialog) => dialog.accept());

  await page.getByRole('button', { name: 'Select' }).click();
  await page.getByLabel('Select trip Trip Alpha').click();
  await page.getByRole('button', { name: 'Delete' }).click();

  await expect(page.getByText('Trip Alpha')).not.toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Trip Beta')).toBeVisible();
});

test('empty state shown when no trips exist', async ({ page }) => {
  await page.goto('http://localhost:5173/trips');
  await expect(page.getByText(/No trips yet/)).toBeVisible();
});
