# PO UAT Archive — Travel Tracker

Resolved findings moved here from uat-log.md. Reference only — these are closed.

---

## Session — 2026-03-19 (retroactive — pre-log)

**Scope:** General usage — region tier admin, Add Place flow
**Build:** ~1994213 / d704343
**Verdict:** PARTIAL

- [x] BUG-15 — Region tier toggle cleared label on disable
      Steps: Admin panel → country with regions → toggle region tier off
      Expected: label preserved (read-only)
      Actual: label cleared
      Fixed myself: yes — commit 1994213

- [x] BUG-16 — Add Place: region dropdown missing for region-tier country
      Steps: Add Place → new city → select country with region tier enabled
      Expected: region dropdown appears
      Actual: no dropdown shown; region_id not set
      Fixed myself: yes — commit d704343

---

## Session — 2026-03-19 (live testing — Dublin trip)

- [x] BUG-19 — Trip list sort — Newest/Oldest not reflecting expectations
      Triaged: NOT A BUG — sort is correctly driving off trip start_date (user-entered).
      Label clarity issue only. Closed as bug. Added to UX P2 backlog: relabel
      "Newest First/Oldest First" → "Newest trip date / Oldest trip date".

---
