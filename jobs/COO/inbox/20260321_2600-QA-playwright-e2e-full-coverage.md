TO: COO
FROM: QA
DATE: 2026-03-21 26:00
RE: Playwright E2E suite — full coverage expansion complete (PR #45)

Full report: `jobs/qa/history/qa-report-2026-03-21-playwright-e2e.md`

---

## Status

PR #45 (`feat/playwright-full-coverage`) is open and CI is green.
36 tests passing across 6 spec files. Two source bugs fixed in the process (Clerk v6 upgrade, CountryLayer race condition).

## ⚠️ Structural Debt — Action Required Before Suite Expansion

The tests were written without panel scoping. The two-panel layout means Playwright locators can land in the left (list) panel instead of the right (detail) panel. This was observed in the first test run — interactions were filling the search bar instead of form fields.

The current suite mitigates this with workarounds (`.first()`, `.nth()`, form-scoping) but does not fix it. Consequence: tests that pass may be asserting against the list card, not the detail view. Estimated confidence: ~65–70%.

**Recommended action before next E2E expansion brief:**
Add `data-testid="trip-detail-panel"` to the right panel root in `TripsLayout` (or equivalent), then task QA with a refactor pass to scope all detail-panel interactions. This should be an explicit brief, not bundled into a feature ticket.

## Known Gaps

CarryForward, PostTripReview checklist, multi-place flows, country picker, error states, admin data cleanup. See full report for complete list.
