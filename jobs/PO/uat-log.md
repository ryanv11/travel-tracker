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

### UAT Session — 2026-07-16 (ad hoc)

**Scope:** Ad hoc testing with non-owner user account
**Build:** main @ 89294cd
**Verdict:** FAIL (not yet triaged/fixed)

#### Findings

- [ ] Non-owner user could not add a country to their trip
      Steps: 1. Sign in as a non-owner user account 2. Open/create a trip 3. Attempt to add a country
      Expected: Country can be added, same as owner
      Actual: Add-country action fails for non-owner account
      Screenshot: none
      Fixed myself: no
      Root cause (confirmed): PO retested with Japan (already seeded, exists on owner account) —
      still missing for non-owner, which rules out lazy-seeding. Real cause: `GET /api/admin/countries`
      (the full 250-country reference list used to populate the country picker) sits behind
      `adminRouter.use(requireOwner)` (src/backend/routes/admin.ts:26, comment: "ADL-27/HC-04: All
      admin routes require owner status... Applied at the router level"). `useAdmin.ts:191` is the
      only frontend call site (`apiGet<Country[]>('/api/admin/countries')`) — any non-owner gets a
      403 there and the picker comes up empty regardless of what's seeded. Looks like a regression
      from the NR-14/HC-04 hardening pass: it correctly owner-gated the admin *write* routes but
      swept this read-only reference-data endpoint into the same router-level gate, when every user
      needs to read the country catalog to add a country to their own trip. Matches the
      [[project_shared_trip_model]] direction (owner + participants can edit). Fix shape: split GET
      /api/admin/countries (and likely GET .../regions) out from requireOwner — auth-only is enough
      for reads; keep PATCH/write routes owner-gated. No bug ID assigned yet — pending next-session
      triage; should reference ADL-27/HC-04 when filed.

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
