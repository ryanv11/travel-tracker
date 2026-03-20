TO: FRONTEND
FROM: COO
DATE: 2026-03-21 12:00
RE: Visual delta fixes — 17 items from UX mockup comparison (GitHub #14)

---

## OVERVIEW

UX completed a formal comparison of the delivered UI against the approved Option B mockup.
17 discrepancies confirmed and specced. All fixes are frontend-only — no API or schema changes.

Full UX delta doc (read this first): `jobs/ux/tech/20260321-UX-delivered-vs-mockup-delta.md`

Work through the items by file to minimise context switching. Suggested order below.

DELTA-07 (tab strip) is explicitly OUT OF SCOPE — deferred, do not implement.

---

## BRANCHING

```bash
git checkout main && git pull
git checkout -b fix/visual-delta
```

PR when done:
```bash
gh pr create --title "fix: UI visual delta — 17 mockup discrepancies (#14)" \
  --body "Closes #14\nBRD §5.1 TR-11"
```

---

## FILE-BY-FILE WORK ORDER

### 1. `src/frontend/index.css` or global config
No changes expected here — Tailwind token substitutions go in component files directly.

---

### 2. `src/frontend/App.tsx` — DELTA-17

Nav bar fixes:
- Replace `✈️` emoji with a teal square tile: `<span className="inline-flex items-center justify-center w-6 h-6 bg-teal-600 rounded text-white text-xs font-bold mr-2">T</span>` (or any appropriate letter/symbol — the structural requirement is a teal square, not an emoji)
- Add `text-teal-600 font-bold` to the brand name span
- Add `shadow-sm` to the `<nav>` element
- Change active nav link from `text-blue-600 bg-blue-50` → `text-teal-700 bg-teal-50`

---

### 3. `src/frontend/components/shared/StatusBadge.tsx` — DELTA-02, DELTA-03

- `active` badge: change from `bg-green-100 text-green-800` → `bg-amber-100 text-amber-800`
- `review_pending` badge:
  - Label: change from `'Review Pending'` → `'Review'`
  - Color: change from `bg-orange-100 text-orange-800` → `bg-amber-100 text-amber-600`

---

### 4. `src/frontend/components/TripList/TripsLayout.tsx` — DELTA-01 (partial), DELTA-10, DELTA-11, DELTA-12

- **DELTA-10:** Change left panel heading from `"Trips"` → `"My Trips"`
- **DELTA-11:** Change left panel width from `w-[360px]` → `w-[320px]`
- **DELTA-12:** Change trip count badge from `bg-gray-100 text-gray-600` → `bg-gray-200 text-gray-500`
- **DELTA-01 tokens in this file:**
  - `bg-blue-600` (+ New button) → `bg-teal-600`
  - `hover:bg-blue-700` → `hover:bg-teal-700`
  - `focus:ring-blue-500` (search field) → `focus:ring-teal-500`
  - Active filter chip: `bg-blue-600 text-white border-blue-600` → `bg-teal-600 text-white border-teal-600`
  - Map filter badge: `bg-blue-50 border-blue-200 text-blue-700` → `bg-teal-50 border-teal-200 text-teal-700`

---

### 5. `src/frontend/components/TripList/TripCard.tsx` — DELTA-01 (partial), DELTA-13, DELTA-14, DELTA-15, DELTA-16

- **DELTA-01:** Selected card border: `border-blue-500 ring-blue-500` → `border-teal-500 ring-teal-500`
- **DELTA-13:** Category badge color: `bg-gray-100 text-gray-600` → `bg-violet-100 text-violet-800`
- **DELTA-14:** Remove the companions display block (`With: Sophie, James` text, approx lines 103–108)
- **DELTA-15:** Remove the inline Edit button from the card (approx lines 71–80). Retain the `onEdit` prop in the component API — do not remove the prop, only remove the button rendering.
- **DELTA-16:** Remove the photo album link/ref display (approx lines 121–133)

---

### 6. `src/frontend/components/TripDetail/TripDetail.tsx` — DELTA-01 (partial), DELTA-04, DELTA-05, DELTA-06, DELTA-13

**DELTA-04 — Header element order:**
- Move `<StatusBadge>` out of the title/left group into the right-side actions div
- Reorder the right-side actions div to: `[StatusBadge]` → `[Edit button]` → `[Photos button]`
- Title `<h1>` should be alone on the left

**DELTA-05 — Meta row layout:**
- Collapse the three stacked metadata blocks (date range, companions, categories) into one inline flex row
- Structure: `<div className="flex items-center flex-wrap gap-2 mt-1">`
- Date range: `<span className="text-xs text-slate-500">{formattedDateRange}</span>`
- Separator: `<span className="text-slate-300 text-xs">|</span>` (only when next section non-empty)
- Companions: plain comma-separated text, `text-xs text-slate-500` — **no avatar circles, no "With" label**
- Separator `|` before categories if companions present
- Category chips: `bg-violet-100 text-violet-800 px-2 py-0.5 rounded-full text-xs font-medium`
- Activity chips: same violet style
- Remove the circular avatar initials (`w-7 h-7 rounded-full bg-blue-100 text-blue-700`) entirely

**DELTA-06 — Status bar:**
- **Position:** Move status bar so it renders ABOVE the scrollable content area, not as a bottom sticky footer
- Layout order within the right panel `flex-col h-full`: `[header zone] → [status bar] → [scrollable content flex-1 overflow-y-auto]`
- **Background:** Change from `bg-white border-t` → `bg-gray-100 border-b border-gray-200`
- **CTA button color:** Change from `bg-blue-600 hover:bg-blue-700` → `bg-emerald-600 hover:bg-emerald-700 text-white`
- **"Next:" hint text:** Add after CTA button per status:
  - planning → active: `"Next: active → review → lock"`
  - active → review_pending: `"Next: post-trip review → lock"`
  - review_pending → locked: `"Next: lock trip"`
  - locked: no hint
  - Style: `<span className="text-xs text-gray-500 ml-2">{hintText}</span>`

**DELTA-01 tokens in this file:**
- Status CTA button: `bg-blue-600 hover:bg-blue-700` — handled by DELTA-06 above (→ emerald-600)
- Companion avatar circles: being removed by DELTA-05
- Any remaining blue tokens: audit and substitute with teal equivalents per DELTA-01 substitution table in the UX delta doc

**DELTA-13:**
- Category badges in the meta row: already covered in DELTA-05 above (violet chips)
- Activities in detail: `bg-purple-100 text-purple-700` → `bg-violet-100 text-violet-800`

---

### 7. `src/frontend/components/TripDetail/PlaceSection.tsx` — DELTA-01 (partial), DELTA-08, DELTA-09

**DELTA-08 — City box shading:**
- Add `shadow-sm` to the outer wrapper div (`className="border border-gray-200 rounded-lg overflow-hidden mb-4"` → add `shadow-sm`)
- Change place header background from `bg-gray-50` → `bg-gray-100`

**DELTA-09 — Subtitle layout:**
- Combine country and date range onto one subtitle line with `·` separator
- Format: `{country_code} · {dateRange.start} – {dateRange.end}` on a single `<p className="mt-0.5 text-xs text-gray-500">`
- Remove the separate date range `<p>` that currently sits below

**DELTA-01 tokens:** `bg-blue-600 hover:bg-blue-700` on "+ Add Item" button → `bg-teal-600 hover:bg-teal-700`

---

### 8. Empty state — DELTA-18

Locate where the empty state is rendered (currently in `App.tsx` or `TripsLayout.tsx`) and replace:

```tsx
<div className="flex flex-col items-center justify-center h-full text-gray-400 p-12 text-center">
  <div className="w-14 h-14 rounded-full bg-gray-200 flex items-center justify-center mb-4">
    <span className="text-2xl text-gray-300">🗺</span>
  </div>
  <p className="text-base font-semibold text-gray-500 mb-1.5">Select a trip</p>
  <p className="text-sm text-gray-400 max-w-[260px] leading-relaxed">
    Choose a trip from the list to view its details, places, and itinerary.
  </p>
</div>
```

---

## FINAL AUDIT

After all changes: do a project-wide search for any remaining `blue-` Tailwind tokens in the frontend source files. Replace any found with teal equivalents per the substitution table in the UX delta doc. The goal is zero blue tokens in the frontend styling.

---

## CHECKS BEFORE COMMITTING

```bash
npm run test:frontend   # must pass
npm run type:check      # must pass
```

---

## DELIVERY REQUIREMENTS

- All 17 DELTA items implemented (DELTA-07 excluded — deferred)
- Zero remaining `blue-` tokens in frontend components
- Tests pass, type check clean
- PR open against `fix/visual-delta` referencing #14

## COMPLETION REPORT

File to: `/workspace/jobs/COO/inbox/YYYYMMDD_HHMM-FRONTEND-visual-delta.md`

Include:
- Confirmation of all 17 items
- Any flags (ambiguous specs, items deferred for follow-up)
- Test pass count
- PR link + commit hash
