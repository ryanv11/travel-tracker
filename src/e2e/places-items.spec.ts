import { expect, test } from '@playwright/test';
import {
  createItem,
  createPlace,
  createTrip,
  deleteAllTrips,
  getOrCreateCity,
} from './helpers/factories';

test.beforeEach(async ({ request }) => {
  await deleteAllTrips(request);
});

test('add place via city search', async ({ page, request }) => {
  const trip = await createTrip(request, { name: 'Place Test Trip' });
  await getOrCreateCity(request, 'Testville', 'FR');

  await page.goto(`http://localhost:5173/trips/${trip.id}`);
  await page.getByRole('button', { name: /Add Place/ }).click();

  await expect(page.getByRole('heading', { name: 'Add Place' })).toBeVisible();
  await page.getByPlaceholder('Search city name…').fill('Testv');

  // Wait for debounce + API response
  await expect(page.getByText('Testville')).toBeVisible({ timeout: 5_000 });
  await page.getByText('Testville').first().click();

  // Modal closes; city appears in trip detail
  await expect(page.getByRole('heading', { name: 'Add Place' })).not.toBeVisible({
    timeout: 5_000,
  });
  await expect(page.getByText('Testville').first()).toBeVisible();
});

test('add note item to place', async ({ page, request }) => {
  const trip = await createTrip(request, { name: 'Items Test Trip' });
  const city = await getOrCreateCity(request, 'ItemsCity', 'DE');
  await createPlace(request, trip.id, city.id);

  await page.goto(`http://localhost:5173/trips/${trip.id}`);
  await expect(page.getByText('ItemsCity').first()).toBeVisible();

  await page.getByRole('button', { name: '+ Add Item' }).first().click();

  // Step 1: item type grid — click Note button
  await expect(page.getByText('Select item type:')).toBeVisible();
  await page.locator('button', { hasText: 'Note' }).click();

  // Step 2: fill notes (textarea is the only textarea when note type is selected)
  await page.locator('textarea').fill('A test note about this place');
  await page.getByRole('button', { name: 'Add Item', exact: true }).click();

  await expect(page.getByText('A test note about this place').first()).toBeVisible();
});

test('add restaurant item with type-specific fields', async ({ page, request }) => {
  const trip = await createTrip(request, { name: 'Restaurant Trip' });
  const city = await getOrCreateCity(request, 'FoodCity', 'FR');
  await createPlace(request, trip.id, city.id);

  await page.goto(`http://localhost:5173/trips/${trip.id}`);

  await page.getByRole('button', { name: '+ Add Item' }).first().click();
  await page.locator('button', { hasText: 'Restaurant' }).click();

  // Field component renders <label> then <input> as siblings — locate by adjacent sibling
  await page
    .locator('label')
    .filter({ hasText: 'Restaurant Name' })
    .locator('xpath=following-sibling::input')
    .fill('Le Petit Bistro');
  await page
    .locator('label')
    .filter({ hasText: 'Cuisine Type' })
    .locator('xpath=following-sibling::input')
    .fill('French');

  await page.getByRole('button', { name: 'Add Item', exact: true }).click();

  await expect(page.getByText('Le Petit Bistro').first()).toBeVisible();
});

test('edit item notes via Edit button', async ({ page, request }) => {
  const trip = await createTrip(request, { name: 'Edit Item Trip' });
  const city = await getOrCreateCity(request, 'EditCity', 'ES');
  const place = await createPlace(request, trip.id, city.id);
  await createItem(request, trip.id, {
    item_type: 'note',
    trip_place_id: place.id,
    notes: 'Original note text',
  });

  await page.goto(`http://localhost:5173/trips/${trip.id}`);
  await expect(page.getByText('Original note text').first()).toBeVisible();

  // Trip header also has an "Edit" button — use nth(1) to target the item Edit button
  await page.getByRole('button', { name: 'Edit' }).nth(1).click();
  // Use heading role with exact match — "Edit Item" would otherwise match trip name "Edit Item Trip"
  await expect(page.getByRole('heading', { name: 'Edit Item', exact: true })).toBeVisible();

  await page.locator('textarea').fill('Updated note text');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByText('Updated note text').first()).toBeVisible();
  await expect(page.getByText('Original note text').first()).not.toBeVisible();
});

test('delete item with confirmation', async ({ page, request }) => {
  const trip = await createTrip(request, { name: 'Delete Item Trip' });
  const city = await getOrCreateCity(request, 'DeleteCity', 'IT');
  const place = await createPlace(request, trip.id, city.id);
  await createItem(request, trip.id, {
    item_type: 'note',
    trip_place_id: place.id,
    notes: 'Note to delete',
  });

  await page.goto(`http://localhost:5173/trips/${trip.id}`);
  await expect(page.getByText('Note to delete').first()).toBeVisible();

  await page.getByRole('button', { name: 'Delete' }).first().click();

  // ConfirmDialog uses plain div, not role="dialog"; scope via heading
  const deleteModal = page.getByRole('heading', { name: 'Delete item?' }).locator('..');
  await expect(deleteModal).toBeVisible();
  await deleteModal.getByRole('button', { name: 'Delete' }).click();

  // "Note to delete" appears in both item title (span) and notes preview (div) — check first match
  await expect(page.getByText('Note to delete').first()).not.toBeVisible({ timeout: 5_000 });
});
