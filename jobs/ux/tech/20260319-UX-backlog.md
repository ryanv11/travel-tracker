# UX Improvement Backlog — Travel Tracker
**Date:** 2026-03-19
**Author:** UX (UI/UX Designer)
**Brief:** BRIEF-UX-01
**Status:** Final

---

## Priority Framework

- **P0** — Broken or actively confusing. Fix before any P1 work begins.
- **P1** — Significant quality gap. Fix in the first implementation pass.
- **P2** — Polish and refinement. Second pass after P1 is stable.

Effort: **S** = < 1 hour | **M** = half-day | **L** = 1 day+

---

## P0 — Broken or Actively Confusing

These items undermine core usability and must be resolved first.

---

### P0-01 — Dates rendered as raw ISO strings in TripDetail
**Audit ref:** TD-01
**What:** `TripDetail` renders `{trip.start_date} – {trip.end_date}` directly from the API (format: `YYYY-MM-DD`). Users see machine-readable strings, not human-readable dates.
**Why:** Raw data format displayed as UI copy is a content presentation failure — confusing and unprofessional.
**Where:** `TripDetail.tsx` — date display in trip header
**Effort:** S
**shadcn/ui component:** None (pure logic fix — use shared `formatDate()` util already present in TripCard.tsx)

---

### P0-02 — No keyboard focus styles on any interactive element
**Audit ref:** G-02
**What:** No visible focus ring appears on any button, input, or link anywhere in the app. Keyboard navigation is non-functional.
**Why:** WCAG 2.1 SC 2.4.7 (Level AA) requires a visible focus indicator. This is an accessibility violation.
**Where:** All interactive elements — addressed at design system level via `focus-visible:ring-2 focus-visible:ring-primary` in shadcn Button, Input, Select components.
**Effort:** M (bulk fix — applying at design-system token level during Tailwind migration covers all instances)
**shadcn/ui component:** Button, Input, Select (focus ring applied to all)

---

### P0-03 — No success feedback on any mutation
**Audit ref:** G-05, T-07
**What:** After creating a trip, editing a trip, saving an item, adding a place, or any write operation, the modal silently closes. The user has no confirmation the action succeeded.
**Why:** Feedback on user action is a fundamental interaction design requirement. Absence of feedback leads to repeated submissions, uncertainty, and eroded trust.
**Where:** All mutations across TripForm, ItemForm, Admin tabs. Global — addressed by installing `sonner` and wiring `toast.success()` / `toast.error()` to all mutations.
**Effort:** M
**shadcn/ui component:** `Sonner` (Toast)

---

### P0-04 — "Complete Review & Lock Trip" uses destructive red for a positive action
**Audit ref:** RP-04
**What:** The primary completion action in ReviewPanel is styled `background: '#DC2626'` — the same red as Delete buttons and error states.
**Why:** Red conventionally signals danger/deletion. Using it for a positive completion action creates semantic confusion — users will hesitate or avoid the button. This is the primary action on the most important workflow page in the app.
**Where:** `ReviewPanel.tsx` — "Complete Review & Lock Trip" button
**Effort:** S
**shadcn/ui component:** Button variant `default` (primary teal) with optional `Lock` icon

---

### P0-05 — Carry-forward candidates all pre-selected by default
**Audit ref:** CF-01
**What:** `CarryForwardModal` initialises `selectedIds` with all candidates selected. The user must actively uncheck items they don't want.
**Why:** The correct UX for suggestion flows is opt-in (unselected by default). Pre-selecting all reverses the expected cognitive model — the user came to add specific items, not to reject all items they don't want. With 10+ candidates, this is actively burdensome.
**Where:** `CarryForwardModal.tsx` — `useState<Set<number>>(...)` initialiser
**Effort:** S
**shadcn/ui component:** Checkbox (for redesigned carry-forward list)

---

## P1 — Significant Quality Gap

Fix in the first implementation pass, after P0 items are complete.

---

