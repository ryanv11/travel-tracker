# PO UAT Log — Travel Tracker

This file is checked by the COO on every session pickup.
Add findings here during or after a live testing session. No specific format required —
bullet points are fine. Screenshots can be attached to the session folder (see below).

**UAT is a mandatory gate. Phases cannot be formally closed without a UAT PASS verdict.**

Resolved findings (all [x] items) are archived to `uat-archive.md`. COO moves them at session end.

---

## How to log a finding

Just add a new session block below. Minimal effort — describe what you saw and what you
expected. If you already fixed it yourself, note that too so it gets a bug ID and QA coverage.

For behaviour bugs: steps to reproduce are more useful than screenshots.
For visual/layout bugs: screenshot + one-line description is ideal.
For "fixed it myself" entries: note the commit or approximate time so COO can trace it.

Screenshots: save to `jobs/PO/screenshots/[date]-[short-description].png`

---

## Session format

```
### UAT Session — YYYY-MM-DD

**Scope:** [What you were testing — e.g. "Add trip flow end-to-end", "Map interaction"]
**Build:** [Commit hash or "latest" — visible in git log]
**Verdict:** PASS / FAIL / PARTIAL (fill in at end of session)

#### Findings

- [ ] [Description of bug or issue]
      Steps: 1. ... 2. ... 3. ...
      Expected: ...
      Actual: ...
      Screenshot: [filename or none]
      Fixed myself: yes/no — [commit if yes]

- [ ] ...

#### Notes / Observations
[Anything that feels off but isn't clearly a bug — UX friction, confusing flows, etc.]
```

---

## Open Sessions

### UAT Session — 2026-08-08 (Scotland dogfood trial — batched UAT of the planning-first build)

**Scope:** Every shipped-but-unverified change (26 `done_pending_uat` items). Run top to bottom — the
order roughly follows planning a real trip, so it doubles as a dogfood of the Scotland trip.
**Build:** staging `c6023f9` — confirmed current via `/health` (built 2026-08-08 20:26). Hard-refresh
staging before starting (frontend bundle changes).
**Verdict:** _(fill in at end)_

**How to record — checkboxes don't tick in VS Code, so ignore `[ ]` style.** For each numbered item,
reply with `N PASS` or `N FAIL: <what you saw>` (or type it on the `Result:` line). `N N/A` to skip.
You don't have to do them in one sitting — the numbers are stable.

**Known-pending friction — do NOT log these, they're already tracked as open:** activities selector
missing in trip *create* (BUG-46), map shading laggy (BUG-48), place-delete prompt (BUG-40), multi-leg
flights / multi-companion (BUG-41/42), trip-list shows country not state (BUG-53).

---

### ▶ FIRST-PASS OWNER RESULTS — 2026-08-08 (PO, as owner)

_Non-owner testing still to come (PO doing it separately — non-owner burned us last time). COO triage in
the tabled response of the same date; tracker status-flips and new-bug IDs deferred to the post-UAT bundle
so they're created once, cleanly, with PO framing on the city-thread items. Nothing here is lost — this
block is the capture of record._

**Clean owner PASS:** BUG-50, BRD-GE16, BUG-56, BUG-78, BUG-80, BRD-DP06, BUG-57, BUG-44, BRD-IT10,
BUG-49, BUG-51. · **PASS-with-idea:** BUG-77 (works; PO: commonly-misspelled country names give no
result — typed "Caymen islands" → nothing; wants spell-tolerant/keystroke lookup — NEW idea). ·
**PASS (PO leaned pass, slight uncertainty):** BUG-79 (long list but all distinct real places; "we
shouldn't drop real places, so a pass").

**PARTIAL / FAIL / open:**
- **BUG-58 — PARTIAL.** Locking a trip **deselects the trip entirely** instead of showing the locked trip
  (moving between other statuses keeps it selected). [same as finding 1.4 below]
- **BUG-71 — PARTIAL.** (a) Scotland still not in the add-trip **country** list [by-design: ISO countries
  only; Scotland is region GB-SCT — D-14/OQ-06 thread]. (b) Searching **"Newport" on a UK trip returns only
  USA Newports** — PO expected narrowing by the trip's country [GAP: picker narrows by geocoder-auto-detected
  country, not the trip's declared countries — the spike's "not day one" narrowing signal, unbuilt]. (c) NEW
  requirement: on the picker screen the **city name should be greyed out** — it was entered on the previous
  screen, editing it here doesn't re-run the lookup; user must go back.
- **BUG-72/81 — PARTIAL.** Picker **shouldn't show coordinates** (e.g. "Newport, Sullivan County"); and
  **two indistinguishable/identical-looking rows** for it [not DB duplicates — staging has 3 real Newports,
  none Sullivan County; these are indistinguishable *geocoder candidates* = BUG-72's open "which one?" gap].
- **BUG-62 — FAIL.** Companion list **isn't seeded from a global starting list** [confirmed: 0 companions in
  seed-data]. Add companion + assign to trips + rename-in-admin-with-propagation all **work** (that half passes).
- **BRD-IT08/09 — no verdict recorded** (PO left blank — needs a result).

**NEW findings surfaced during BUG-50 (owner setup):**
1. Airline / flight-number / airport fields are **free text** — PO suggests ISO-list lookups (like the
   country lookup). [NEW enhancement idea]
2. **A USA place can be added to an Argentinian trip** — no country-consistency guard. [needs PO intent
   call: multi-country trips are legitimate, so is this a bug or by-design?]
3. Post-trip review has **no overall trip rating or place rating** — only item-level ratings within a place.
   [NEW scope question — is trip/place rating in the BRD?]
4. Locking a trip **deselects the trip** (= BUG-58 partial above).
5. **"Back to trip"** button in review status just deselects the trip; PO expects it to return to the
   **active** status view. [NEW UI bug]

