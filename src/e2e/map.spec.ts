import { expect, test } from '@playwright/test';

test('map page loads without error', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.goto('http://localhost:5173/map');
  // Map container should render — look for a canvas or the map div
  await expect(
    page.locator('canvas').or(page.locator('#map')).or(page.locator('[class*="map"]')).first(),
  ).toBeVisible({ timeout: 10000 });
  // Filter out environment-specific network errors (tile services unreachable in devcontainer)
  const appErrors = errors.filter(
    (e) =>
      !e.includes('favicon') &&
      !e.includes('maptiler.com') &&
      !e.includes('ERR_ADDRESS_UNREACHABLE') &&
      !e.includes('AJAXError: Failed to fetch'),
  );
  expect(appErrors).toHaveLength(0);
});
