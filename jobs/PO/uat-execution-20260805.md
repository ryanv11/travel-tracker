# UAT Execution Script — Outstanding Backlog

**Created:** 2026-08-05 · **Author:** COO · **For:** PO (Ryan)
**Target:** **staging**, in your host browser — `https://travel-tracker-staging.up.railway.app`
**Covers:** all 24 items currently at `done_pending_uat` in the tracker. These are *built and
awaiting your verdict* — passing them is what lets them close.

> This is a **new, standalone execution script**. It does not replace `uat-log.md` — that stays your
> place to *log findings*. When something here FAILS, drop a note in `uat-log.md` (or tell me) so it
> gets a bug ID and QA coverage. When something PASSES, tick it here.

---

## Before you start — read this once

**Build check first (30 seconds, catches a stale deploy before it wastes a whole pass).**
Staging now stamps its build. Confirm you're testing the build you think you are:
- Visit `/health` → note the `commit` SHA, **or** read the build stamp in the app nav/footer (QUAL-26).
- Compare against the latest `main` commit. If staging is behind, tell me — don't test a stale build
  (a stale deploy manufactures false failures; that's the whole reason the SHA is now exposed).

**You need two accounts** for a few cases: your **owner** account, and a **non-owner** account you've
been given access to (BUG-62 and BUG-51 depend on the non-owner view).

**Result key** for each case: **☐ Pass ☐ Fail** — with a one-line note on anything off.

### Known caveats — do NOT fail these cases on these points

These are *already-tracked known gaps*, not regressions. Read them before testing so you don't fail a
case on something we already know about:

1. **BRD-GE16 (add a city) is a PARTIAL delivery.** The *add / disambiguation* half shipped and is
   tested below. The *correct-a-wrong-city* half — re-pointing a saved place to a different city — has
   **no UI yet** (tracked as **UX-12**, P1, still open). Don't fail GE-16 because you can't change a
   city after saving; that screen isn't built.
2. **Deleting a trip (BUG-50 / TR-14) does not yet work in `review_pending` status** — that component
   has no delete affordance (tracked as **BUG-65**). Test delete from a *planning*-status trip; the
   `review_pending` gap is known.
3. **A non-owner cannot add a place to a trip at all right now** (tracked as **BUG-63**, P1, open —
   three 403s on categories/activities/cities). So **run every case except the BUG-62 tab-visibility
   check as the OWNER.** The non-owner pass is limited to what BUG-62 asks for.
4. **Clerk "development keys" banner and Clerk telemetry CSP noise** in the console are known
   (BUG-68, and the shared staging/prod Clerk pool thread) — **console noise, no functional impact.**
   Ignore them unless something actually breaks.
5. **A transient 502 on staging** (`/api/cities` or `/api/geocode`) that fixes itself on refresh is a
   known Railway single-replica hiccup (**ENV-02**), *not* a product bug — but if it happens, note the
   time, because BUG-73 below is specifically about whether the app *tells you* it happened.

---

## Section A — City entry & disambiguation (BRD GE-15 / GE-16)

This is the release that FAILED your 2026-08-01 shakedown. Everything below is the fix. The core
question GE-16 asks: **when a city name is ambiguous, are you asked to choose rather than having one
silently picked for you?**

### A1 · BRD-GE16 (P1) — add a city via find-or-create
- **Account:** owner
- **Steps:**
  1. Open a trip, add a place, type a clearly unambiguous city (e.g. "Reykjavik").
  2. Confirm it resolves and saves with the right country and region.
  3. Add a second place with a city that already exists in the shared catalogue — confirm it
     *reuses* the existing city rather than creating a duplicate.
- **Expected:** the city resolves, country/region populate, and a repeat of the same city+country+region
  does not create a second catalogue entry.
- **Caveat:** correction-by-re-point is not built (UX-12) — see caveat 1.
- **Result:** ☐ Pass ☐ Fail — notes: ______________________

### A2 · BUG-71 (was P1) — ambiguous city must offer disambiguation, not silently auto-resolve
- **Account:** owner
- **Steps:**
  1. Add a place and type **"Springfield"** (the case that failed last time — it silently pre-filled
     *Virginia*).
- **Expected:** you are shown that there is **more than one match and asked to choose** — a visible
  "multiple matches, please choose" indication — rather than a state being silently pre-selected for you.
- **Result:** ☐ Pass ☐ Fail — notes: ______________________

### A3 · BUG-79 (P2) — the region/state selector narrows for an ambiguous US city, like it does for the UK
- **Account:** owner
- **Steps:**
  1. Type **"Springfield"** (US) and look at the state selector and the caption.
  2. Compare against **"Newport"** (UK) — which already showed *England / Wales* with a yellow
     "multiple matches" note.
- **Expected:** Springfield now behaves like Newport — the **state list is narrowed to the actual
  candidate states** (not the full 50) and the yellow multiple-matches note appears. You should not have
  to hunt the whole state list for the right one.
- **Result:** ☐ Pass ☐ Fail — notes: ______________________

### A4 · BUG-72 (P2) — the search dropdown lets you tell two same-named cities apart
- **Account:** owner
- **Steps:**
  1. In the city search dropdown, type a name with several distinct matches (e.g. "Springfield",
     "Newport").
- **Expected:** each dropdown row shows enough to distinguish them — **name + region + country**, not
  just name + country. You can tell *which* Springfield you're about to pick before you pick it.
- **Result:** ☐ Pass ☐ Fail — notes: ______________________

### A5 · BUG-78 (P3) — the "Suggested:" region caption reads as a value that needs checking
- **Account:** owner
- **Steps:**
  1. Add a city where a region is auto-suggested and look at the **"Suggested:"** caption.
- **Expected:** the suggested value is **bold / prominent enough** to read as "this is a guess, check
  it," not easily missed.
- **Result:** ☐ Pass ☐ Fail — notes: ______________________

### A6 · BUG-80 (P2) — saved places show region, so two different same-named cities are distinguishable in one trip
- **Account:** owner
- **Steps:**
  1. Add **two different Newports** (or two Springfields in different states) to the *same* trip.
  2. Look at the trip's saved place list.
- **Expected:** each saved place shows **name + region** (not just name + country), so the two are
  clearly different rows rather than two identical-looking "Newport, GB" entries.
- **Result:** ☐ Pass ☐ Fail — notes: ______________________

### A7 · BUG-73 (P2) — a failed geocode lookup is visible, not silent
- **Account:** owner
- **Steps:**
  1. Use the city lookup normally. If you hit an ENV-02 502 (caveat 5), watch what the form does.
     (You can't reliably force a failure on demand — the point is what happens *when* one occurs.)
- **Expected:** when a lookup fails, you get a **visible failure state and/or a retry** — you can tell
  "the lookup didn't run / failed" apart from "it ran and found nothing" and from "it picked something".
  Silence is the bug.
- **Result:** ☐ Pass ☐ Fail ☐ Couldn't trigger — notes: ______________________

### A8 · BUG-77 (P2) — region-tier countries ship with their subdivisions seeded
- **Account:** owner
- **Steps:**
  1. Add places in several non-US/UK countries that have states/provinces — e.g. **Canada, Australia,
     Germany, Mexico, Brazil**.
- **Expected:** the region/state selector is **populated** for these countries, not empty. (This closed
  22 latent "empty region selector" gaps — you're spot-checking that they're actually seeded.)
- **Result:** ☐ Pass ☐ Fail — notes: ______________________

### A9 · BUG-56 (P3) — city name auto-capitalises
- **Account:** owner
- **Steps:**
  1. Type a **lowercase** city name (e.g. "glasgow") into the new-city form.
- **Expected:** the first letter capitalises ("Glasgow").
- **Result:** ☐ Pass ☐ Fail — notes: ______________________

---

## Section B — Trip management

### B1 · BUG-50 / TR-14 (P1) — delete an entire trip
- **Account:** owner
- **Steps:**
  1. Open a trip **in planning status** that has places and items, from the **detail** view (not the
     bulk-select in the list).
  2. Trigger delete. Read the confirmation, then **cancel** — confirm nothing was lost.
  3. Delete for real — confirm the trip and its contents are gone.
  4. Try on a **Locked** trip — it should **refuse with a message pointing you to unlock**, not fail
     silently.
  5. Check both **desktop and mobile**.
- **Expected:** confirmation names the trip and what will be lost; cancel is a no-op; delete removes
  everything; locked trips refuse cleanly.
- **Caveat:** a `review_pending` trip has no delete control yet (BUG-65) — see caveat 2. Don't fail on that.
- **Result:** ☐ Pass ☐ Fail — notes: ______________________

### B2 · BUG-58 / TR-11 (P2) — moving a trip backward keeps it selected
- **Account:** owner
- **Steps:**
  1. Select a trip in the left panel, then move it **backward** in the workflow ("Return to Planning"
     from review).
- **Expected:** the trip **stays selected** and the detail panel just updates — it does not deselect and
  force you to re-find it.
- **Result:** ☐ Pass ☐ Fail — notes: ______________________

### B3 · BUG-52 / TR-13 (P2) — trip search matches on country name
- **Account:** owner
- **Steps:**
  1. Search your trip list for **"United States"** (or another full country name matching a place in
     one of your trips).
- **Expected:** a trip containing a US place appears **even if its title says nothing about the US**.
- **Note:** searching **"USA"** returning nothing is **correct as specified** — TR-13 covers full
  country names only (whether to add "USA"/"US" is open question D-14; don't fail this on it).
- **Result:** ☐ Pass ☐ Fail — notes: ______________________

---

## Section C — Item entry, dates & ratings

### C1 · BUG-57 / IT-11 + BRD-DP06 (P2) — intelligent date defaults & first-place date inheritance
- **Account:** owner
- **Steps:**
  1. Open a trip whose dates are **not in the current month** and add an item — the date picker should
     open on the **trip's start date**, not today.
  2. Add a **flight** and enter a departure date — the **arrival** should populate to the **same day**.
  3. Edit either date by hand, save, reopen — your edit must **survive**.
  4. Add the **first** place to a trip — it should **inherit the trip's date range**; a **second** place
     should **not**.
- **Expected:** all four behaviours as described.
- **Open question (don't fail on it):** hotel checkout / car-rental dropoff currently default from the
  trip's **END** date — a reasonable generalisation but beyond IT-11's literal text. Tell me confirm or
  reject; it's a default value, trivially changed.
- **Result:** ☐ Pass ☐ Fail — notes: ______________________

### C2 · BRD-IT0809 / IT-08 + IT-09 (P2) — rating sort & filter, incl. the new cross-trip city view
- **Account:** owner
- **Steps:**
  1. On a trip with **rated** restaurants/hotels/experiences, **sort by rating** both directions.
  2. Apply a **minimum-rating filter** — **unrated items should disappear**, not sort to the bottom.
  3. Clear both — original order should **restore**, and the setting must **not carry** to another trip.
  4. **NEW SCREEN — judge the design too:** click a **city name** in a place section to reach
     `/cities/:id`. It should list rated items for that city drawn from **every** trip that visited it,
     with the same sort/filter behaviour.
- **Expected:** sort/filter behave as described; the cross-trip city page aggregates correctly.
- **Note:** the `/cities/:id` page was built by an implementation agent **with no UX spec** — judge how
  it *looks and reads*, not just whether it works. Flag anything that feels wrong.
- **Result:** ☐ Pass ☐ Fail — notes: ______________________

### C3 · BRD-IT10 (P3) — optional Google Maps URL per item
- **Account:** owner
- **Steps:**
  1. Add a **Google Maps URL** to an item — a **"View map"** link should appear on the card and open in
     a **new tab**.
  2. An item with **no URL** should show **no link**.
  3. A **non-`https://`** URL should be **rejected**.
- **Expected:** all three as described.
- **Result:** ☐ Pass ☐ Fail — notes: ______________________

### C4 · BUG-44 (P2) — car rental pickup location as subtext
- **Account:** owner
- **Steps:**
  1. Look at a **car rental** item card.
- **Expected:** the **pickup location** shows as **subtext under the provider**, the same way a flight
  shows airline + flight number.
- **Result:** ☐ Pass ☐ Fail — notes: ______________________

---

## Section D — Map

### D1 · BUG-49 / MP-02 (P2) — city markers stay on top of state shading
- **Account:** owner
- **Steps:**
  1. Zoom in far enough for **state/region shading** to activate.
- **Expected:** city markers stay **visible on top of** the shading — they do not disappear behind it.
- **Result:** ☐ Pass ☐ Fail — notes: ______________________

---

## Section E — Admin & access

### E1 · BUG-62 / AD-08 (P2) — non-owner sees a restricted admin panel
- **Account:** **non-owner** (this is the one case that needs it) — then re-check as owner
- **Steps:**
  1. Sign in as a **non-owner**. The **Admin** nav link should be visible and `/admin` should load.
  2. Confirm you see **only** the **Companions** and **Map Shading** tabs — **Categories, Activities,
     Countries must not appear at all**.
  3. Sign in as the **owner** — **all five** tabs should be present.
- **Expected:** non-owner sees exactly two tabs; owner sees five.
- **Note:** this is the highest-value manual check here — the whole change is about what a non-owner
  *sees*, and no automated test confirms it reads right.
- **Result:** ☐ Pass ☐ Fail — notes: ______________________

### E2 · BUG-51 (P1) — companion rename propagates everywhere immediately
- **Account:** owner
- **Steps:**
  1. Rename a companion (in the admin panel) who is attached to **two or more** trips.
  2. Check **every** trip they're on.
  3. Also exercise **create** and **deactivate**.
- **Expected:** every trip shows the new name **immediately** — no need to open and re-save any trip
  (the original bug: a second trip needed a manual open/edit/save before the new name showed).
- **Result:** ☐ Pass ☐ Fail — notes: ______________________

---

## Section F — Platform / build (CI- and COO-verified — little or no browser action)

These are `done_pending_uat` but are **not browser features** — they're verified by CI or by me. Listed
so you can sign them off (or tell me to hold them) without a manual pass.

### F1 · QUAL-26 (P2) — you can tell which build staging is serving
- **Your part:** the `/health` SHA + nav/footer build stamp you used in "Before you start." If you could
  read the build the app was serving, this passes. ☐ Pass ☐ Fail

### F2 · QUAL-20 (P2) — automated post-deploy smoke check ⚠️ **currently RED**
- **Status:** the shakedown workflow exists and runs, **but its console-error check is currently failing
  on staging** on a Clerk-page CSP fragment (a known, non-functional console message we're chasing
  separately). **Do not sign this off as pass yet** — it's the one item here I'd hold. No PO action;
  flagged for visibility.

### F3 · DEP-05 (P2) — `ip-address` SSRF/trust-boundary advisory bump
- **Verified in CI:** dependency upgrade clearing HIGH advisories; the vulnerability scan is green. No
  browser behaviour changed. ☐ Sign off on CI evidence

### F4 · QUAL-25 (P2) — gazetteer feasibility spike
- **Nothing to test.** This was a research spike; its outcome (GE-17 retired, BUG-75/76 raised) is
  already recorded in the BRD. It's `done_pending_uat` only because it was never formally closed —
  **recommend closing it as done with no UAT** (there's no user-facing surface). Your call.

---

## Summary checklist

| # | Item | Pri | Section | Pass |
|---|---|---|---|---|
| A1 | BRD-GE16 add city | P1 | City | ☐ |
| A2 | BUG-71 ambiguity offered | P1 | City | ☐ |
| A3 | BUG-79 US region narrows | P2 | City | ☐ |
| A4 | BUG-72 dropdown distinguishes | P2 | City | ☐ |
| A5 | BUG-78 suggested caption bold | P3 | City | ☐ |
| A6 | BUG-80 saved places show region | P2 | City | ☐ |
| A7 | BUG-73 failed lookup visible | P2 | City | ☐ |
| A8 | BUG-77 regions seeded | P2 | City | ☐ |
| A9 | BUG-56 auto-capitalise | P3 | City | ☐ |
| B1 | BUG-50/TR-14 delete trip | P1 | Trips | ☐ |
| B2 | BUG-58/TR-11 backward keeps selection | P2 | Trips | ☐ |
| B3 | BUG-52/TR-13 country search | P2 | Trips | ☐ |
| C1 | BUG-57/IT-11/DP-06 date defaults | P2 | Items | ☐ |
| C2 | BRD-IT0809 rating sort/filter + city view | P2 | Items | ☐ |
| C3 | BRD-IT10 maps URL | P3 | Items | ☐ |
| C4 | BUG-44 car rental subtext | P2 | Items | ☐ |
| D1 | BUG-49 marker z-order | P2 | Map | ☐ |
| E1 | BUG-62 non-owner admin | P2 | Admin | ☐ |
| E2 | BUG-51 companion rename | P1 | Admin | ☐ |
| F1 | QUAL-26 build stamp | P2 | Platform | ☐ |
| F2 | QUAL-20 shakedown | P2 | Platform | ⚠️ hold |
| F3 | DEP-05 dep bump | P2 | Platform | ☐ CI |
| F4 | QUAL-25 spike | P2 | Platform | ☐ close |

**24 items.** 19 are browser cases; F1 you'll have done in setup; F2 hold (red); F3/F4 sign off on
evidence. Log any FAIL in `uat-log.md` so it gets a bug ID.
