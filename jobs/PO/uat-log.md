# PO UAT Log — what still needs your testing

This is the **live list**. Open it, go top to bottom, test only what's here. When an item passes it
leaves this file. History lives in [`uat-archive.md`](./uat-archive.md).

**Recording a verdict:** write on the `Result:` line, or just tell me `N PASS` / `N FAIL: <what you saw>` / `N N/A`.
On a PASS I flip the tracker item to done and remove it from here.

**Before you start (10 seconds):** hard-refresh staging (**Cmd/Ctrl+Shift+R** — the browser caches the old
bundle), then open **`/health`** and confirm the `commit` matches the latest `main`. If it doesn't, staging
is stale — tell me and everything below is void until it redeploys. *(This bit us once already.)*

---

## A · Add-a-place / city picker — test as one pass

All of these live in the **Add Place** flow (open a trip → **Add Place** → type a city), so run them
together. They came back **PARTIAL** on 2026-08-08. Your three complaints last round: **coordinates shown**
in the picker, **two indistinguishable rows**, and the **city name editable** on the picker screen when it
shouldn't be — check those explicitly; any survivor is a FAIL regardless of tracker status.

1. **BUG-71 — ambiguous city offers a disambiguation choice.**
   - Steps: Add Place → type **"Springfield"** (US).
   - Expected: you're offered a choice of candidates (each with its state/region) to pick from — **not** a silent auto-fill of one state. (It used to arrive pre-filled with "Virginia" and no hint another Springfield exists.)
   - Result:

2. **BUG-72 — picker rows tell you *which* city.**
   - Steps: with the autocomplete open for "Springfield" (or "Newport"), read the rows.
   - Expected: each row shows **city + state/region + country** (e.g. "Springfield, Illinois, US") — enough to pick the right one, not just "Springfield US".
   - Result:

3. **BUG-81 — picker rows are clean and skimmable.**
   - Steps: trigger the disambiguation picker on an ambiguous city (Springfield → ~20 US rows).
   - Expected: rows read as **"City, State, Country"** — no county, no postcode, no raw-address cruft (was "Springfield, Fairfax County, Virginia, 22150, United States"), and **no raw coordinates**.
   - Result:

4. **BUG-73 — a lookup that finds nothing is signalled, not silent.**
   - Steps: Add Place → type a made-up city that can't exist (e.g. **"Xyzzyville"**).
   - Expected: a **visible signal** that the lookup found nothing / failed — not silently-blank country/state fields with no explanation.
   - Result:

5. **BUG-74 — an *upstream* geocoder failure is signalled too.**
   - Steps: hard to force on purpose (needs the geocoder itself to error, not just find no match). **Opportunistic:** if any city lookup hangs or errors while you test, note what you saw. *(Tell me if you want to test it deliberately — I can force one.)*
   - Expected: a "couldn't reach the geocoder" signal — **not** a false "found nothing".
   - Result:

6. **BUG-87 — picker narrows to the trip's countries.**
   - Steps: open a trip with a country set (a **UK** trip) → Add Place → search **"Newport"**.
   - Expected: candidates narrow/rank to the trip's declared countries (you get UK Newports, not only USA Newports). A trip with **no** country set should prompt rather than filter to nothing.
   - Result:

## B · Trips list & status

7. **BUG-58 — changing a trip's status keeps it selected.**
   - Steps: select a trip in the left panel → change its status — **lock** it, or move it **backward** (e.g. Confirmed → Planning).
   - Expected: the trip **stays selected and visible** in the left panel — it must not blank out and force you to re-find it.
   - Result:

8. **BUG-86 — "Back to trip" returns to the trip.**
   - Steps: open a trip in **review** status → click **Back to trip**.
   - Expected: lands on the active trip view, **not** a blank/deselected panel.
   - Result:

9. **BUG-91 — trip-create form doesn't submit early.**
   - Steps: **Add a trip** → in the **country-search** field, press **Enter**.
   - Expected: the form does **not** save/close; you can still set dates in the same flow.
   - Result:

10. **BUG-93 — new place's map marker appears without a refresh.**
    - Steps: add a place to a trip.
    - Expected: its **pin shows on the map immediately**, with no manual refresh.
    - Result:

11. **UX-14 — blue date tooltip *(not a bug — confirm the copy)*.**
    - Steps: hover a **blue** date field (the first place's dates render blue).
    - Expected: a tooltip explains the "explicit dates" accent and **reads sensibly**. (The blue is deliberate; first-place-only-blue at creation is expected per BRD-DP06.)
    - Result:

## C · Quick checks

12. **QUAL-26 — you can tell which build staging is serving.**
    - Steps: open **`/health`** on staging.
    - Expected: a `commit` SHA is present and **matches the latest `main`**. *(Same as the pre-flight check above — record once.)*
    - Result:

13. **QUAL-43 + QUAL-49 — backend refactor smoke *(smoke test, not a feature)*.**
    - Steps: do a normal loop — trip list → open a trip → view its places & items → add a place → add an item → check the map renders → open the admin panel.
    - Expected: **everything behaves exactly as before.** The backend data layer and response serialization were rewritten with zero intended behaviour change — anything that feels different is a FAIL, tell me even if it seems trivial.
    - Result:

---

## Adding a new finding

Add a numbered line under the right section (or a new section), or just tell me and I'll log it. For a
behaviour bug, steps-to-reproduce beat a screenshot; for a visual bug, a screenshot + one line is ideal.
Screenshots → `jobs/PO/screenshots/[date]-[short-description].png`.