### P1-01 — Install and configure Tailwind CSS
**What:** Remove all inline `CSSProperties` from the codebase. Replace with Tailwind utility classes. Configure `tailwind.config.ts` with the semantic tokens from the design system spec.
**Why:** The entire design system is built on this foundation. No P1 or P2 component work is meaningful without it.
**Where:** Entire frontend codebase
**Effort:** L (this is the migration, not a single component)
**shadcn/ui component:** N/A (prerequisite)

---

### P1-02 — Install shadcn/ui and configure design tokens
**What:** Install shadcn/ui CLI, configure `components.json`, add semantic colour tokens to `tailwind.config.ts`, set up `cn()` utility, install Sonner.
**Why:** All component work in P1 depends on this.
**Where:** Project root and `tailwind.config.ts`
**Effort:** S
**shadcn/ui component:** Init

---

### P1-03 — Replace LoadingSpinner with Tailwind animate-spin
**What:** Remove the `@keyframes` injection pattern in `LoadingSpinner.tsx`. Replace with `<div className="animate-spin ...">` using Tailwind's built-in animation.
**Why:** Injecting `<style>` tags from a render function is an anti-pattern. Tailwind resolves this structurally.
**Where:** `LoadingSpinner.tsx`
**Effort:** S
**shadcn/ui component:** None (pure Tailwind)

---

### P1-04 — Replace all emoji icons with Lucide React icons
**What:** Replace all emoji (✈️ 🏨 🍽️ 🚗 🎫 📝 ✈️ 🔒 📷 ☁) with Lucide icon components per the icon map in the design system spec.
**Why:** Emoji are not scalable, are inconsistent across platforms, and cannot be styled. They undermine the professional presentation of the app.
**Where:** `ItemCard.tsx`, `ItemForm.tsx`, `ReviewItemRow.tsx`, `CarryForwardModal.tsx`, `App.tsx` (nav), `TripDetail.tsx` (lock banner), `TripCard.tsx` (photo album link)
**Effort:** M
**shadcn/ui component:** Lucide icons (included with shadcn)

---

### P1-05 — Redesign TripCard for higher density
**What:** Reduce card padding from 16px to 12px. Reduce internal gaps. Remove `marginTop` from companions/categories rows. Replace the Edit button with a Lucide `Pencil` icon Button `size="icon"` variant. Reduce list gap from 12px to 8px.
**Why:** The current card is too padded for a data-dense desktop list. A trip list with 20+ entries should not require excessive scrolling.
**Where:** `TripCard.tsx`
**Effort:** M
**shadcn/ui component:** Card, Button (icon variant)

---

### P1-06 — Standardise modal using shadcn/ui Dialog
**What:** Replace all custom `overlayStyle` + `modalStyle` patterns in TripForm, ItemForm, AddPlaceFlow, CarryForwardModal, and ConfirmDialog with the shadcn Dialog component.
**Why:** Five separate modal implementations with slightly different z-indices, widths, and overlay colours. One shared Dialog component resolves all inconsistency.
**Where:** TripForm, ItemForm, AddPlaceFlow, CarryForwardModal, ConfirmDialog
**Effort:** L
**shadcn/ui component:** Dialog

---

### P1-07 — Standardise StatusBadge using shadcn/ui Badge
**What:** Rebuild `StatusBadge` as a variant-mapped shadcn Badge. Update colour map per design system spec (replace current blue primary with teal).
**Why:** Reuse the design system's colour tokens. Remove hardcoded hex values from StatusBadge.
**Where:** `StatusBadge.tsx`
**Effort:** S
**shadcn/ui component:** Badge

---

### P1-08 — Standardise AdminPanel tab bar using shadcn/ui Tabs
**What:** Replace the manual button tab implementation in `AdminPanel.tsx` with shadcn `Tabs` + `TabsList` + `TabsTrigger` + `TabsContent`.
**Why:** The current implementation is a manually recreated ARIA tabs pattern. shadcn/ui Tabs provides correct keyboard navigation (arrow keys), ARIA roles, and consistent styling out of the box.
**Where:** `AdminPanel.tsx`
**Effort:** S
**shadcn/ui component:** Tabs

