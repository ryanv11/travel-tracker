# PO UAT Log — what still needs your testing

This is the **live list**. Open it, go top to bottom, test only what's here. When an item passes it
leaves this file. History lives in [`uat-archive.md`](./uat-archive.md).

**Recording a verdict:** write on the `Result:` line, or just tell me `N PASS` / `N FAIL: <what you saw>` / `N N/A`.
On a PASS I flip the tracker item to done and remove it from here.

**Before you start (10 seconds):** hard-refresh staging (**Cmd/Ctrl+Shift+R**), then open **`/health`** and
confirm the `commit` matches the latest `main`. If it doesn't, staging is stale — tell me.

---

## Awaiting your testing

1. **QUAL-43 + QUAL-49 — backend refactor smoke *(smoke test, not a feature)*.**
   You already exercised most of this during the 2026-08-11 round (trips, add place, add item, map) with no
   refactor-attributable regression. To close it: confirm the **admin panel** opens and a fresh **add-item**
   looks normal — or just say "covered" and I'll close it.
   - Result:

2. **BUG-74 — an *upstream* geocoder failure is signalled ("couldn't reach the geocoder", not a false "found nothing").**
   Hard to force on purpose — you didn't hit it in the round. Opportunistic: if a lookup ever hangs/errors,
   note what you saw. Or tell me and **I'll force one** so you can test it deliberately.
   - Result:

---

## In the dev pipeline — will return here once fixed (no action from you now)

These came out of the 2026-08-11 round as fails/partials or new findings. They're tracked and go back to
dev; they'll reappear above for re-testing when fixed.

- **BUG-97** *(the big one)* — add-place ambiguity is pre-empted by a single cached city match (why "Newport" silently went to Oregon). Also folds in **BUG-73**'s misleading "no matches" message and the frontend/backend disagreement on what counts as ambiguous. **Architect design first.**
- **BUG-98** — a city resolved in a region-tier country with the state left blank saves as "no state set" instead of using the region the geocoder already knew (Melbourne → "Australia, no state set"). Architect policy call; likely folds into BUG-97.
- **BUG-86** — "Back to trip" works but breaks the way *back* to the review screen / reversing a status. (Reopened — the fix went one way only.)
- **BUG-91** — the trip-create form still auto-saves when you **click** a country (the earlier fix only stopped the Enter key).
- **UX-13** — city name stays editable on the picker screen but editing it does nothing; grey it out. (Re-confirmed this round.)
- **UX-15** — the blue-date tooltip wording ("set explicitly for this place") is unclear — reword.

---

## Adding a new finding

Add a numbered line under "Awaiting your testing", or just tell me. Steps-to-reproduce beat a screenshot
for behaviour bugs; screenshot + one line for visual. Screenshots → `jobs/PO/screenshots/`.
