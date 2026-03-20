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
      Steps: 1. Have an existing trip with a Dublin restaurant marked "next time" (trip in planning)
             2. Create a new trip → Add Place → select Dublin, Ireland
             3. Expected: carry-forward modal appears with the restaurant as a candidate
      Expected: CarryForwardModal shows the "next time" restaurant
      Actual: Modal never appeared
      Screenshot: none
      Fixed myself: no
      Logged as: BUG-17
      Triaged: SPEC CHANGE — carry-forward query filters to review_pending/locked trips only.
      Source trip was in planning. Decision: next_time is explicit user intent; trip
      status should be irrelevant. Fix: remove status restriction from carry-forward query.
      Severity: MAJOR

- [ ] New Dublin trip not immediately visible when clicking Ireland on the map
      Steps: 1. Create a new trip with Dublin, Ireland as a place
             2. Immediately click Ireland on the map → trips list should filter to Irish trips
             3. Trip missing from results; works after a delay
      Expected: new trip appears immediately in filtered results
      Actual: trip missing until React Query cache refreshes
      Screenshot: none
      Fixed myself: no
      Logged as: BUG-18
      Triaged: MINOR — missing invalidateQueries(['trips']) on useCreateTrip mutation.
      Shading confirmed working for planning trips (by design). Cache-only fix.
      Severity: MINOR

- [x] Trip list sort — Newest/Oldest not reflecting expectations
      Triaged: NOT A BUG — sort is correctly driving off trip start_date (user-entered).
      Label clarity issue only. Closed as bug. Added to UX P2 backlog: relabel
      "Newest First/Oldest First" → "Newest trip date / Oldest trip date".
      Logged as: BUG-19 CLOSED

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
