import { test, expect } from '@playwright/test';

test('map page loads without error', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.goto('http://localhost:5173/map');
  // Map container should render — look for a canvas or the map div
  await expect(
    page
      .locator('canvas')
      .or(page.locator('#map'))
      .or(page.locator('[class*="map"]'))
      .first(),
  ).toBeVisible({ timeout: 10000 });
  // No console errors (allow known benign ones if needed)
  expect(errors.filter((e) => !e.includes('favicon'))).toHaveLength(0);
});
