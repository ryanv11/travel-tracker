# QA Session Report — Playwright E2E Suite Expansion
**Date:** 2026-03-21
**QA:** Playwright E2E suite — initial run + full coverage expansion
**Brief refs:** `jobs/qa/inbox/20260321_2300-COO-playwright-suite.md`
**PR:** #45 — `feat/playwright-full-coverage`

---

## Summary

| Item | Result |
|---|---|
| Tests written | 36 (up from 5 skeleton) |
| Tests passing | 36 / 36 |
| CI (type:check, backend, frontend) | All green |
| Source bugs fixed | 2 (Clerk v6, CountryLayer race condition) |
| Structural debt identified | 1 (panel scoping — see below) |

---

## Work Done

### Phase 1 — Get existing 5 tests green

The skeleton suite failed on startup due to two source bugs unrelated to the tests themselves:

**BUG-FIX-1: Clerk v5 crash**
`@clerk/react@5.54.0` referenced `loadClerkUiScript` from `@clerk/shared@3.x` which no longer exports it. Vite crashed before any test could run.
- Fix: upgraded to `@clerk/react@^6.1.2`
- Required code change in `main.tsx`: `SignedIn`/`SignedOut` removed in v6, replaced with `<Show when="signed-in/signed-out">`

**BUG-FIX-2: CountryLayer race condition**
`CountryLayer.tsx` called `map.isSourceLoaded('countries-source')` before the source was registered, throwing on every map render.
- Fix: guard with `map.getSource('countries-source') &&` before calling `isSourceLoaded`

### Phase 2 — Full coverage expansion

Added 5 new spec files + expanded `factories.ts`:

| Spec | Tests | Coverage |
|---|---|---|
| `trips-crud.spec.ts` | 5 | Create, date validation, edit name, multi-select delete, empty state |
| `trips-status.spec.ts` | 5 | planning→active, active→review, review→locked (PostTripReview flow), locked controls, unlock |
| `trips-filters.spec.ts` | 5 | Status chip filter, All chip, Name A–Z sort, search no match, clear search |
| `places-items.spec.ts` | 5 | Add place via city search, add note, add restaurant, edit item notes, delete item |
| `navigation.spec.ts` | 6 | Root redirect, Map/Trips/Admin nav links, deep link, empty detail state |
| `admin.spec.ts` | 5 | Create category, rename inline, deactivate/reactivate, create activity, create companion |

New factory helpers: `transitionTripStatus`, `getOrCreateCity`, `createPlace`, `createItem`.

---

## Key Locator Findings (for next QA agent)

The two-panel layout (left: trip list, right: trip detail) created pervasive locator problems. These are documented in comments in the spec files but summarised here:

- **Strict mode violations** — text like trip names and item notes appear in both panels simultaneously. Fixed with `.first()` throughout, but see debt note below.
- **`ConfirmDialog` is a plain `<div>`** — no `role="dialog"`. Scoped button clicks via `getByRole('heading', { name: '...' }).locator('..')`.
- **Admin inline edit** — clicking Rename replaces the name `<span>` with an `<input>`, breaking the `adminRow` locator. Solved by targeting `input:not([placeholder])` after Rename click.
- **Date validation** — browser HTML constraint validation fires before React's `handleSubmit`. Required `form.noValidate = true` + native value setter + synthetic events.
- **`review_pending` trips** — navigating to `/trips/:id` shows PostTripReview panel, not TripDetail. The "review → locked" test uses the PostTripReview "Complete Review & Lock Trip" flow.
- **PostTripReview lock** — after confirming lock, the app navigates to the trips list, not the trip detail. Test must `page.goto(trip.id)` again to verify the lock banner.

---

## Structural Debt — Panel Scoping (flag for COO)

**Root cause:** Playwright locators are not scoped to the detail panel. The left panel (list, search bar) and right panel (detail) are simultaneously in the DOM. During the first test run, interactions landed in the wrong panel — filling the search bar instead of form fields, clicking list-panel buttons instead of detail buttons.

**Current state:** Mitigated but not fixed. Uses `form input` (safe because the list panel has no `<form>`), `.nth(1)` for button disambiguation, `.first()` for assertions. Many assertions are checking the list card, not the detail panel.

**Consequence:** If something breaks in the detail panel but the list card still renders correctly, tests pass. The suite catches regressions at ~65–70% confidence.

**Recommended fix:** Add `data-testid="trip-detail-panel"` to the right panel root element and scope all interactions:
```typescript
const detail = page.locator('[data-testid="trip-detail-panel"]');
await detail.getByRole('button', { name: 'Edit' }).click();
await expect(detail.getByText('Updated Name')).toBeVisible();
```
This is a pre-condition for the suite being reliable enough to gate deploys. Should be addressed before the suite is expanded further.

---

## Not Covered (known gaps)

- CarryForward feature
- PostTripReview checklist flow (only the lock action tested)
- Multi-place trips / multiple items per place
- Country picker flow in TripForm
- Activities/companions selection in TripForm
- Error states / API failure handling
- Itinerary date assignment on items
- Sort options beyond Name A–Z
- Admin data cleanup (categories/activities/companions accumulate across runs)

---

## CI Status at Close

```
type:check    ✓
test:backend  ✓  (186 tests)
test:frontend ✓  (55 tests)
test:e2e      ✓  (36 tests)
security      ✓
```

PR #45 open, awaiting COO merge.