---

### P1-09 — Consolidate Admin list tabs into shared component
**What:** `CategoryTab`, `ActivityTab`, and `CompanionTab` are three near-identical components. Extract a shared `AdminListTab` component parameterised by entity type.
**Why:** Three instances of the same design pattern maintained separately — any UI change requires three identical edits. This is a maintenance risk.
**Where:** `CategoryTab.tsx`, `ActivityTab.tsx`, `CompanionTab.tsx` → shared `AdminListTab.tsx`
**Effort:** M
**shadcn/ui component:** Button, Input (within shared component)

---

### P1-10 — Fix double-padding on Trips and TripDetail pages
**What:** `TripsPage` applies outer padding then `TripList` applies inner padding — totalling ~48px. Remove the outer page padding from `TripsPage` and `TripDetailPage` and let the child components manage their own padding.
**Why:** The content is narrower than the maxWidth container visually implies, and the top/left margins are double what was intended.
**Where:** `TripsPage.tsx`, `TripDetailPage.tsx`
**Effort:** S
**shadcn/ui component:** None

---

### P1-11 — Fix visual hierarchy of status transition buttons in TripDetail
**What:** Status transition buttons should follow a clear semantic hierarchy: primary action (filled `default`), secondary (outline), destructive/final action (amber `accent` for Lock, not the same as delete).
**Why:** All transition buttons currently look identical, giving no indication of relative importance or consequence.
**Where:** `TripDetail.tsx` — status transition section
**Effort:** S
**shadcn/ui component:** Button (default, outline, accent variants)

---

### P1-12 — Show loading indicator on status transition buttons during mutation
**What:** Add `<Loader2 className="animate-spin" />` to status transition buttons when `isPending` is true.
**Why:** User gets no feedback that a state change is in progress, leading to double-clicks and uncertainty.
**Where:** `TripDetail.tsx`
**Effort:** S
**shadcn/ui component:** Button (with Loader2 icon from Lucide)

---

### P1-13 — Add map shading legend overlay
**What:** A collapsible legend overlay in the bottom-left of the map (non-competing with MapLibre controls which sit bottom-right). Shows each shading state name with its colour swatch. Collapsed by default, expanded on click.
**Why:** Without a legend, the map shading is meaningless to the user unless they have memorised their own colour configuration. This is a data visualisation requirement, not a nice-to-have.
**Where:** `MapView.tsx` — new `MapLegend` child component
**Effort:** M
**shadcn/ui component:** Button (toggle), Tooltip (on each swatch)

---

### P1-14 — Consolidate category tag into shared CategoryChip component
**What:** Extract the category chip (inline block, pill shape, slate background) from `TripCard` and `TripDetail` into a shared `CategoryChip` component.
**Why:** Same design pattern defined twice in two files. Design changes require two edits.
**Where:** `TripCard.tsx`, `TripDetail.tsx` → shared `CategoryChip.tsx`
**Effort:** S
**shadcn/ui component:** Badge (muted variant)

---

### P1-15 — Replace raw country_code with country name in PlaceSection
**What:** `PlaceSection` renders `{place.city.country_code}` — e.g. "AU". This should display the full country name or at minimum a flag emoji alongside the code.
**Why:** "AU" is meaningless to a user scanning their trip places. Country name is available in the data model.
**Where:** `PlaceSection.tsx`
**Effort:** S
**shadcn/ui component:** None

---

### P1-16 — Consistent date formatting across all components
**What:** Extract the `formatDate()` function from `TripCard.tsx` into a shared `src/frontend/utils/formatDate.ts` utility and use it everywhere dates are displayed.
**Why:** TripCard and TripDetail currently display the same date in different formats.
**Where:** `TripCard.tsx` → extract to `utils/formatDate.ts`; apply in `TripDetail.tsx`, `ItemCard.tsx` (hotel dates), `ReviewPanel.tsx`
**Effort:** S
**shadcn/ui component:** None

