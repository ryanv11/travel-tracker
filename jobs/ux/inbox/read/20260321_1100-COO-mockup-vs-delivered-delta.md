TO: UX
FROM: COO
DATE: 2026-03-21 11:00
RE: Formal mockup vs delivered UI comparison — produce delta doc

---

## CONTEXT

PO has completed a UAT session (2026-03-20, verdict: PARTIAL) on the Tailwind/UI migration build (77a415b). Multiple visual and layout discrepancies have been identified between the approved Option B mockup and what was delivered.

Your job is to do a formal side-by-side comparison and produce a delta document that Frontend can implement against. Be specific — every discrepancy needs enough detail that Frontend can fix it without coming back to you.

---

## KNOWN DISCREPANCIES (PO-reported, need your analysis)

### Trip detail header (right panel)

**PO expected (from mockup):** Trip status > Edit > Photos — controls on the right side of the header
**PO observed (delivered):** Status on the left next to the trip title, then Photos > Edit on the right

Confirm: What is the correct header layout per the approved mockup? Specify the exact element order, positioning, and styling for: title, status badge, Edit button, Photos button.

### Trip detail meta row

**PO expected (from mockup):** Date range | Companions | Tags — all on one inline row below the title
**PO observed (delivered):** Three separate lines — date range, then companions, then tags

Confirm: Inline row layout. Specify separator character/style, alignment, and any overflow handling.

### Status bar

**PO expected (from mockup):** Persistent bar at bottom of right panel showing current status + next status CTA
**PO observed:** Either not present or not visually apparent

Confirm: Is the status bar present in the delivered code but incorrectly styled, or absent? Specify the correct design — position, height, content layout (status label + CTA button), styling per each trip status state (Planning/Active/Review/Locked).

### City box shading

**PO expected (from mockup):** Visual shading/background styling on city/place section cards within trip detail
**PO observed:** No shading

Confirm: What shading was in the mockup? Background color, border, shadow? Specify.

### Icon and color theme

**PO observed:** Icons are blue — mockup showed a green theme

Confirm: Which specific UI elements should be green rather than blue? Specify exact Tailwind color tokens (e.g. `green-600`, `emerald-500`) or hex values. Be precise — "green theme" is not actionable for Frontend.

---

## ADDITIONAL SWEEP

Do not limit yourself to the PO-reported items. Review the full delivered UI against the mockup and flag any other discrepancies you find. The goal is one comprehensive delta so Frontend can fix everything in a single pass.

Reference files:
- Approved Option B mockup: check your previous deliverables in `jobs/ux/tech/` or `jobs/ux/outbox/`
- Delta doc from last session: `jobs/ux/tech/20260320-UX-mockup-delta.md`
- Delivered codebase: `src/frontend/` — read components to understand what was actually built

---

## OUTPUT FORMAT

Produce a new file: `jobs/ux/tech/20260321-UX-delivered-vs-mockup-delta.md`

Structure:
```
## [Component/Section]
**Mockup spec:** [what it should be]
**Delivered:** [what exists]
**Fix required:** [specific, actionable instruction for Frontend]
**Tailwind tokens / colors:** [where relevant]
```

Then file a completion report to `jobs/COO/inbox/` per standard format.

---

## SCOPE NOTE

Do NOT spec F-02 tab functionality (what Itinerary/Review pages contain) — just the tab UI shell and navigation. Content of those panels is a separate spec to follow once scope is confirmed with COO.
