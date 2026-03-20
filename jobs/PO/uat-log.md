# PO UAT Log — Travel Tracker

This file is checked by the COO on every session pickup.
Add findings here during or after a live testing session. No specific format required —
bullet points are fine. Screenshots can be attached to the session folder (see below).

**UAT is a mandatory gate. Phases cannot be formally closed without a UAT PASS verdict.**

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

## Sessions

<!-- Add new sessions below, most recent first -->

### UAT Session — 2026-03-19 (live testing — Dublin trip)

**Scope:** New trip creation for a revisited city (Dublin), carry-forward, map interaction, trip list sort
**Build:** cd03f8c (latest at time of testing)
**Verdict:** FAIL — three bugs found, none self-fixed

#### Findings

- [ ] Carry-forward modal did not appear when adding Dublin to a new trip
      Steps: 1. Have an existing trip with a Dublin restaurant marked "next time"
             2. Create a new trip → Add Place → select Dublin, Ireland
             3. Expected: carry-forward modal appears with the restaurant as a candidate
      Expected: CarryForwardModal shows the "next time" restaurant
      Actual: Modal never appeared
      Screenshot: none
      Fixed myself: no
      Logged as: BUG-17
      Note for triage: likely city matching or query issue in carry-forward logic

- [ ] New Dublin trip does not appear when clicking Ireland on the map
      Steps: 1. Create a new trip with Dublin, Ireland as a place
             2. Click Ireland on the map → trips list should filter to Irish trips
      Expected: new Dublin trip appears in filtered list
      Actual: trip does not appear in filtered results
      Screenshot: none
      Fixed myself: no
      Logged as: BUG-18
      Note for triage: separate from shading — this is map click-through filter.
      May be a city/country association issue or URL param filter mismatch.

- [ ] Trip list sort not working correctly
      Steps: 1. Create a new trip (Dublin)
             2. Trips page shows "Newest First" — new trip appears near bottom, not top
             3. Switch to "Oldest First" — new trip does not move to top
      Expected: sort reflects trip recency correctly in both directions
      Actual: new trip appears near bottom regardless of sort direction;
              switching sort order doesn't move it as expected
      Screenshot: none
      Fixed myself: no
      Logged as: BUG-19
      Note for triage: sort likely driving off start_date (user-entered past date)
      rather than created_at, or sort comparison logic has a bug

#### Notes / Observations
- The carry-forward trigger path (auto-fires after Add Place) is too implicit —
  user had no idea it existed until told. UX discoverability issue, not a bug,
  but worth noting for the migration brief.

---

### UAT Session — 2026-03-19 (retroactive — pre-log)

**Scope:** General usage — region tier admin, Add Place flow
**Build:** ~1994213 / d704343
**Verdict:** PARTIAL — two bugs found and self-fixed; no further issues in scope tested

#### Findings

- [x] Region tier toggle cleared label on disable
      Steps: Admin panel → country with regions → toggle region tier off
      Expected: label preserved (read-only)
      Actual: label cleared
      Fixed myself: yes — commit 1994213
      Logged as: BUG-15

- [x] Add Place: region dropdown missing for region-tier country
      Steps: Add Place → new city → select country with region tier enabled
      Expected: region dropdown appears
      Actual: no dropdown shown; region_id not set
      Fixed myself: yes — commit d704343
      Logged as: BUG-16

#### Notes / Observations
None beyond the above.

---