---

### P1-17 — Fix ShadingTab colour picker to use onBlur/settled event
**What:** Change `ShadingTab` colour input from `onChange` to `onBlur` (or capture value on `pointerup`).
**Why:** `onChange` fires on every drag step of the OS colour picker, generating dozens of PATCH requests per adjustment. This is wasteful and may cause race conditions.
**Where:** `ShadingTab.tsx`
**Effort:** S
**shadcn/ui component:** None

---

### P1-18 — Move ItemForm Status field below type-specific fields
**What:** In `ItemForm`, move the Status `<Select>` to appear after all type-specific fields, immediately before Notes.
**Why:** Status is a secondary attribute. Users enter the primary content (what is the item) before categorising its status.
**Where:** `ItemForm.tsx`
**Effort:** S
**shadcn/ui component:** Select

---

### P1-19 — Add empty state to map page for zero trips
**What:** When the trips list is empty (no trips logged), show an onboarding empty state overlay on the map page with a CTA to create the first trip.
**Why:** Currently the map renders blank with no guidance. New users have no affordance.
**Where:** `MapPage.tsx`
**Effort:** S
**shadcn/ui component:** Button (to navigate to /trips)

---

### P1-20 — Add "No cities found" message to city search in AddPlaceFlow
**What:** When search returns zero results and the query is >= 2 chars, show "No cities found matching '[query]'" before the "+ Add new" row.
**Why:** Without this message, the user cannot tell whether the search ran and found nothing, or whether the search is still loading.
**Where:** `AddPlaceFlow.tsx`
**Effort:** S
**shadcn/ui component:** None

---

## P2 — Polish and Refinement

---

### P2-01 — Apply density improvements to Trips List layout
**What:** Extend the Trips List to use more horizontal space. Consider a split-pane layout (filter sidebar left, card list right) or increase max-width to use the full viewport width on desktop. Reduce page margins.
**Why:** The centred narrow-column layout wastes significant horizontal space on typical desktop displays.
**Where:** `TripsPage.tsx`, `TripList.tsx`
**Effort:** L
**shadcn/ui component:** None

---

### P2-02 — Consolidate filter bar into single row with collapsible overflow
**What:** Combine the two filter rows (search+sort, status+category+activity) into a single horizontal row. Overflow filters collapse behind a "Filters" button with a badge showing how many are active.
**Why:** Two filter rows consume too much vertical real estate above the list content.
**Where:** `TripList.tsx`
**Effort:** M
**shadcn/ui component:** Button, DropdownMenu (for overflow filters)

---

### P2-03 — Style the locked trip banner distinctly
**What:** Give the locked banner a stronger visual treatment — left border in `primary` or `accent` colour, lock icon (Lucide `Lock`), and clear background tint.
**Why:** The current banner is visually indistinguishable from a disabled element. It should clearly communicate "this is intentionally read-only."
**Where:** `TripDetail.tsx` — locked banner div
**Effort:** S
**shadcn/ui component:** Lucide Lock icon

---

### P2-04 — Redesign ItemCard for better data density
**What:** Reduce ItemCard padding. Move edit/delete to a hover-reveal pattern or into a `DropdownMenu`. Show more item detail (e.g. hotel check-in date, flight route) at a glance without requiring the edit modal to open.
**Why:** Currently the card shows icon + label + status badge + optional subtext. More can be shown without visual clutter.
**Where:** `ItemCard.tsx`
**Effort:** M
**shadcn/ui component:** DropdownMenu (for actions), Card

---

### P2-05 — Redesign ItemForm type selection step
**What:** Replace the oversized 3×2 grid with a compact horizontal chip-strip or smaller 2-column grid. Each type tile should be `padding: 10px` max with a 16px icon.
**Why:** Current type selection takes up nearly the full modal height for a simple single-click selection step.
**Where:** `ItemForm.tsx` — type selection grid
**Effort:** S
**shadcn/ui component:** Button (toggle/outline variant for type selection)

