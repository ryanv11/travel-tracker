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
