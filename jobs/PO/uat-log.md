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

4. **GE-21 Slice 1 — the add-place rebuild. *This is the big one, and it replaces five separate findings.***
   Shipped 2026-08-26 (PRs #540 red bar → #542 backend → #545 frontend). Closes **BUG-97, BUG-98, BUG-99,
   BUG-73** and **UX-13** in one piece of work rather than five patches. Four things to try, in this order:

   **4a. Newport — the one that started this (BUG-97).** Add a place called **Newport** to a US trip.
   Expected: you are **shown the choice** — saved places and online results together in one list — and
   nothing is picked for you. Previously a single cached "Newport, Oregon" silently won. Watch for a brief
   *"searching for more…"* style cue while it looks online — that's the in-flight indicator you approved;
   it must not block you from clicking.

   **4b. Picking no longer saves (BUG-99).** On **both** pickers — the search list *and* the "+ Add new"
   form's "multiple places match" list — click a result. Expected: it **fills the form and stays put**;
   the place is **not** saved yet. Set the dates, then press **"Add City & Place"**. Expected: the saved
   place **carries the dates you set after choosing**. *(This is the half I sent back once — the "+ Add new"
   form's picker was initially left out.)*

   **4c. Melbourne keeps its state (BUG-98).** Add **Melbourne** to an Australia trip and **leave the state
   blank**. Expected: it saves carrying **Victoria** — not "Australia, no state set".

   **4d. The message tells the truth (BUG-73).** Type **Melbourne** into a **US**-country trip. Expected:
   it no longer claims there are no matches; it says no *saved* places match, and still offers the path to
   widen countries. Previously it said "No matches in United States of America" while "Add new" would then
   return many.

   Also folded in: **UX-13** — editing the city name after picking now clears that pick rather than silently
   sending the old place's identity under a new name.
   - Result:

---

## In the dev pipeline — will return here once fixed (no action from you now)

These came out of the 2026-08-11 round as fails/partials or new findings. They're tracked and go back to
dev; they'll reappear above for re-testing when fixed.

- **UX-15** — the blue-date tooltip wording ("set explicitly for this place") is unclear — reword.
- **Slice 2** — the last piece of the add-place rebuild: the frontend and backend still define "ambiguous"
  slightly differently, so a request that bypasses the app's own screens (a direct API call) can still resolve
  without asking. Nothing you can hit through the UI — Slice 1 closed every symptom you reported. Tracked
  under **GE-21**, and two live "tripwire" tests will go red the moment it lands, so it can't be quietly
  forgotten.
- **BUG-100** — a third place in the code where a region gets set was found during the build and left alone
  deliberately. Needs a regions-list gap to trigger, so you're unlikely to see it. Deferred so it can be fixed
  as one consolidation rather than a fourth patch.
- **QUAL-52** — some test fixtures name an OpenStreetMap id that has since changed upstream. Invisible to you;
  housekeeping after Slice 1.

*(BUG-97, BUG-98, BUG-99, BUG-73 and UX-13 all moved up to item 4 above — they shipped together.)*

---

## Adding a new finding

Add a numbered line under "Awaiting your testing", or just tell me. Steps-to-reproduce beat a screenshot
for behaviour bugs; screenshot + one line for visual. Screenshots → `jobs/PO/screenshots/`.
