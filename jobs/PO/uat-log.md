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

3. **BUG-86 — review ⇄ trip navigation round-trip (round-2 fix, PR #527).**
   Steps: open a trip and **lock** it (it goes to review) → click **"Back to trip"** (should show the active
   trip view, *not* a blank panel) → from there use **"Back to Review"** (should return to the review screen)
   → **unlock** the trip (should land back on **review**, not the plain trip view); re-locking still works.
   Expected: you can move **both** directions (trip ⇄ review), unlocking returns you to review, and no step
   shows a blank panel.
   - Result:

4. **BUG-91 — trip-create form no longer saves early when you click a country (round-2 fix, PR #530).**
   Steps: start creating a new trip → in the country picker, **click** a country to select it. The form should
   **stay open** so you can set dates in the same flow → set dates → **Save**. (Also: pressing **Enter** in the
   country search no longer submits either.)
   Expected: clicking a country does **not** save/close the form; you complete dates in one flow; the form
   saves only when you click Save.
   - Result:

---

## In the dev pipeline — will return here once fixed (no action from you now)

These came out of the 2026-08-11 round as fails/partials or new findings. They're tracked and go back to
dev; they'll reappear above for re-testing when fixed.

- **BUG-97** *(the big one)* — add-place ambiguity is pre-empted by a single cached city match (why "Newport" silently went to Oregon). Also folds in **BUG-73**'s misleading "no matches" message and the frontend/backend disagreement on what counts as ambiguous. **Architect design first.**
- **BUG-98** — a city resolved in a region-tier country with the state left blank saves as "no state set" instead of using the region the geocoder already knew (Melbourne → "Australia, no state set"). Architect policy call; likely folds into BUG-97.
- **UX-13** — city name stays editable on the picker screen but editing it does nothing; grey it out. (Re-confirmed this round.)
- **UX-15** — the blue-date tooltip wording ("set explicitly for this place") is unclear — reword.

---

## Adding a new finding

Add a numbered line under "Awaiting your testing", or just tell me. Steps-to-reproduce beat a screenshot
for behaviour bugs; screenshot + one line for visual. Screenshots → `jobs/PO/screenshots/`.