---

### P2-06 — Improve the "Add Place" button style
**What:** Replace the dashed-border button with a proper outline Button (ghost or outline variant with `Plus` icon).
**Why:** Dashed border is a drag-and-drop/dropzone affordance, not a click affordance. It sends the wrong interaction signal.
**Where:** `TripDetail.tsx` — Add Place button
**Effort:** S
**shadcn/ui component:** Button (outline + Lucide Plus icon)

---

### P2-07 — Style empty states across PlaceSection and TripList
**What:** Replace plain-text empty states with the shared `EmptyState` component (icon + title + description + optional CTA).
**Why:** Designed empty states communicate intentionality and guide the user to the next action.
**Where:** `PlaceSection.tsx`, `TripList.tsx`, `MapPage.tsx` (zero trips)
**Effort:** M
**shadcn/ui component:** EmptyState (custom, per design system spec)

---

### P2-08 — Add visual differentiation to Admin page
**What:** Apply a subtle background treatment (`bg-subtle`) or a top accent bar to the admin page to communicate "you are in a configuration area."
**Why:** Admin and content pages currently look identical. Users editing global configuration should have a clear visual cue that they're not in the main app flow.
**Where:** `AdminPanel.tsx`
**Effort:** S
**shadcn/ui component:** None (Tailwind only)

---

### P2-09 — Redesign ReviewPanel action bar
**What:** The "Return to Planning" + "Back to Trip" + "Complete Review & Lock Trip" buttons in the review panel should be clearly separated and weighted: destructive actions (if any) on the left, progression actions on the right, lock action as the dominant right-side CTA.
**Why:** The current layout has three buttons competing at the same weight with no clear primary action hierarchy.
**Where:** `ReviewPanel.tsx` — bottom action bar
**Effort:** S
**shadcn/ui component:** Button (outline for secondary, default for primary lock action)

---

### P2-10 — Add RatingStars hover preview state
**What:** When the user hovers over a star in `RatingStars`, fill all stars up to the hovered star in a preview state (lighter colour).
**Why:** Standard affordance for star rating components. Without hover preview, the user cannot tell what clicking a star will do.
**Where:** `RatingStars.tsx`
**Effort:** S
**shadcn/ui component:** Lucide Star icon (replaces ★ character)

---

### P2-11 — Show "Mark all Completed" progress indicator
**What:** Add a progress counter to the "Mark all as Completed" button in ReviewPanel — e.g. "Marking 7 items… (3/7)".
**Why:** Sequential PATCH calls can take several seconds for trips with many items. The user sees a frozen button with no indication of progress.
**Where:** `ReviewPanel.tsx`
**Effort:** M
**shadcn/ui component:** Button (with Loader2), progress tracking in component state

---

### P2-12 — Improve geocoding pending indicator
**What:** Replace the amber pill button with a Tooltip-wrapped `CloudOff` icon badge in the top-right of the nav bar. On hover, show the explanation ("X cities pending geocoding — click to retry").
**Why:** The current amber pill takes significant nav bar space. The geocoding state is background infrastructure, not a primary navigation element — it should be present but unobtrusive.
**Where:** `App.tsx` — geocoding indicator section
**Effort:** S
**shadcn/ui component:** Tooltip, Button (icon variant), Lucide CloudOff / MapPin icon

---

### P2-13 — Admin list rows: separate Rename and Deactivate visually
**What:** Add `gap-4` between the Rename and Deactivate/Delete buttons in admin list rows, or group action buttons with a `Separator`.
**Why:** Two buttons of different consequence (rename vs deactivate) sitting flush together is an accidental-click risk.
**Where:** `CategoryTab.tsx`, `ActivityTab.tsx`, `CompanionTab.tsx`
**Effort:** S
**shadcn/ui component:** Button (in shared AdminListTab)

---

## P0 — Count: 5 items
## P1 — Count: 20 items
## P2 — Count: 13 items