### ▶ NON-OWNER RESULTS — 2026-08-08 (PO, second Clerk account) — UAT COMPLETE

_**No cross-account data bleed observed** — the flagged security-invariant risk (userId-scoping-by-convention across ~65 sites) did not surface as a defect in this pass._

**Re-confirmed PASS (non-owner):** BUG-52, **BRD-IT08/09 (now tested → PASS)**, BUG-56, BUG-78, BUG-80,
BRD-DP06, BUG-44, BRD-IT10, BUG-51. Owner-side passes (BUG-50/57/77/79, BRD-GE16) stand. → **all 14 clean
passes flipped `done_pending_uat` → `done`.**

**FAIL / reopened:**
- **BUG-49 → PASS (re-closed to done).** First reopened on the Sydney 'no tag', then corrected: Sydney
  resolved-at-creation (not pending) and the PO confirmed the pin sits **above** the shading and is legible,
  so the marker z-order fix holds (owner + non-owner). The 'appeared late' symptom was a frontend map-render
  lag on add → split to **BUG-93**. Shading-over-*state-labels* is a separate low-pri observation (PO 'unsure
  if it needs fixing'), not tracked as a bug pending a PO decision.
- **BUG-58 → reopened (pending).** Locking a trip deselects it (owner + non-owner). Original fix covered
  *backward* moves; the *lock* transition still deselects. Sibling of BUG-86.
- **BUG-62 → held.** Its own scope (non-owner Companions access) **passed**; the PO's fail was the
  out-of-scope 'not seeded from a global list' → split to **BUG-92** (open product question: per-user model
  vs global seed). Awaiting PO confirm to flip → done.

**Still PARTIAL (open):** BUG-71, BUG-72, BUG-81 (city-picker cluster — sub-findings now tracked as
BUG-87/BUG-90/UX-13). BUG-73/74 not exercised (geocode-failure signal only fires on a real failure).

**NEW non-owner findings:** N1 trip-create form saves/closes on picker select → **BUG-91**; N2 first-place
dates blue, later places not (both roles) → **UX-14**; N3 lock deselects → **BUG-58** (reopened above).

**PO decision captured (BUG-87):** narrow the place picker by the trip's country set as a **hard filter**
(not a rank); the country set is declared at trip creation and editable; to add an off-country place, edit
the trip's countries first; the picker carries a visible note that results are filtered by the trip's countries.

#### Group 1 — Trips & list

1. **[BUG-50] Delete an entire trip.**
   Steps: open a trip → find the delete control in the trip *detail* view → read the confirmation → delete. Then try to delete a **Locked** trip.
   Expected: a delete affordance exists in the detail view; the confirmation names the trip and what's lost; deleting removes the trip + its places/items; a Locked trip is refused.
   Result:

2. **[BUG-58] Moving a trip backward keeps it selected.**
   Steps: select a trip in the left panel → move it *backward* through the status workflow (e.g. Confirmed → Planning).
   Expected: the trip stays selected/visible in the left panel (it must not deselect and force you to re-find it).
   Result:

3. **[BUG-52] Trip search matches on country name.**
   Steps: in trip search, type a full country name present in your trips (e.g. "United Kingdom").
   Expected: trips with a place in that country match even if the country isn't in the title. (Full names only — "UK"/ISO codes are deliberately excluded.)
   Result:

4. **[BRD-IT08/09] Rating sort + filter in item lists.**
   Steps: open a trip's item list → sort by rating (asc, then desc) → apply a minimum-rating filter. If you use the cross-trip "by city" item view, try it there too.
   Expected: items reorder by rating; the min-rating filter hides lower-rated items.
   Result:

#### Group 2 — Adding places & city identity (the big cluster)

5. **[BRD-GE16] Add a brand-new city (as owner).**
   Steps: add a place to a trip, typing a city not yet in the catalogue (a Scottish village is ideal) → complete the flow.
   Expected: added in one uninterrupted flow, no error; country/region resolve automatically; re-adding the same city returns the existing one (no duplicate row).
   Result:

6. **[BUG-56] City name auto-capitalises.**
   Steps: add a place typing the city in lowercase (e.g. "glasgow").
   Expected: it saves capitalised ("Glasgow").
   Result:

7. **[BUG-71] Ambiguous city offers disambiguation.**
   Steps: add a place, type an ambiguous name — "Springfield".
   Expected: you're offered a choice (candidates / region pick) — NOT a silent auto-fill of one state with no indication another exists.
   Result:

8. **[BUG-72] Dropdown rows show enough to pick.**
   Steps: look at the Add-Place autocomplete rows for an ambiguous city.
   Expected: each row distinguishes the options (city + state/region + country), not just "name country".
   Result:

9. **[BUG-81] Picker rows are clean.**
   Steps: trigger the disambiguation picker (ambiguous city).
   Expected: rows read as "City, State, Country" — no county/postcode/raw address noise.
   Result:

10. **[BUG-78] "Suggested:" region caption is bold enough.**
    Steps: add a place where a region is *suggested* (auto-filled but flagged to check).
    Expected: the "Suggested:" value is visually bold enough to read as something to verify, not accept blindly.
    Result:

11. **[BUG-79] Region list narrowed for an ambiguous US city.**
    Steps: add "Springfield" (US) → open the state/region selector.
    Expected: the state list is narrowed to the real candidates (IL/MA/MO/OH…), not the full 50-state list.
    Result:

12. **[BUG-80] Two same-name places are distinguishable.**
    Steps: in one trip, save two different "Newport"s (e.g. Newport in Wales and Newport in Scotland/Fife).
    Expected: they display distinguishably ("Newport, Scotland" vs "Newport, Wales"), not both "Newport United Kingdom".
    Result:

13. **[BRD-DP06] First place inherits the trip's dates.**
    Steps: create a trip with a date range → add the **first** place.
    Expected: that place's arrival/departure pre-fill from the trip start/end.
    Result:

14. **[BUG-77] Places in previously-empty region countries.**
    Steps (niche): add a place in a country that used to have no regions (e.g. Argentina, Brazil, India).
    Expected: a region list is available / the flow handles it gracefully — no broken empty selector.
    Result:

15. **[BUG-73 / BUG-74] Geocode-failure signal (only if you hit it).**
    Steps: hard to force on purpose — if a city lookup ever fails or hangs, note what you saw.
    Expected: a visible banner/signal that the lookup failed (not a silent "found nothing"), covering both a backend hop failure and an upstream geocoder no-match.
    Result:

#### Group 3 — Items (flights, hotels, car rental, activities)

16. **[BUG-57] Item dates default to the trip's start.**
    Steps: with a trip date range set, add a hotel/activity, then a flight.
    Expected: item date(s) default to the trip's start (not today); a flight's arrival defaults to its departure date; any edit you make is never re-defaulted over.
    Result:

17. **[BUG-44] Car-rental pickup location as subtext.**
    Steps: add/view a car-rental item with a pickup location.
    Expected: the pickup location shows as subtext under the provider name (like an airline + flight number on a flight).
    Result:

18. **[BRD-IT10] Optional Google Maps URL → directions link.**
    Steps: edit an item → set the optional Google Maps URL → view the item. Then view an item with no URL.
    Expected: a one-click map/directions link renders when a URL is set; nothing when it's empty.
    Result:

#### Group 4 — Map

19. **[BUG-49] City markers render on top of state shading.**
    Steps: on the map, view a trip where state/region shading is active and city markers are present.
    Expected: city markers stay visible on top of the shading layer (not hidden behind it).
    Result:

#### Group 5 — Admin panel

20. **[BUG-51] Companion rename propagates to all trips.**
    Steps: in the admin panel, rename a companion who appears on 2+ trips → check every trip they're on.
    Expected: the new name shows everywhere immediately (no stale value needing a manual refresh).
    Result:

21. **[BUG-62] Non-owner can reach the Companions tab.** _(needs a second, non-owner account)_
    Steps: sign in as a non-owner → open the admin panel.
    Expected: the Companions tab is reachable (per-tab gating, not a whole-panel owner lock).
    Note: needs a non-owner login; if you can't test solo, mark `21 N/A` — it's coupled to the still-open BUG-63.
    Result:

#### Group 6 — Internal / infra (no manual step — informational only)

22. **QUAL-20 / QUAL-26 / QUAL-25 / DEP-05** — post-deploy smoke check, build-SHA in `/health` (confirmed serving `c6023f9`), the gazetteer spike (doc-only), and a security dependency fix. All verified by CI/automation, nothing to click. Listed so the record is complete.

#### Notes / Observations
_(anything that felt off but isn't clearly a bug — friction, confusing flows, etc.)_

---

### UAT Session — 2026-08-07 (BUG-75/UX-12 city-identity picker + Change-city — PASS, CLOSED)

**Scope:** PO live UAT on staging (build 4e77594) of the ATDD-first BUG-75/UX-12 build — the
city-disambiguation place-picker, the country-suggestion, and the coverage of the geocode search.
**Build:** 4e77594; re-tested on **758ef15** after the BUG-76 fix.
**Verdict:** PASS — closed 2026-08-07. The picker mechanism PASSES, and BUG-76 (the coverage defect
it surfaced) is now fixed, deployed, and re-tested PASS on build 758ef15. BUG-75, UX-12, BUG-76 → done.
A follow-on picker READABILITY finding surfaced during the re-test → tracked as **BUG-81** (new).

#### Findings

- [x] **Place-picker fires and disambiguates (BUG-75 headline) — PASS.** Searching "Springfield" now
      shows "Multiple places match — please choose the one you mean" with distinguishable region-qualified
      rows (Fairfax County, Virginia / LaPorte County, Indiana), instead of the old silent auto-resolve.
      The MAJOR-2 country-suggestion ("Suggested: United States of America — from 'Springfield'") also shows.
      NOTE: a first pass appeared to show the old region dropdown — that was a **stale cached browser
      bundle** (staging had redeployed f7b36b8 → 4e77594 mid-session); a hard refresh loaded the new
      frontend and the picker rendered correctly. Not a product bug.

- [x] **Geocode coverage — the cities people mean are missing (BUG-76, P1) — RESOLVED & re-tested PASS
      2026-08-07 (build 758ef15).** Was: the Springfield picker only offered minor place-node towns (VA/IN);
      the famous Springfields (IL/MO/MA) and **Denver** never appeared. Fixed in PR #421 — the accept-rule
      now keys on `addresstype` instead of `type`, so `boundary/administrative` cities (how OSM models
      prominent places) are admitted. Re-test: Denver auto-populates United States + Colorado and offers
      Denver CO distinctly; Springfield surfaces IL/MA/MO/OH etc. BUG-74's backend half (empty-vs-failed
      `status` contract) shipped in the same PR; its frontend banner remains a discrete follow-up.

- [ ] **Picker readability (BUG-81, P2, NEW — non-blocking).** With the coverage fix surfacing full lists,
      the picker rows (raw Nominatim `display_name`) are hard to skim — county + postcode noise
      ("Springfield, Fairfax County, Virginia, 22150, United States"). Agreed fix: rows read "City, State,
      Country", county added only to disambiguate same-state duplicates, postcode never; + list height cap.
      Bundled with the BUG-74 frontend banner; UX to review the picker for theme adherence after build.

#### Notes / Observations
The picker fix is genuinely working; BUG-76 was UPSTREAM of it and is now fixed and re-tested, so this
session is CLOSED PASS. The only residual is the BUG-81 readability polish (tracked, non-blocking).

### UAT Session — 2026-08-01 (BRD-GE16 / ADL-46 release — PO deployment shakedown, FAIL)

**Scope:** PO's own shakedown of the ADL-46 release on staging, run unprompted at session pickup.
Add Place → city entry → geocode auto-lookup. This is the OP-32 shakedown, and it did exactly what
the rule promises: three defects found before a formal UAT round started.
**Build:** staging @ a398d10 (Railway deploy verified live at the time; the first occurrence was
under 645757c — both post-release, so **not** a deployment defect)
**Verdict:** FAIL — GE-16's disambiguation criterion is not met in live use.

#### Findings

- [ ] **BUG-71 (P1) — ambiguous city silently auto-resolves, no disambiguation offered.**
      Typing "springfield" pre-populated **State = Virginia** with no hint that any other Springfield
      exists. Violates GE-16 verbatim. Confirmed by two independent probes: PO screenshot of the
      settled form, and a code read of `AddPlaceFlow.tsx:250-263`.
      **The Architect's F1/F2 ruling §2.2 predicted and explicitly accepted this exact limit**
      ("That is a guess. It is accepted for this release."). It was hit on the *first real use*,
      on the most famous ambiguous US city name — good evidence the limit was accepted too cheaply.
      Mechanism: the discovery lookup is globally unconstrained at `limit:'10'`, so the candidate
      set is thinned to a single distinct region and the ambiguity discriminator never fires.
      Fix spans BUG-71 and **D-19**, which we had deferred as "probably edge case, unmeasured."

- [ ] **BUG-72 (P2) — catalogue dropdown gives no way to tell which Springfield you're picking.**
      Renders `{name} {country_code}` only, though `region_id` is already in the payload.
      PO asked whether to remove the dropdown; **COO recommended against** — it is what makes the
      shared catalogue converge, and removing it would leave only the path that just failed.
      Fix the label (needs a region join in the search response), don't delete the control.

- [ ] **BUG-73 (P2) — a failed geocode lookup is completely silent.**
      Surfaced by the ENV-02 502s below. The user cannot distinguish "picked Virginia",
      "found nothing", and "the lookup never ran". This is the defect that turns every
      infrastructure hiccup into a false product bug.

- [ ] **ENV-02 (P2) — two staging 502s during the session**, `/api/cities` and `/api/geocode`,
      both self-resolving. Railway edge proxy "connection dial timeout" × 3; **app-side causes
      ruled out with evidence** (no restart, queue ticking throughout, CPU max 19%, memory 0.26/1.0 GB).
      Root cause not established — Railway-side networking, single replica in `sfo`.

#### Notes / Observations

1. **This session is the argument for OP-32's shakedown-before-UAT rule.** The COO had queried
   `geocode_status` earlier the same morning, seen one correctly-shaped `Springfield/Virginia` row,
   and concluded the live path "worked". A correct row is not a correct flow — the row was produced
   by exactly the defect above. Ten minutes of a real browser found what a database query could not.
2. **D-19 is no longer unmeasured.** It was deferred pending data on how often users hit a wrong
   city. One user, first city typed, wrong result, no recourse. That is data.
3. **BRD-GE16 must not close on a clean UAT elsewhere.** It was already `done_pending_uat` carrying
   a partial-delivery note for UX-12 (no correction UI). This adds three more.
4. Console also showed `Clerk has been loaded with development keys` on staging. Staging and
   production share one Clerk pool — worth resolving before the production promotion. Noted against
   the existing Clerk-pool thread rather than given its own ID.
5. Clerk telemetry CSP noise reappeared — that is the known **BUG-68**, no functional impact.

---

### UAT Session — 2026-07-28 (Wave 1 sub-wave B — AWAITING PO, not yet tested)

**Scope:** Three more items shipped by Wave 1 sub-wave B, on top of the seven from sub-wave A
below. All `done_pending_uat`. COO-raised checklist, not a completed test session — the verdict
line stays blank until you run it.
**Build:** main @ 1f4f535
**Verdict:** _(pending — PO to fill in)_

#### To verify

- [ ] **BUG-50 / TR-14** — open a trip with places and items and delete it from the **detail**
      view (not the bulk-select in the list). The confirmation should name the trip and what
      will be lost. Cancelling must leave everything untouched. Try it on a **Locked** trip:
      it should refuse with a message pointing you at unlocking, not fail silently. Check
      desktop and mobile. (PR #319)
      *Read this as TR-14 partially delivered — see the caveat below.*

- [ ] **BUG-58** — move a trip **backward** through the status workflow ("Return to Planning"
      from review). The trip should stay selected with the detail panel just updating. (PR #319)

- [ ] **BUG-52 / TR-13** — search your trip list for **"United States"** (or any country name)
      and a trip with a US place should appear even if the title says nothing about the US.
      **Searching "USA" will still return nothing, and that is correct as specified** — TR-13
      covers full country names only. See the open question below. (PR #320)

- [ ] **BUG-56** — type a lowercase city name into the new-city form; the first letter should
      capitalise. (PR #320)

- [ ] **BRD-IT0809 / IT-08 + IT-09** — on a trip with rated restaurants/hotels/experiences,
      sort by rating both ways and apply a minimum-rating filter. Unrated items should
      **disappear** under a minimum filter rather than sorting to the bottom. Clearing both
      should restore the original order, and the setting must not carry over to another trip.
      (PR #318)

- [ ] **NEW SCREEN, needs your eyes most** — IT-09 required a cross-trip city view that had no
      frontend at all, so **a brand-new page was built with no UX spec**: click a city name in
      a place section to reach `/cities/:id`. It should list rated items for that city drawn
      from **every** trip that visited it, with the same sort/filter behaviour. Judge the
      design as much as the function — an implementation agent designed this screen, not UX.
      (PR #318)

#### Caveat — BUG-50 passing does NOT close TR-14

A trip in **review_pending** status renders a different component and has **no delete
affordance at all**, so it cannot be deleted without changing status first. Logged as
**BUG-65**; TR-14 is not fully satisfied until that ships. Two related items logged at the same
time: **BUG-66** (the forward Lock path repeats BUG-58's pattern — unverified, and whether it's
even unwanted is a product question) and **BUG-67** (the locked-delete refusal reads cached
status rather than the backend's authoritative 403 — not a security issue).

#### Open question for the PO

- [ ] **Should trip search match "USA" and "US" as well as "United States"?** You gave both
      "United States" and "USA" as examples in the original report; only the first works today.
      Full analysis and a COO recommendation (add ISO codes — cheap; leave colloquial names
      like "America"/"Britain" parked — genuinely needs a data source) are in
      `jobs/COO/open-dialogues.md` **D-14**. Adopting it needs a small TR-13 amendment.

---

### UAT Session — 2026-07-28 (Wave 1 sub-wave A — AWAITING PO, not yet tested)

**Scope:** Seven items shipped by Wave 1 sub-wave A, all flipped to `done_pending_uat` and
awaiting a PO pass. This block is a COO-raised checklist, not a completed test session —
the verdict line stays blank until you run it.
**Build:** main @ ac8281e
**Verdict:** _(pending — PO to fill in)_

#### To verify

- [ ] **BUG-49** — zoom in far enough for state/region shading to activate. City markers
      should stay visible *on top of* the shading, not disappear behind it. (PR #301)

- [ ] **BUG-62** — sign in as a **non-owner** account. The Admin nav link should now be
      visible, `/admin` should load, and you should see **only** the Companions and Map
      Shading tabs. Categories, Activities and Countries must not appear at all. As the
      owner, all five tabs should still be there. (PR #303)
      *This is the one that most needs real eyes — the whole change is about what a
      non-owner sees, and no automated test confirms it reads right.*
      **This item is still testable — the blocker below does not affect it.**

> **BLOCKER for the rest of the non-owner pass (added 2026-07-28, BUG-63).**
> Ryan reproduced BUG-63 on staging while testing as a non-owner and captured the console.
> A non-owner **cannot add a place to a trip at all**: `GET /api/admin/categories/active`,
> `GET /api/admin/activities/active` and `POST /api/cities` all return **403**, because each
> sits behind an owner gate (`admin.ts:105` router-level `requireOwner`; `cities.ts:91`).
> The tracker's previous 401/mobile/token-refresh theory is **wrong and superseded** — it is a
> literal 403, on desktop, fully deterministic.
>
> **Run the remaining checklist items as the OWNER.** The non-owner pass is limited to the
> BUG-62 tab-visibility check above, which is the actual BUG-62 acceptance criterion anyway.
> BUG-63 is now **P1**, owned by Architect (it is an access-matrix change, not a code fix —
> `security.access-matrix.test.ts` currently asserts those 403s as *correct*, so the spec has
> to change before the code can).
>
> The same console capture also **confirmed BUG-55 live** (Nominatim CSP-blocked, quoted
> verbatim) and surfaced **BUG-68** (Clerk's telemetry endpoint CSP-blocked — console noise,
> no functional impact). All three came out of one console check, which is precisely the
> deployment shakedown OP-32 mandates.

- [ ] **BUG-51** — rename a companion in the admin panel who is attached to **two or more**
      trips. Every trip should show the new name immediately, with no need to open and
      re-save any trip. Also check create and deactivate. (PR #302 + #308)

- [ ] **BUG-44** — a car rental item should show its pickup location as subtext under the
      provider, the same way a flight shows airline + flight number. (PR #306)

- [ ] **BUG-57 / IT-11 + BRD-DP06** — open a trip whose dates are **not** in the current
      month and add an item. The date picker should open on the trip's start date, not
      today. Enter a flight departure date — arrival should populate to the same day. Edit
      either date by hand, save, reopen: your edit must survive. Adding the **first** place
      to a trip should inherit the trip's date range; a second place should not. (PR #306)

- [ ] **BRD-IT10** — add a Google Maps URL to an item. A "View map" link should appear on
      the item card and open in a new tab. An item with no URL should show no link. A
      non-`https://` URL should be rejected. (PR #306)

#### Open question for the PO (raised by the agent, deliberately not decided)

- [ ] **Hotel checkout / car-rental dropoff currently default from the trip's END date.**
      IT-11's text only says date(s) default "to the start of that range" and names just
      the flight departure→arrival cascade explicitly. Defaulting the *second* date of a
      two-date item to the trip end is a reasonable generalisation but goes beyond the
      literal success criteria. Confirm or reject — it's a default value, trivially
      changed either way.

#### Known cosmetic issue, logged not fixed

- [ ] `zMapUrl`'s https check is case-sensitive, so an uppercase `HTTPS://` URL is
      rejected. Fails **closed**, so it's a UX wart rather than a security gap. Noted in
      BRD-IT10's tracker entry for whoever next touches that file.


### UAT Session — 2026-07-26 (PHASE-4 formal close — QA & Documentation)

**Scope:** Phase 4 phase-completion gate. Not a fresh test pass — this records the PO's
verdict that the Scotland dogfood trial and the 2026-07-20 / 2026-07-21 UAT sessions below
*were* the Phase 4 UAT.
**Build:** main @ 1a4f84f (verdict given against the dogfooded builds: c4340ef, 7bafc11, f5fa666)
**Verdict:** PASS — closes PHASE-4. PO: *"phase 4 can already close, the dogfooding was the UAT."*

#### Findings

- [x] Phase 4 deliverables confirmed complete and exercised in real use.
      580 backend + 154 frontend unit tests passing, contract tests passing, Playwright E2E
      suite a permanent CI gate (OP-11, PR #124), README + CODEBASE.md done, OP-06 hardening
      gate closed 2026-07-16 (PR #115).
      Fixed myself: no — PO verdict, no action needed.

- [x] PHASE-4's tracker note was stale and is corrected in the same PR as this entry.
      It listed *"Remaining before formal close: OP-07 (UI/UX expert review) + PO phase UAT"* —
      but OP-07 was already `done` and the note was never flipped (Document lifecycle miss).
      PO UAT was therefore the only genuinely outstanding gate, which this session supplies.
      Fixed myself: no — found by COO during the close-out audit.

#### Notes / Observations

1. **The 21 UAT-found defects do not block this close and have been re-phased 4 → 6.**
   BUG-40–58, BRD-DP06 and OQ-06 were *found during* Phase 4 but are feature/UX defects, not
   Phase 4 deliverables — they only carried a `phase: 4` tag because that was the open phase
   when they were logged. Phase 4's own scope is QA infrastructure and documentation, all of
   which shipped. PHASE-6's flagship features (BRD-PL0104, BRD-CU0103) are already explicitly
   gated on this same batch being worked through, so phase 6 is their accurate home.
2. **Two genuinely Phase-4-scope items stay parked under the closed phase**, matching the
   existing ENV-01 / QUAL-02 / UX-05 pattern: BUG-37 (→ `backlog`; not reproducible in 13 runs,
   see its tracker note) and OP-15 (→ phase 6, following its prerequisite QUAL-03).
3. This close does **not** assert the product is defect-free — 26 open backlog items remain,
   sequenced in `jobs/COO/backlog-clearance-plan.md`. It asserts Phase 4's deliverables are
   done and were validated by real dogfooding use.

---

### UAT Session — 2026-07-21 (WP-03/WP-04 Waypoint Trips reskin, Phase 2)

**Scope:** Trips screen desktop reskin (WP-03) + net-new mobile Trips layout (WP-04), per BRD §5.16 / `jobs/ux/tech/20260721-UX-waypoint-spec.md` Phase 2. Cross-reference table in the UX spec's Phase 2 section (item 8) defined the intended UAT scope.
**Build:** main @ f5fa666 (PR #208)
**Verdict:** PASS — closes WP-03 and WP-04. PO: "I'm happy with the reskin. good work to you and the team."

#### Findings

- [x] Reskin approved as delivered — no blocking issues raised against the WP-03/WP-04 implementation itself.
      Fixed myself: no — PO verification of PR #208. No action needed.

#### Notes / Observations
Several items raised in the same-day general feedback session below (BUG-53 trip-list place display, BUG-58 status-workflow deselect) touch the reskinned Trips screen but were logged as new backlog bugs against current behavior, not as WP-03/WP-04 regressions or blockers — PO's PASS verdict here is unconditional. WP-03/WP-04 tracker entries flipped `done_pending_uat` → `done`.

---

### UAT Session — 2026-07-21 (general feedback pass — logged/prioritised only, not actioned)

**Scope:** General product feedback across booking items, map, search, trip management, admin — not tied to a specific gate. PO explicitly requested log + prioritise only, no dispatch this session.
**Build:** main @ f5fa666
**Verdict:** N/A (feedback log, not a pass/fail test pass)

#### Findings

- [ ] Place deletion should prompt (delete all / move to trip-level / cancel) when the place has items, instead of always silently reassigning
      Bug: BUG-40 (P2)

- [ ] Multi-leg/connecting flights on one booking (e.g. Seattle→London layover→Glasgow)
      Bug: BUG-41 (P2, needs Architect schema design)

- [ ] Multiple companions/seats per booking item
      Bug: BUG-42 (P2, needs schema/UX scoping)

- [ ] Apple Wallet import to pre-populate booking details (longer-term idea, tied to BUG-42's entry burden)
      Bug: BUG-43 (P3/backlog, needs research spike)

- [ ] Car rental pickup location should render as subtext under provider, mirroring the flight airline/flight-number pattern
      Bug: BUG-44 (P2)

- [ ] Longer term: convert free-text airline/car-rental-provider fields to dropdown + Other, sourced from a comprehensive list
      Bug: BUG-45 (P3/backlog, needs data-source decision)

- [ ] Northern Ireland trip appeared to "leak" from another account — PO self-diagnosed in-session as the known BUG-30 gap (GB region seeding), not a leak. BUG-30 already done/closed. Raised a real follow-on question: is there a better systematic subdivision list (ISO 3166-2) than hand-seeding regions per country as gaps are found?
      Tracked as: OQ-06 (P3, for Architect)

- [ ] Activities selector present on trip edit but missing from trip create
      Bug: BUG-46 (P2)

- [ ] Longer term: activities should auto-populate from trip/place content instead of manual pre-selection; trip categories confirmed fine as manual (distinct purpose)
      Bug: BUG-47 (P3, needs product/UX scoping — check against BUG-46 before briefing that as a simple fix)

- [ ] Country→state map shading requires zooming in too far (e.g. US needs near-full-screen zoom before state shading appears), compounded by rendering latency
      Bug: BUG-48 (P2)

- [ ] City markers render behind the state shading layer once it activates
      Bug: BUG-49 (P2)

- [ ] No way to delete an entire trip (only place-level removal exists, via BUG-32)
      Bug: BUG-50 (P1)

- [ ] Companion name change in admin panel propagated correctly to one trip automatically, but a second trip (role 'partner' → renamed Aisling) required manually opening/editing/saving that trip before the new name showed
      Bug: BUG-51 (P1 — data integrity)

- [ ] Trip search doesn't match on country name (e.g. "United States"/"USA") unless the country string is literally in the trip title
      Bug: BUG-52 (P2)

- [ ] Trip list place display should show city (bold) + state on the second line instead of country; country should surface elsewhere (pill next to category, or its own row) — also feeds into why country search (BUG-52) feels broken, since country isn't visible on the card today
      Bug: BUG-53 (P2, needs UX spec)

- [ ] No way to control category/activity colour — PO explicitly flagged as future-phase, not near-term
      Bug: BUG-54 (P3/backlog)

- [ ] Entering a city doesn't auto-populate its country/state fields
      Bug: BUG-55 (P2)

- [ ] City name entry isn't auto-capitalized
      Bug: BUG-56 (P3)

- [ ] Date pickers aren't "intelligent": adding an item should default to the trip's date range (not today); flights should default arrival to the same day as departure. Goal: avoid manually walking both date pickers away from today when working on a trip outside the current month
      Bug: BUG-57 (P2, subsumes the narrower flight-arrival-defaults-to-departure finding)

- [ ] Moving a trip backward through the status workflow deselects it entirely from the left panel, forcing re-selection
      Bug: BUG-58 (P2)

#### Notes / Observations
PO requested this session go no further than logging + prioritising — no GitHub issues opened, no BRD requirement IDs assigned, no dispatch. All 19 items logged to tracker.json (BUG-40 through BUG-58) plus OQ-06 (Architect open question), all status `pending`. Several flagged as needing Architect or UX scoping before they're briefable (BUG-41, BUG-42, BUG-45, BUG-47, BUG-53, OQ-06) rather than being direct-to-brief bugs. P1: BUG-50 (trip delete), BUG-51 (companion name sync). Everything else P2 except explicit backlog items (BUG-43, BUG-45, BUG-54, BUG-56 at P3).

---

### UAT Session — 2026-07-21

**Scope:** WP-02 Waypoint design-system foundation (Phase 1) — icon swap visual check per BRD §5.16 WP-02 success criteria
**Build:** main @ 7bafc11
**Verdict:** PASS — closes WP-02.

#### Findings

- [x] Icon swap (emoji → SVG) confirmed correct, no other visual regressions
      Fixed myself: no — PO verification of PR #198. No action needed.

#### Notes / Observations
WP-02 was gated `done_pending_uat` in the tracker pending this pass, per CLAUDE.md's
mandatory phase-completion UAT gate. PASS here closes it — status flipped to `done`.
Unblocks WP-03/WP-04 (Phase 2 Trips reskin) dispatch, still gated on the UX spec's 13
Phase-2 conflict-resolution decisions.

### UAT Session — 2026-07-20

**Scope:** General planning-flow pass — places, items, map, admin (post BUG-27/28/29/10 fixes, first UAT touch since 2026-07-16)
**Build:** main @ c4340ef
**Verdict:** PARTIAL — one confirmed fix (BUG-27), one incorrect fix reopened (BUG-10), one verification blocked (BUG-28), several new findings triaged below.

#### Findings

- [x] Locked trips now fully read-only
      Fixed myself: no — confirms BUG-27 (PR #140). No action needed.

- [ ] Scotland (and UK generally) not selectable when adding a place
      Steps: 1. Add a place 2. Search country list for Scotland/UK
      Expected: UK constituent countries available per GE-04/05/06 (every country ships pre-configured)
      Actual: Not present — GB appears to be missing or mis-seeded (countries are ISO 3166-1; Scotland/England/Wales/NI should be Regions under GB per GE-01/02/06, same tier as US states)
      Bug: BUG-30 (P1 — blocks Scotland dogfood trial scoping)

- [ ] First place added to a trip doesn't inherit the trip's date range
      Expected: place arrival/departure default-populate from trip dates, editable after
      Actual: blank / requires manual entry
      Bug: tracked under new BRD requirement DP-06

- [ ] Flights (and, per discussion, cars) forced to live inside a place
      Expected: IT-01 already permits trip-level items ("against a trip or a specific place") — flight should be addable without a parent place. Cars similarly, case-by-case
      Actual: no trip-level "Add Item" entry point exists in the UI — schema/ItemForm already support tripPlaceId = null, PlaceSection just never renders that path
      Decision (this session): car reuses the same trip-level Add Item mechanism as flights — no separate toggle UI
      Bug: BUG-36

- [ ] Place date range edit doesn't visibly save
      Steps: 1. Open a place 2. Set an arrival/departure date range 3. Observe display
      Expected: place section reflects the new range (DP-04/DP-05)
      Actual: still shows the trip's date range after save
      Bug: BUG-31 (P1) — **blocks BUG-28 re-verification** (can't confirm arrival<=departure validation without dates visibly persisting first)

- [ ] No way to remove a place from a trip once added
      Bug: BUG-32

- [ ] Same place can't be added twice to one trip (e.g. Glasgow → day trip to Edinburgh → back to Glasgow)
      Actual: `trip_places` enforces one row per (trip, city) — a real itinerary-model constraint, not a simple bug
      Raised as: BRD Open Question OQ-05 — Architect to resolve before any brief touching trip-place identity

- [ ] Entering "Glasgow" offered two duplicate entries in the autocomplete dropdown
      Expected: one canonical Glasgow record
      Actual: `cities` table has no uniqueness constraint on (name, country) — find-or-create logic isn't deduping
      Bug: BUG-33

- [ ] Map standout icon inconsistent between cities in the same trip
      Steps: view map for a trip with Glasgow + Edinburgh
      Expected: both show the "visited" standout treatment consistently
      Actual: Glasgow shows correctly; Edinburgh only shows a pin at high zoom, no standout icon
      Bug: BUG-34

- [ ] Admin panel region-tier checkbox has no explanatory hovertext
      Bug: BUG-35 (P3, polish)

- [ ] Status pills on trips page don't match map shading colours (admin-tab-driven)
      Note: needs a UX spec before this becomes a BRD requirement — tracked, not yet briefable

- [ ] Item-level field for a Google Maps URL requested (one-click directions, avoids surfacing phone/address separately)
      Tracked as new BRD requirement IT-10 — small schema addition, needs Architect sign-off before Database brief

- [ ] Trip banner image, nice-to-have — decided this session: manual upload only, no auto-fetch from Google Images (ToS/legal risk, no clean API for "representative photo of a place")
      Folds into existing UX-05 / PH-04 (already deferred, Phase 2) — added banner-placement detail to that entry, no new BRD ID

- [ ] BUG-10 fix (200-char trip-name limit) does the wrong thing
      Expected: input field hard-restricts typing past the limit and shows a red inline
      error message when reached; user can never submit an over-limit name
      Actual: silently truncates the name until it fits, no error shown
      Additional: PO now wants the limit itself lowered to 75 characters (not 200)
      Action: **BUG-10 reopened** with corrected success criteria (see tracker)

- [ ] BUG-28 (place-date PATCH validation) not yet re-verifiable
      Reason: blocked on BUG-31 (place dates not visibly persisting) — can't confirm arrival<=departure enforcement until dates display correctly first

#### Notes / Observations
Car-vs-place placement (item raised as "want to discuss") resolved in-session: reuse the
trip-level Add Item entry point rather than inventing a separate toggle. Banner-image scope
resolved in-session: manual upload only, dropped the Google Images auto-fetch idea entirely.

### UAT Session — 2026-07-16

**Scope:** Q5 real-auth end-to-end (OP-06 HC-01 verification, 6-step sequence)
**Build:** main @ 0c56fc2 + fix/hc02-azp-validation (azp validation live via tsx watch)
**Verdict:** PASS — closes HC-01. One non-blocking UX finding (BUG-26).

#### Findings

- [x] Admin panel nav button visible to non-owner users
      Steps: 1. Sign in as a fresh non-owner Clerk account (ryanvilliers00+test@gmail.com)
             2. Observe banner — admin button present
             3. Click it — admin page loads, every section renders "not authorised"
      Expected: Admin nav entry hidden entirely for non-owners
      Actual: Button visible; page loads; backend requireOwner correctly 403s all sections
      Screenshot: none
      Fixed myself: no
      Bug: BUG-26 / GitHub #116 (P3, frontend presentation gating — not a security hole;
      backend enforcement verified correct in this same session)
      Fixed: PR #117 (merged 2026-07-16) — GET /api/me + owner-gated nav/route

#### Notes / Observations

1. Owner account: Clerk sign-in completed in-browser through the devcontainer firewall
   (#80); JWKS 200 from inside the container; no BYPASS_AUTH in `.env.local`; app fully
   functional under real auth ("it all works" — PO).
2. Live JWT decoded during session: `sub` = PO's real Clerk user; **no `aud` claim** —
   Clerk session tokens carry `azp` instead. Drove the HC-02 azp implementation (PR #115).
3. `OWNER_CLERK_ID` in `.env.local` had literal `<>` brackets (placeholder paste error)
   — would have broken owner resolution; fixed during session by COO.
4. Non-owner account saw only its own (empty) data — data separation confirmed
   (1.5-C live spot-check satisfied alongside 1.5-B).
5. PO verdict on step 5: "not a complete fail, just a suboptimal pass" — hence PASS with
   BUG-26 logged.

### UAT Session — 2026-03-20

**Scope:** Testing the UI migration
**Build:** 77a415b
**Verdict:** PASS (conditional — "looks good enough to continue", 2026-03-21)

#### Findings

- [x] Sort control missing from trip list
      Steps: Open trips tab, attempt to sort by newest/oldest/name
      Expected: Sort dropdown or controls visible in left panel
      Actual: No sort UI — hardcoded to date descending
      Screenshot: none
      Fixed myself: no
      Bug: #11

- [x] Trip detail header — wrong layout and element order
      Steps: Open any trip in right panel
      Expected (mockup): Trip status > Edit > Photos on right side of header
      Actual: Status on left next to title, then Photos > Edit on right
      Screenshot: none
      Fixed myself: no
      Bug: #12 (visual discrepancy — dispatched to UX)

- [x] Trip detail meta row — stacked instead of inline
      Steps: Open any trip in right panel, view below title
      Expected (mockup): Date range | Companions | Tags on one inline row
      Actual: Date range on own line, new line companions, new line tags
      Screenshot: none
      Fixed myself: no
      Bug: #12 (visual discrepancy — dispatched to UX)

- [x] In-panel navigation tabs missing
      Note: F-02 (Itinerary/Review tabs) confirmed DEFERRED — not a current fix requirement.
      F-03 (Map tab) remains scrapped. Tabs will be specced as separate work when content is ready.

- [x] Status bar missing or not visible
      Steps: Open any trip in right panel, scroll to bottom
      Expected (mockup): Persistent bar showing current status + next status CTA
      Actual: Not visible — F-04/TR-12 was in brief but may be present and incorrectly styled
      Screenshot: none
      Fixed myself: no
      Bug: #12 (UX to confirm if present but unstyled, or absent)

- [x] City box shading missing in trip detail
      Steps: Open a trip with multiple places, view place cards
      Expected (mockup): Shading/background styling on city section boxes
      Actual: No shading on city boxes
      Screenshot: none
      Fixed myself: no
      Bug: #12 (dispatched to UX)

- [x] Icons blue instead of green theme from mockup
      Screenshot: none
      Fixed myself: no
      Bug: #12 (dispatched to UX)

#### Notes / Observations

1. Sort regression — was in pre-migration app, dropped during Tailwind migration. PO confirmed: "shouldn't have dropped features from the original version."
2. Multiple visual discrepancies between delivered UI and approved Option B mockup. UX dispatched to do formal side-by-side comparison and produce delta doc.
3. ~~Open scope question: F-02 in-panel tabs.~~ **Closed 2026-03-23** — PO decision: not worth implementing without the map tab. F-02 and F-03 removed from BRD §9 entirely (v2.6).
4. BYPASS_AUTH=true added to .env.local — local dev was blocked by devcontainer firewall unable to reach Clerk JWKS endpoint.

---
