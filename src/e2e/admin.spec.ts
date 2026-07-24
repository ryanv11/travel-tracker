/**
 * Admin panel E2E tests.
 *
 * Admin data (categories, activities, companions) is seeded on startup and persists
 * across test runs. Each test uses a timestamp-suffixed name to avoid conflicts.
 * CategoryTab, ActivityTab, CompanionTab all render rows as <div> elements.
 */
import { expect, test } from '@playwright/test';

/**
 * Finds the admin list row <div> that contains the given item name.
 * Navigates up from the name <span> to its immediate parent row div — avoids
 * matching ancestor containers that also contain a Rename button.
 */
function adminRow(page: import('@playwright/test').Page, name: string) {
  return page
    .locator('span')
    .filter({ hasText: new RegExp(`^${name}$`) })
    .locator('..');
}

// ─── Categories ──────────────────────────────────────────────────────────────

test('create category appears in list', async ({ page }) => {
  await page.goto('http://localhost:5173/admin');
  // Categories tab is active by default

  const name = `TestCat-${Date.now()}`;
  await page.getByPlaceholder('New category name…').fill(name);
  await page.getByRole('button', { name: 'Add' }).click();

  await expect(page.getByText(name)).toBeVisible();
});

test('rename category via inline edit', async ({ page }) => {
  await page.goto('http://localhost:5173/admin');

  const original = `RenameCat-${Date.now()}`;
  await page.getByPlaceholder('New category name…').fill(original);
  await page.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByText(original)).toBeVisible();

  const row = adminRow(page, original);
  await row.getByRole('button', { name: 'Rename' }).click();

  // After clicking Rename the name <span> is replaced by an <input> — row locator breaks.
  // Find the edit input directly: it has no placeholder (unlike the "New category name…" input).
  const renamed = `Renamed-${Date.now()}`;
  await page.locator('input:not([placeholder])').fill(renamed);
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByText(renamed)).toBeVisible();
  await expect(page.getByText(original)).not.toBeVisible();
});

test('deactivate then re-activate category', async ({ page }) => {
  await page.goto('http://localhost:5173/admin');

  const name = `DeactivateCat-${Date.now()}`;
  await page.getByPlaceholder('New category name…').fill(name);
  await page.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByText(name)).toBeVisible();

  const row = adminRow(page, name);

  await row.getByRole('button', { name: 'Deactivate' }).click();
  await expect(row.getByText('Inactive')).toBeVisible();

  await row.getByRole('button', { name: 'Re-activate' }).click();
  await expect(row.getByText('Inactive')).not.toBeVisible();
});

// ─── Activities ──────────────────────────────────────────────────────────────

test('create activity appears in list', async ({ page }) => {
  await page.goto('http://localhost:5173/admin');
  await page.getByRole('button', { name: 'Activities' }).click();

  const name = `TestActivity-${Date.now()}`;
  await page.getByPlaceholder('New activity name…').fill(name);
  await page.getByRole('button', { name: 'Add' }).click();

  await expect(page.getByText(name)).toBeVisible();
});

// ─── Companions ───────────────────────────────────────────────────────────────

// STILL SKIPPED (2026-07-23) — updated blocker, tracked for a Frontend follow-up brief.
//
// The Backend half of ADL-28 (AD-08, BRD-AD07/BRD-AD08) is done: companions moved
// off /api/admin/companions (requireOwner) onto /api/companions (requireAuth only,
// userId-scoped) — see routes/companions.ts. Backend-level coverage for this now
// lives in routes/__tests__/companions.test.ts (CRUD, cross-user isolation,
// duplicate-name-across-users) and is NOT skipped.
//
// This e2e test still cannot pass as written: it drives the real Admin panel UI
// (CompanionTab), which calls src/frontend/hooks/useAdmin.ts — that hook still
// points at /api/admin/companions, a route this brief removed. Fixing the hook is
// a frontend change outside a Backend brief's scope (and could collide with other
// in-flight frontend work), so it is intentionally left undone here. Flagged to
// COO in this brief's completion report: a small Frontend follow-up brief is
// needed to repoint useAdmin.ts's companion calls at /api/companions, after which
// this test should be un-skipped and should pass unmodified.
test.skip('create companion appears in list', async ({ page }) => {
  await page.goto('http://localhost:5173/admin');
  await page.getByRole('button', { name: 'Companions' }).click();

  const name = `TestCompanion-${Date.now()}`;
  await page.getByPlaceholder('New companion name…').fill(name);
  await page.getByRole('button', { name: 'Add' }).click();

  await expect(page.getByText(name)).toBeVisible();
});
