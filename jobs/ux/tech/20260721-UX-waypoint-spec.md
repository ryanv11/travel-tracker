# Waypoint Redesign — Implementation Spec

**Date:** 2026-07-21
**Author:** UX
**Status:** BRD-gated (v3.4). Phase 1 (WP-02, GitHub #197) implemented and merged (PR
#198), PO UAT PASS 2026-07-21 (`jobs/PO/uat-log.md`) — **WP-02 CLOSED**. Phase 2
(WP-03/WP-04) — **all 13 conflicts (C1–C13) plus the adjacent flagged items (Confirmed/
Completed hue, font loading, TR-12) resolved by COO/PO 2026-07-21. This spec is stamped
and Phase 2 is ready for Frontend dispatch.** Resolutions are recorded in two places: this
document (inline stamps on each row/section below — the design-detail record) and BRD
v3.4 §5.16 WP-01/WP-03/WP-04/WP-05 plus the TR-12 annotation (the requirement-level
record COO maintains — see the BRD changelog v3.3/v3.4 entries). One item — the mobile
detail-view Edit/Photos entry point — was explicitly punted to UX for a final call after
two rounds of COO/PO discussion produced conflicting answers; resolved below (see the
Mobile "Detail view" section) as a **compact icon pair**, which supersedes the
overflow-menu wording currently sitting in BRD WP-04 — COO to reconcile that wording in
its own pass, not this document's job.
**Source:** claude.ai Design project "Travel tracker design review"
(`8cc525c1-b678-4976-a207-57f7f489844b`), read directly from verbatim copies at
`jobs/ux/tech/waypoint-mockups/{design-system,trips-desktop,trips-mobile}.dc.html`
(see `jobs/ux/tech/20260721-UX-waypoint-spec-blocked.md` for the access-blocker history —
resolved 2026-07-21, COO supplied verbatim file copies after the `DesignSync` tool proved
unavailable to a dispatched agent).

**Scope confirmed by Ryan:** Map and Admin screens are NOT redesigned in this drop — the
mockups' nav/tab bar shows them only as existing destinations. This spec covers only the
design-system foundation (Phase 1) and the Trips screen, desktop + mobile (Phase 2).

**How to read this document:** Every color/size value below is copied verbatim from the
`.dc.html` source (oklch values, px sizes, font weights) — I did not round or approximate
anything. Where the mockup was ambiguous, silent, or in conflict with a real BRD requirement
or shipped bug fix, I said so explicitly in a **CONFLICT** or **GAP** callout rather than
picking a resolution myself at the time of first authoring (2026-07-21, morning pass). Those
callouts have since been adjudicated by COO/PO the same day (2026-07-21, afternoon session)
and are now stamped inline throughout — see the CONFLICTS & OPEN QUESTIONS table below for
the resolution record. One item (mobile Edit/Photos entry point) was explicitly punted back
to UX for the final call; that call is made and recorded in the Mobile "Detail view"
section.

---

## CONFLICTS & OPEN QUESTIONS — read this section first

**All 13 resolved by COO/PO 2026-07-21.** This index is retained as the design-detail
record of each call (the requirement-level record lives in BRD v3.4 §5.16). Full detail on
each is in the relevant Phase 2 subsection below; this is the index.

| # | Issue | Why it matters | My recommendation | Resolution |
|---|---|---|---|---|
| C1 | **Product name.** Both mockups render the nav brand as "Waypoint" (Newsreader wordmark + pin icon), not "Travel Tracker." | Renaming the product is a real decision, not a visual reskin detail — it touches the nav, page `<title>`, possibly docs/README/support materials. | Confirm with Ryan explicitly: is "Waypoint" the new product name, or just this design file's working title? Don't let Frontend infer a rename from a mockup file name. | **Confirmed 2026-07-21 (COO/PO).** Real rename to "Waypoint" — nav brand, page `<title>`, in-app copy. Repo name/README/other project-identity artifacts outside the running app are explicitly out of scope. Recorded in BRD v3.4 §5.16 WP-01. |
| C2 | **Status stepper has no "Unlock" state.** The mockup's 4-step stepper (Plan→Active→Review→Locked) only defines a forward-progress CTA (`NEXT_STEP` has no `locked` entry) — no unlock affordance is shown anywhere in either mockup. | The current app has a real, tested Unlock button + confirm dialog (`TripDetail.tsx` lines 196-204) that returns a locked trip to `review_pending`. Dropping it would be a functional regression, not a skin change. | Preserve the existing Unlock button/flow; add it to the stepper card as new chrome the mockup doesn't show (e.g. an outlined "Unlock" button where the CTA slot would otherwise be empty). Flag to Frontend explicitly — don't let "the mockup doesn't show it" become "so we removed it." | **Confirmed 2026-07-21 (COO/PO).** Preserve the existing Unlock button/flow as new stepper-card chrome, per recommendation. BRD v3.4 §5.16 WP-03. |
| C3 | **BUG-36 trip-level items section is absent from both mockups.** Neither `trips-desktop.dc.html` nor `trips-mobile.dc.html` render anything resembling `TripItemsSection` (the "Trip Items" / "+ Add Trip Item" block for flights/car rentals not tied to a place). | This is a tested, BRD-linked (IT-01) feature that shipped 2026-07-20 (PR #171). The mockup may simply predate it, or Ryan may not have thought to include it in the design pass — either way it can't silently vanish. | Preserve `TripItemsSection` as its own reskinned block, positioned above Places exactly as today. Not a mockup omission Frontend should read as "remove this." | **Confirmed 2026-07-21 (COO/PO).** Preserve `TripItemsSection` exactly, reskinned with place-section card styling, per recommendation. BRD v3.4 §5.16 WP-03. |
| C4 | **Place section's Edit-dates / Set-dates and Remove buttons are absent from both mockups.** Only "+ Add Item" appears in the place-header actions. | `UX-02` (per-place date editing) and `BUG-32` (remove-place, with cascade-reassign-to-trip-level and confirm dialog) are both shipped, tested features. | Preserve both buttons in the reskinned place header, alongside "+ Add Item." Recommend: `[Set/Edit dates] [+ Add Item] [Remove]` reading left-to-right by frequency of use, but this ordering is a minor call Frontend can make — the presence of both is not optional. | **Confirmed 2026-07-21 (COO/PO).** Preserve both buttons alongside "+ Add Item," per recommendation; exact ordering left to Frontend's judgment. BRD v3.4 §5.16 WP-03. |
| C5 | **Item card in the mockup drops rating stars, the "carried forward" tag, and per-type subtext richness** (hotel check-in/out, flight number, cuisine type, notes excerpt) down to one generic `sub` line. | Ratings and the carried-forward indicator are real, shipped features (`RatingStars`, BUG-03 carry-forward). | Preserve today's full per-type subtext + rating stars + carried-forward tag inside the restyled item card shell (new icon tile, new badge colors) — the mockup's single-`sub`-string model is a demo simplification, not a spec to copy literally for this part. | **Confirmed 2026-07-21 (COO/PO).** Preserve all of it inside the restyled item card shell, per recommendation. BRD v3.4 §5.16 WP-03. |
| C6 | **Neither mockup shows the "no trips at all yet" first-run empty state** — only a "no trips match the filter" state (`hasTrips` toggles on the same filtered-list length in both cases). Current app already distinguishes the two ("No trips yet. Create one with '+ New'." vs "No trips match the current filters."). | Losing the first-run message would be a real UX regression for new users (a core "feedback" principle — don't let a blank list read as broken). | Preserve today's two-message distinction; apply the new icon/typography treatment to both. | **Confirmed 2026-07-21 (COO/PO).** Preserve today's two-message distinction under the new visual treatment, per recommendation. BRD v3.4 §5.16 WP-03. |
| C7 | **FEAT-BD (bulk multi-select delete), NTH-01 (undo bar), NTH-03 (per-status filter counts), TR-09 sort control, and the map-filter badge have no mockup equivalent.** | All are real, shipped, tested functionality with no visual counterpart in either mockup — the mockups are demo-scoped to core browsing/detail viewing, not every toolbar feature. | Preserve all of them, reskinned with the new tokens (chip/button/badge styling from Phase 1). Do not remove on the theory that "the mockup doesn't have it." | **Confirmed 2026-07-21 (COO/PO).** Preserve all of it, reskinned with new tokens, per recommendation. BRD v3.4 §5.16 WP-03. |
| C8 | **Item icon rendering technique.** The mockup's own reference implementation uses `dangerouslySetInnerHTML` to inject icon SVG strings (`trips-desktop.dc.html` line 157, `trips-mobile.dc.html` line 145). | `_shared/frameworks.txt` rule 22 (binding project framework rule, restated in `CLAUDE.md`'s security spec references) makes `dangerouslySetInnerHTML` a **blocking defect** in this codebase, no exceptions without COO sign-off. | Frontend must implement icons as literal inline SVG JSX (`<svg>...</svg>` written directly in the component, or small dedicated icon components) using the exact path data below — same pixel output, zero banned API. This is not optional; flagging so it isn't missed as "just copy the mockup's approach." | **Confirmed 2026-07-21 (COO/PO).** Hard rule stands, no exception — inline SVG JSX only. |
| C9 | **Mobile bottom tab bar only appears in the list view, not the detail view** — the mockup's tab-bar markup lives inside the "LIST VIEW" wrapper only; the "DETAIL VIEW" wrapper has no tab bar, using the back-button bar instead. | Could be deliberate (more vertical space for content on a small screen once you've drilled in) or an oversight in the demo file. | My read: deliberate and good mobile practice — recommend keeping the tab bar hidden in detail view, back-button as primary nav there. Confirm with Ryan since it's a real navigation-model decision, not styling. | **Confirmed 2026-07-21 (COO/PO).** Deliberate — tab bar stays list-view-only, back button is primary nav in detail view, per recommendation. BRD v3.4 §5.16 WP-04. |
| C10 | **Left panel width mismatch.** Mockup desktop left panel is `340px`; current app is `320px` (already reduced once from an original `360px` per the March DELTA-11 fix). | Small but exact — my role doesn't treat pixel drift as "character." | Match the mockup: `340px`. Flagging since it's a second width change to the same panel in under a year — worth a beat of "is this the value we're keeping" before Frontend implements it a third time. | **Confirmed 2026-07-21 (COO/PO).** Match the mockup at **340px** — current shipped code is still 320px; this is a real value change to apply during Phase 2, not yet applied anywhere. |
| C11 | **Category-badge color (hue 255, indigo-violet) is used in both Trips mockups but is not declared anywhere in `design-system.dc.html`'s own "Status & category badges" section** (which only shows PLANNING/ACTIVE/REVIEW/LOCKED/CONFIRMED/CANCELLED/CONSIDER). | The system doc is the nominal source of truth for tokens, but it's incomplete relative to what the Trips mockups actually use. | Treat the category-chip color as a real token anyway (documented below, sourced from application, not the system doc) — Frontend needs it regardless of which file "should" have declared it. Flag to whoever owns the Design System file that it's missing this swatch. | **Confirmed 2026-07-21 (COO/PO).** Real token despite the system doc's incomplete swatch set, per recommendation. Already correctly implemented in `src/frontend/design/badges.ts` from Phase 1. |
| C12 | **Newsreader heading weight: system doc says 500, both Trips mockups apply 600 everywhere a heading actually renders.** | Minor but exact per my role's standard — I don't let a font-weight drift pass as "close enough." | Use **600** — it's what's consistently applied in every real instance across both Trips mockups; the system doc's swatch appears to be the one that's slightly stale, not the applied files. | **Confirmed 2026-07-21 (COO/PO).** **600**, per recommendation. Already correctly implemented in Phase 1's `theme-waypoint.css`. |
| C13 | **Button/input radius: system doc says "10px radius throughout," both Trips mockups apply 9px on nearly every button/input** (a couple of mobile-only elements use 10-11px). | Same category as C12 — a declared token that doesn't quite match its own application. | Use **10px** as the canonical Phase 1 token (per the system doc's explicit statement) and treat the mockups' 9px as sub-pixel drift from hand-authored inline styles, not an intentional second value. Frontend should standardize on one number; flagging so nobody "matches the mockup exactly" into a 9px/10px inconsistency across components. | **Confirmed 2026-07-21 (COO/PO).** **10px**, per recommendation. Already correctly implemented in Phase 1's `theme-waypoint.css` as `--radius-wp: 10px`. |

All 13 resolutions above are COO/PO-confirmed 2026-07-21 and require no further adjudication.
Phase 2 is unblocked for Frontend dispatch on this basis.

---

# PHASE 1 — Design System Foundation ("Waypoint" tokens)

## Scope and non-goals

Phase 1 delivers the primitives — color tokens, type tokens, the icon set, badge/status
color mapping, and button/input styling — as reusable building blocks. **It does not reskin
any existing screen.** Two exceptions, explained below.

**Why gate the reskin to Phase 2:** applying only some of these tokens now (e.g. new button
radius but old teal color, or new icons but old badge colors) would leave the app in a
half-migrated state that's less consistent than either the old or new system alone —
directly against the "consistency, not character" principle this role holds. Establishing
the primitives in isolation, verifying them, then reskinning Trips as a complete pass in
Phase 2 avoids that.

**Exceptions I recommend applying immediately, in Phase 1:**
1. **Icon replacement (emoji → SVG).** Swapping `TYPE_ICONS`'s emoji strings (`🍽️🏨✈️🚗🎫📝`)
   and the standalone `📷`/`🔒`/`🗺` emoji for the new SVG icon components is low-risk: icons
   are visually self-contained (no interaction with the surrounding color system), emoji
   rendering is already inconsistent across platforms (a real, if minor, existing defect),
   and doing it once now avoids touching `ItemCard.tsx` again in Phase 2. This does
   constitute a small visible change to the *current* Trips screen ahead of the full reskin
   — acceptable because it's a strict improvement in isolation, not a partial/inconsistent
   application of the new palette.
2. **Nothing else.** Colors, type, badges, and button/input styling all stay defined-but-unused
   until Phase 2, specifically because half-applying any of them creates exactly the
   inconsistency this role doesn't tolerate.

## 1. Color

Source: `design-system.dc.html` "Color" section. All values are oklch, copied verbatim.

### Neutrals (warm paper)

| Token | Value | Usage |
|---|---|---|
| `bg-page` | `oklch(97.5% 0.006 80)` | App/page background |
| `bg-surface` | `oklch(99% 0.002 80)` | Card, panel, input backgrounds |
| `border` | `oklch(89% 0.012 80)` | Default border color |
| `ink-muted` | `oklch(48% 0.015 75)` | Secondary text, meta labels, muted body |
| `ink` | `oklch(22% 0.02 75)` | Primary text |

Additional neutral shades observed in application (not in the system doc's 5-swatch grid,
but used repeatedly across both Trips mockups — include as tokens, not one-offs):

| Token | Value | Usage |
|---|---|---|
| `bg-subtle` | `oklch(96% 0.008 80)` | Place-section header band, nav link hover, place/name chip background |
| `bg-chip` | `oklch(93% 0.006 80)` | Trip-count badge, "Locked"/"Consider" badge background |
| `ink-faint` | `oklch(65% 0.01 75)` | Lightest muted text (empty-state descriptions, disabled-ish labels) |
| `ink-soft` | `oklch(40% 0.015 75)` | Empty-state heading color (between `ink` and `ink-muted`) |
| `border-soft` | `oklch(92% 0.008 80)` | Item-card border (lighter than the standard `border` token) |

### Brand

| Token | Value | Usage |
|---|---|---|
| `primary` (pine) | `oklch(38% 0.07 195)` | Primary buttons, active nav, primary icons, focus outline, stepper "done"/"current" dot |
| `primary-hover` | `oklch(33% 0.07 195)` | Hover state for pine-background buttons (observed via `style-hover` in both Trips mockups) |
| `primary-subtle` | `oklch(94% 0.025 195)` | Planning badge bg, active-nav-link bg, item-icon tile bg, mobile next-step callout bg |
| `primary-subtle-text` | `oklch(30% 0.07 195)` | Planning badge text, active-nav-link text, mobile next-step callout text |
| `accent` (plum) | `oklch(45% 0.1 325)` | Declared in the system doc; not directly applied anywhere in the two Trips mockups I read — treat as reserved for future use, not required by this spec |

### Status / category hues

All status and category colors share the same lightness/chroma recipe per hue —
confirmed against both the system doc's palette and every application in the Trips mockups:
**background ≈ 93-95% L / 0.006-0.03 C, text ≈ 30-42% L / 0.07-0.13 C, same hue for both.**

| Hue (°) | Background | Text | Used for |
|---|---|---|---|
| 195 (pine) | `oklch(94% 0.025 195)` | `oklch(30% 0.07 195)` | Trip status: **Planning** |
| 75 (amber/gold) | `oklch(94% 0.03 75)` | `oklch(40% 0.12 75)` | Trip status: **Active** |
| 325 (magenta/plum) | `oklch(94% 0.025 325)` | `oklch(38% 0.1 325)` | Trip status: **Review** |
| 80 (neutral, ~0 chroma) | `oklch(93% 0.006 80)` | `oklch(40% 0.01 80)` | Trip status: **Locked**; item status: **Consider** |
| 150 (green) | `oklch(94% 0.025 150)` | `oklch(38% 0.1 150)` | Item status: **Confirmed** — see note below (Completed now a separate hue, not shared) |
| 220 (blue) | `oklch(94% 0.025 220)` | `oklch(36% 0.1 220)` | Item status: **Completed** (label "DONE") — new hue, resolved 2026-07-21, see note below |
| 25 (red) | `oklch(95% 0.03 25)` | `oklch(42% 0.13 25)` | Item status: **Cancelled** |
| 255 (indigo-violet) | `oklch(94% 0.03 255)` | `oklch(42% 0.1 255)` | Category / activity chips (see C11 — not in the system doc's own swatch set, sourced from application in both Trips mockups) |

**Resolution — Confirmed vs Completed, two hues, not one (Confirmed 2026-07-21, COO/PO):**
the mockup's `STATUS_META` gives `confirmed` and `completed` the *identical* bg/fg pair
(hue 150), differing only in label text ("CONFIRMED" vs "DONE"). Do **not** collapse them —
keep two visually distinct hues, overriding the mockup's literal table. Reason given: the
mockup didn't know about "completed" as a distinct state when it was authored, so its
single-hue table under-specifies the real status model. Concrete tokens: **Confirmed stays
at hue 150 (green)** — `oklch(94% 0.025 150)` / `oklch(38% 0.1 150)`, unchanged from the
table above. **Completed moves to hue 220 (blue)** — `oklch(94% 0.025 220)` /
`oklch(36% 0.1 220)`, following the same background/text lightness-chroma recipe as every
other status hue in this table. I picked blue deliberately: it reads as "informational/
done" against green's "on track," it sits in open hue space between pine (195) and
indigo-violet (255) with reasonable separation from both (25°/35°), and it doesn't collide
with any hue already in use (25/75/80/150/195/255/325). This is my concrete pick, not a
placeholder — Frontend/Architect can substitute a different hue only if there's a specific
reason to; the requirement that binds is "two distinct hues," not this exact one. Note the
shipped Phase 1 code (`src/frontend/design/badges.ts`) currently still collapses both to
hue 150 per the mockup's literal content — that's a bug relative to this decision, to be
fixed as part of the Phase 2 Frontend brief. BRD v3.4 §5.16 WP-02 already records "two
hues preserved" at the requirement level; this is the concrete token-level fulfillment of
that call.

**Badge shape note:** status pills use `border-radius: 20px` (full pill) at
`padding: 5px 12px` (system doc) / `5px 13px` (desktop trip-detail) / `4-5px 10-12px`
(various card contexts) — treat as "pill, ~5px vertical / ~10-13px horizontal padding,"
not one fixed pixel pair; Frontend has latitude within that range for context-appropriate
sizing. Category/place chips on trip **list cards** are NOT pills — `border-radius: 7px`
(desktop) / `8px` (mobile), `padding: 3-4px 9-10px`. The same category color (hue 255)
therefore appears in two shapes depending on context: pill in the trip-detail header meta
row, rounded-rect chip on trip list cards. This is deliberate per the mockup (confirmed by
consistent application in both files), not an inconsistency to normalize away.

### Explicit rejection of the current palette

Compare to today: teal-600 primary almost everywhere, amber for Active/Review (already
close in spirit to the new hue-75/325 mapping — see below), violet-800 for categories
(close to but not identical to the new hue-255), emerald for positive CTAs, red for
destructive. The design-system file's own caption states the intent plainly: *"Compare to
today's app: teal-600 on most screens, blue-600 in Admin, plus indigo/green/emerald/yellow
scattered across statuses with no shared logic."* Phase 1's job is to replace all of this
with the single hue-family system above — Phase 2 is where it actually gets applied to
Trips.

## 2. Typography

Font families: **Newsreader** (serif, display/editorial) and **Manrope** (sans, UI/body).
Loaded in the mockup via a Google Fonts `<link>`:
`family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600&family=Manrope:wght@400;500;600;700;800`.

**Font-loading — Confirmed 2026-07-21 (COO/PO):** self-host via `@fontsource/newsreader` +
`@fontsource/manrope`, not a live Google Fonts CDN `<link>`, per my original recommendation.
Final. Already implemented this way in Phase 1.

### Type scale

| Context | Font | Weight | Size | Notes |
|---|---|---|---|---|
| Page title (desktop trip-detail `<h1>`) | Newsreader | 600 | 34px | `letter-spacing:-0.3px` |
| Page title (mobile trip-detail `<h1>`) | Newsreader | 600 | 26px | `letter-spacing:-0.3px` |
| Page title (design-system doc's own generic swatch) | Newsreader | 500 | 40px | See C12 — applied instances use 600, not 500; use 600 |
| Panel header ("My Trips", desktop) | Newsreader | 600 | 22px | |
| Panel header ("My Trips", mobile) | Newsreader | 600 | 28px | |
| Trip/place name (desktop trip list card) | Newsreader | 600 | 16.5px | |
| Trip/place name (mobile trip list card) | Newsreader | 600 | 18px | |
| Place/city name (desktop place-section header) | Newsreader | 600 | 17px | |
| Place/city name (mobile place-section header) | Newsreader | 600 | 16px | |
| Section label / UI header | Manrope | 700 | 15px | System doc generic swatch — no direct 1:1 instance found in the two Trips mockups; treat as the token for future section headers |
| Body / control text | Manrope | 500 | 14px | Buttons, general UI text |
| Meta / label text (dates, tags uppercase) | Manrope | 600 | 12px | System doc sample shown uppercase with letter-spacing; applied instances (dates, subtitles) are sentence-case at 11.5-13px — treat 12px/600 as the token for genuinely label-like uppercase text (e.g. status badges use 700/11-11.5px with letter-spacing, see badge spec below — badges are their own case, not this generic token) |
| Status/category badge text | Manrope | 700 | 11-11.5px | `letter-spacing: 0.2-0.3px`, uppercase (values render as `PLANNING`, `ACTIVE`, etc. — always-caps content, not a text-transform applied to mixed-case labels) |
| Item label (item card) | Manrope | 700 | 13.5px | |
| Meta text / dates / subtitles (general) | Manrope | 400/500 | 11.5-13px | `ink-muted` color |

**Newsreader weight — use 600, not 500** for every heading-level instance per C12.
**Line-height:** not explicitly declared anywhere in the source files (all headings render
on effectively single lines in the mockup's fixed-width demo data) — recommend `1.1-1.2` for
Newsreader display sizes (≥22px) and `1.4-1.5` for Manrope body/meta text, standard practice
for a serif-display/sans-body pairing; the mockup gives no explicit value to carry over,
so this is my recommendation, not a lifted token.

## 3. Icons

Eight glyphs, one consistent filled-SVG style, single fill color (`primary` pine,
`oklch(38% 0.07 195)`) in every instance across both the system doc and the two Trips
mockups. These replace the emoji set named in the brief: 🍽️🏨✈️🚗🎫📝🔒📷.

| Icon (system-doc label) | Replaces (current emoji) | Maps to `item_type` | Exact SVG path (viewBox 0 0 24 24) |
|---|---|---|---|
| hotel | 🏨 | `hotel` | `M4 20V9.5L12 4l8 5.5V20a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1Z` |
| flight | ✈️ | `flight` | `M21 15.5v-2l-8-5V4.5a1.5 1.5 0 0 0-3 0V8.5l-8 5v2l8-2.5V17l-2.5 2v1.5l3.5-1 3.5 1V19L13 17v-4.5l8 2.5Z` |
| dining | 🍽️ | `restaurant` | `M6 3v7a2 2 0 0 0 2 2v9h1.5v-9a2 2 0 0 0 2-2V3H10v6H9V3H8v6H7V3H6Zm9.5 0c-1.4 0-2.5 2.1-2.5 5s1 5 2 5.6V21H16.5V3.05c-.35-.03-.68-.05-1-.05Z` |
| car | 🚗 | `car_rental` | `M5 16.5V11l1.8-4.5A2 2 0 0 1 8.7 5h6.6a2 2 0 0 1 1.9 1.5L19 11v5.5a1 1 0 0 1-1 1H17a1 1 0 0 1-1-1V16H8v.5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1ZM7.5 14a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4Zm9 0a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4ZM7 10.5h10L15.7 7H8.3L7 10.5Z` |
| experience | 🎫 | `experience` | `M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v1.5a1.5 1.5 0 0 0 0 3V14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1.5a1.5 1.5 0 0 0 0-3V8Zm9-1v2h1.5V7H12Zm0 4v2h1.5v-2H12Zm0 4v2h1.5v-2H12Z` |
| note | 📝 | `note` | `M5 3.5h14a1 1 0 0 1 1 1V20a1 1 0 0 1-1.45.9L12 18.4l-6.55 2.5A1 1 0 0 1 4 20V4.5a1 1 0 0 1 1-1ZM7 8h10V6.5H7V8Zm0 3.5h10V10H7v1.5Z` |
| locked | 🔒 | *(trip status only, not an item type)* | `M7 10V7a5 5 0 0 1 10 0v3h.5A1.5 1.5 0 0 1 19 11.5v8A1.5 1.5 0 0 1 17.5 21h-11A1.5 1.5 0 0 1 5 19.5v-8A1.5 1.5 0 0 1 6.5 10H7Zm1.5 0h7V7a3.5 3.5 0 0 0-7 0v3Z` |
| photos | 📷 | *(Photos button, not an item type)* | `M9.5 5h5l.9 1.5H18a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 18 18.5H6A1.5 1.5 0 0 1 4.5 17V8A1.5 1.5 0 0 1 6 6.5h2.6L9.5 5Zm2.5 4.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z` (verified identical path used live in `trips-desktop.dc.html`'s Photos button) |

**No new npm dependency required.** These are hand-authored inline SVG path data in the
mockup, not output from a named icon library (I checked — they don't match Lucide,
Heroicons, or Feather's equivalent glyphs). Frontend should implement each as a small inline
SVG React component (or a single `<Icon name="hotel" />` component switching on path data)
using the exact path strings above — **not** via `dangerouslySetInnerHTML` (see C8; that's
how the mockup's own mini-framework renders them, and it's a blocking defect in this
codebase per `_shared/frameworks.txt` rule 22).

**Sizing:** not one fixed size — observed at 22px (system-doc swatch tile), 16px (desktop
item-icon tile content), 15px (mobile item-icon tile content), 14px (desktop Photos-button
icon). Recommend a small size scale: `16px` for inline-with-text/tile contexts, `20-22px`
for standalone/showcase contexts, consistent with what's actually used rather than one
magic number.

**Two additional icons used only in the Trips mockups** (not in `design-system.dc.html`'s
icon section — same "system doc is incomplete" situation as the category-badge color, C11):

| Icon | Used for | Exact SVG (viewBox 0 0 24 24) |
|---|---|---|
| location pin (brand mark / Map tab / empty-state icon) | Nav brand, mobile Map tab, both desktop/mobile "select a trip" and "no trips" empty states | `<path d="M12 2C8.5 2 6 5 6 8.5C6 13 12 21 12 21C12 21 18 13 18 8.5C18 5 15.5 2 12 2Z" fill="[pine or muted border color, context-dependent]"/><circle cx="12" cy="8.5" r="2.6" fill="[bg color, creates a cutout]"/>` — the circle uses the surrounding background color to punch a hole, not a stroke |
| trips/suitcase (mobile Trips tab) | Mobile bottom tab bar | `<rect x="5" y="8" width="14" height="10.5" rx="2" fill="currentColor"/><rect x="9" y="5" width="6" height="3.5" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/>` |
| admin (mobile Admin tab) | Mobile bottom tab bar | `<rect x="4" y="5.2" width="16" height="2" rx="1" fill="currentColor" opacity="0.3"/><circle cx="15" cy="6.2" r="2.6" fill="currentColor"/><rect x="4" y="11" width="16" height="2" rx="1" fill="currentColor" opacity="0.3"/><circle cx="9" cy="12" r="2.6" fill="currentColor"/><rect x="4" y="16.8" width="16" height="2" rx="1" fill="currentColor" opacity="0.3"/><circle cx="17" cy="17.8" r="2.6" fill="currentColor"/>` (a 3-row settings-slider glyph) |
| back chevron (mobile detail-view back button) | "‹ Trips" back navigation | `<path d="M15 5l-7 7 7 7" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` |
| edit/pencil (mobile detail-view compact icon pair) | Mobile trip-detail header, next to Photos icon — see "Mobile Edit/Photos entry point" resolution in the Detail view section below | `<path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25ZM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83Z" fill="currentColor"/>` — a new glyph, not present in either source mockup (neither shows a mobile Edit affordance at all); a standard filled pencil, authored to match this set's single-fill-color, geometric-path convention. Color: `ink` `oklch(22% 0.02 75)` to match the existing secondary-button text color used for "Edit" on desktop |

## 4. Status & category badges — component spec

One `Badge` (or continued `StatusBadge`) component, parameterized by hue per the table in
§1. Shape/typography: `font: 700 11-11.5px Manrope; letter-spacing: 0.2-0.3px;
border-radius: 20px (pill) or 7-8px (list-card chip context); padding: 5px 12-13px (pill) or
3-4px 9-10px (chip)`. Label text is always upper-case content (not lower/mixed-case text
with `text-transform: uppercase` — the mockup's data literally contains `'PLANNING'`,
`'ACTIVE'`, etc.).

## 5. Buttons & inputs

Radius: **10px** throughout (see C13 re: the mockups' 9px application drift — standardize
on the system doc's explicit 10px).

| Variant | Background | Text | Border | Notes |
|---|---|---|---|---|
| Primary (e.g. "New Trip", "+ Add Item", next-step CTA) | `primary` `oklch(38% 0.07 195)` | white | none | Hover: `oklch(33% 0.07 195)` (darker pine) |
| Secondary / default (e.g. "Edit", "Photos") | `bg-surface` `oklch(99% 0.002 80)` | `ink` `oklch(22% 0.02 75)` | 1px `border` `oklch(89% 0.012 80)` | Hover: `bg-subtle` `oklch(96% 0.008 80)` |
| Destructive (e.g. "Delete") | `oklch(97% 0.02 25)` | `oklch(42% 0.13 25)` | 1px `oklch(89% 0.03 25)` | From `design-system.dc.html`'s own button row; not directly observed in the two Trips mockups (no destructive button appears in either) — carry over from the system doc as the destructive-button token for Phase 2's Remove/Delete buttons |
| Ghost / dashed (e.g. "+ Add Place") | transparent | `ink-muted` | 2px dashed `oklch(85% 0.012 80)` | Hover: border `oklch(70% 0.012 80)`, text `oklch(38% 0.015 75)` |
| Input (search, text) | `bg-surface` (desktop) or `oklch(97.5% 0.006 80)` (some contexts) | `ink` | 1px `border` | Focus: `outline: 2px solid primary; outline-offset: 1px` (confirmed in `trips-desktop.dc.html`'s global `<style>` block — this replaces the current app's Tailwind `focus:ring-2 focus:ring-teal-500` pattern) |

Font for all button/input text: Manrope, weight 600-700 (buttons) / 400-500 (input values),
13-14.5px depending on context (desktop buttons trend 12.5-14px, mobile slightly larger at
15px for the search input).

## 6. Where these tokens live in this repo

Confirmed via reading `package.json` and `src/frontend/index.css`: this repo is on
**Tailwind v4 with CSS-first config** (`@import "tailwindcss"` in `index.css`, no
`tailwind.config.js`/`.ts` file exists). Recommend adding an `@theme` block (either inline in
`index.css` or a new imported file, e.g. `theme-waypoint.css`) defining these as Tailwind v4
theme variables — e.g. `--color-pine: oklch(38% 0.07 195);`, `--color-paper: oklch(97.5%
0.006 80);`, `--font-display: 'Newsreader', serif;`, `--font-ui: 'Manrope', sans-serif;` —
which Tailwind v4 automatically turns into utility classes (`bg-pine`, `font-display`, etc.)
without any JS config. This is idiomatic for how this repo is already set up; no new
tooling/dependency needed for the token layer itself.

**Do not touch the global `body` font-family in Phase 1** (currently a system-font stack in
`index.css`'s `@layer base`) — that's a Phase-2-scale visual change. Expose the new font
tokens as opt-in utilities only.

## Phase 1 success criteria

Phase 1 is done when all of the following are independently verifiable, without any change
to how the current Trips screen (or any other screen) looks *except* the icon-replacement
exception above:

1. Every color in the §1 tables exists as a Tailwind v4 `@theme` token (or CSS custom
   property) with a stable, documented name — zero raw oklch/hex literals introduced
   elsewhere in the codebase for these values.
2. Newsreader and Manrope are loading (self-hosted or CDN, per the COO's call on the
   font-loading question above) and available via named font-family utilities, without the
   global body font changing.
3. All 11 icons in §3 (8 item/status icons + 4 nav/chrome icons) exist as inline SVG React
   components using the exact path data above — verified by grep: zero remaining instances
   of the replaced emoji (🍽️🏨✈️🚗🎫📝🔒📷🗺) in `src/frontend/`, and zero new
   `dangerouslySetInnerHTML` usages introduced to render them.
4. The status/category badge hue table in §4 exists as reusable badge-variant logic (a
   component prop or a lookup map), not yet wired into `StatusBadge.tsx`'s actual
   `COLOR_CLASSES` (that wiring is Phase 2 — Phase 1 proves the primitive works in isolation,
   e.g. a Storybook-less "kitchen sink" test page or a unit test asserting the color map, per
   whatever this repo's existing test conventions support).
5. Button/input variants in §5 exist as either a reusable `Button`/`Input` component or a
   documented Tailwind class recipe, not yet swapped into existing call sites (again, Phase 2).
6. `npm run test:frontend`, `npm run type:check:all`, and `npm run check` all pass with the
   new tokens/components present but unused by existing screens.
7. A UAT pass (per `CLAUDE.md`'s mandatory phase-completion gate) confirms the Trips screen
   is pixel-identical to its pre-Phase-1 state except for the icon swap, which is visually
   confirmed correct against the §3 table.

---

# PHASE 2 — Trips Screen Reskin

Full breakdown of both mockups, cross-referenced against the current implementation. Where
a mockup element has no current equivalent, or a current element has no mockup equivalent, I
say so explicitly (see the Conflicts table above for the ones needing a decision).

## Desktop layout (`trips-desktop.dc.html`)

### Structure

```
[Nav bar — 100%, ~48px tall equivalent]
  [Waypoint brand: pin icon + "Waypoint" wordmark]  [Map] [Trips (active)] [Admin]
[Two-panel body — flex row, fills remaining height]
  [Left panel — 340px fixed]        [Right panel — flex:1]
    Header: "My Trips (N)" + New Trip button
    Search input
    Status filter chips (All/Planning/Active/Review/Locked)
    Trip list (scrollable)
      Trip cards
    (empty state when filtered to 0)
                                      Trip detail (scrollable), or "select a trip" empty state
```

### Nav bar

Background `bg-surface oklch(99% 0.002 80)`, `border-bottom: 1px solid border`. Brand: pin
icon (22px) + "Waypoint" in Newsreader 600/17px. Nav links (Map/Trips/Admin): Manrope
600/13px, `ink-muted` color, `8px 14px` padding, `8px` radius; **active** link gets
`primary-subtle` background + `primary-subtle-text` (700 weight) color; hover (inactive)
gets `bg-subtle` background.

**Cross-reference:** current `App.tsx` nav already has this general shape (brand mark +
Map/Trips/Admin links, active-state pill). Changes needed: brand mark (square "T" tile →
pin icon + serif wordmark — see C1 on the name itself), color tokens (teal → pine per §1),
and preserve the existing owner-gated Admin link visibility (`RequireOwner`/`BUG-26` logic)
— the mockup's static nav always shows all three links because its demo has no auth model;
Frontend must keep the current conditional hide, not remove it because the mockup shows
Admin unconditionally.

### Left panel

Width **340px** (see C10), `bg-surface`, `border-right: 1px solid border`.

- **Header row:** "My Trips" (Newsreader 600/22px) + trip-count pill (`bg-chip`/`ink-muted`,
  Manrope 700/11px, pill) inline via `display:flex;align-items:baseline` — matches current
  DP-02 implementation's existing embedded-badge structure, just new tokens.
- **"+ New Trip" button:** primary variant per §5, `8px 14px` padding, `9px` radius (see
  C13), Manrope 700/12.5px.
- **Search input:** placeholder **"Search trips or places…"** (note: differs from current
  app's "Search trips…" — the longer placeholder correctly reflects that search already
  matches place names too, per TR-13/`filterAndSortTrips` — this is a copy fix to make,
  bringing the placeholder in line with existing, already-correct search behavior, not a
  new feature).
- **Status filter chips:** All/Planning/Active/Review/Locked, pill-shaped, Manrope
  700/11.5px, active = `primary` bg + white text, inactive = `bg-subtle` + `ink-muted`.
  Current app additionally shows a per-status count (`(12)`) next to each chip label
  (NTH-03) — mockup chips show label only, no count. **Preserve the count** (C7) — it's
  real, useful, shipped functionality with no mockup counterpart, not something to drop.
- **Trip cards:** `14px` padding, `14px` radius, `bg-surface`, border `1px solid border`
  (unselected) or `1.5px solid primary` + subtle pine box-shadow (selected — no `ring`
  utility, a real box-shadow: `0 2px 10px oklch(38% 0.07 195 / 0.12)`). Hover (unselected):
  box-shadow lift `0 4px 14px oklch(22% 0.02 75 / 0.14)` + border darkens to
  `oklch(78% 0.012 80)`. Content: trip name (Newsreader 600/16.5px, truncates with ellipsis),
  date range (`ink-muted`, 12px) below; status badge (pill, per §4) top-right; place-name
  chips (rounded-rect, `bg-subtle`/`ink-muted`-ish `oklch(40% 0.015 75)`, 7px radius, 11px
  text) and category chips (rounded-rect, hue-255, same 7px radius) in a wrapped row below.
- **Empty state (filtered to zero):** centered pin icon (34px, `border`-color muted) + "No
  trips match" (Newsreader 16px, `ink-soft`) + "Try a different search term or filter."
  (12.5px, `ink-faint`). **Also needs the true first-run zero-trips message** (C6) — mockup
  doesn't model it, current app's copy ("No trips yet. Create one with '+ New'.") should be
  preserved under the same new visual treatment.

**Not in the mockup, must be preserved (C7):** bulk multi-select ("Select" toggle,
checkboxes, bulk action bar, 5-second undo), the undo bar itself, the sort control
(Newest/Oldest/Name A-Z/Z-A), and the map-filter badge (Country:/Region:/City: with a clear
affordance, set when arriving from a Map-screen click-through). Reskin all of these with
the new tokens (chip/button styles per §4/§5) — none of them are being removed.

### Right panel — trip detail

`bg-page`, content max-width `820px` centered, `36px 40px 60px` padding.

- **Header:** Title (Newsreader 600/34px) top-left; meta row below it: date range (13px
  `ink-muted`) `·` companions (only if present, same style) `·` category/tag pills (hue-255,
  **pill**-shaped here, unlike the rounded-rect version on list cards — see §1 badge-shape
  note). Right-aligned: status badge (pill) + "Edit" button (secondary variant) + "Photos"
  button (secondary variant, camera icon + "Photos" label — icon replaces the current 📷
  emoji per Phase 1's icon set).

  **Cross-reference:** current `TripDetail.tsx` already has the right structural order
  (StatusBadge → Edit → Photos, per the already-fixed DELTA-04) and already collapses the
  meta row into one inline line (per already-fixed DELTA-05) — good news, most of the
  *structure* work here is already done; this is primarily a token/typography reskin, not a
  layout rebuild. Two real differences: (a) current app uses `|` pipe separators throughout;
  mockup uses a single `·` between dates and companions only, then tags render as separate
  pills with no leading separator — adopt the mockup's punctuation exactly; (b) preserve the
  existing `isLocked` conditional hiding of the Edit button — the mockup's static single
  example doesn't model a locked trip's header, don't lose that conditional.

- **Status stepper** (replaces today's flat status bar — this is new structural UI, not a
  reskin of existing markup): a card (`bg-surface`, `border`, `14px` radius, `18px 22px`
  padding) containing:
  - A horizontal row of 4 step-dots (Plan/Active/Review/Locked), each `22px` circle +
    `10.5px` Manrope 700 label below. Connected by `36px`-wide, `2px`-tall lines between
    dots.
  - Dot/line state logic (exact, from the mockup's `buildSteps()`): for step index `i` and
    current status index `idx` — **done** (`i < idx`): pine-filled dot showing `✓`, pine
    label text, pine connecting line to its right. **current** (`i === idx`): **same pine
    fill as done**, but showing its ordinal number (`i+1`) instead of a checkmark — current
    and done are visually identical in color, distinguished only by dot content. **upcoming**
    (`i > idx`): neutral `bg-chip`-colored dot, `ink-faint` label, gray connecting line.
    This is an exact behavior to replicate precisely — a Frontend implementation that gives
    "current" a distinct highlight color (e.g. a ring, a different hue) would be a defect
    against this spec, however reasonable it might look; the mockup deliberately doesn't
    do that.
  - Right-aligned (same card, no separate box on desktop): hint text (`ink-muted`, 11.5px,
    right-aligned, `max-width:150px`) + primary CTA button (per §5) with the next-step
    label. Both only render when a next step exists (`NEXT_STEP` has no `locked` entry —
    see **C2**, must add an Unlock affordance here since the mockup provides none).
  - **BRD cross-check (TR-12) — Confirmed 2026-07-21 (PO):** "persistent status bar showing
    current status + primary next action, always visible regardless of scroll" — the
    stepper satisfies this structurally (same position between header and scrollable
    content, still shows current status and next action) but is a materially richer widget
    than a "bar." PO confirmed this is an acceptable, arguably better, fulfillment of TR-12's
    original intent, not unreviewed scope creep. Recorded in BRD v3.4 §5.16, TR-12 row
    annotation (v3.3).

- **Trip-level items section (BUG-36/IT-01):** **not in either mockup at all** (C3) —
  preserve `TripItemsSection` exactly as today, reskinned with the new place-section card
  styling below (it already mirrors that pattern in the current code).

- **Place sections:** card (`bg-surface`, `border`, `14px` radius, overflow hidden). Header
  band `bg-subtle`, `16px 18px` padding: city name (Newsreader 600/17px) + subtitle
  `{country} · {dateRange}` (12px, `ink-muted`) on the left; **"+ Add Item"** button
  (primary, small: `7px 14px` padding, 11.5px text) top-right. **Missing from the mockup,
  must preserve (C4):** the "Set dates"/"Edit dates" button (UX-02) and the "Remove" button
  (BUG-32, with its confirm dialog and items-reassign-to-trip-level cascade message) — both
  currently sit in this same header-actions area and must stay, just restyled.

  Item list below (`14px 18px` padding, `10px` gap): each item is a row —
  `32px` square icon tile (`8px` radius, `primary-subtle` background, icon centered, 16px)
  + label (Manrope 700/13.5px) + status badge (pill, per §4) + optional one-line `sub` text
  (12px `ink-muted`). Row background `bg-page`, border `border-soft`, `11px` radius.

  **Must preserve, mockup simplifies away (C5):** rating stars (restaurant/hotel/experience
  items), the "carried forward" tag, and full per-type subtext (hotel check-in/out dates,
  flight number + airline + date, cuisine type, notes excerpt up to 100 chars) — the
  mockup's single generic `sub` string is a demo simplification; the real item card keeps
  all of today's per-type richness inside the new visual shell (new icon tile, new badge
  colors, new card radius/border).

- **"+ Add Place"** button: full-width, dashed ghost variant per §5, `16px` padding, `14px`
  radius.

### Empty state (no trip selected)

Centered pin icon (48px, `border`-color muted) + "Select a trip" (Newsreader 18px,
`ink-soft`) + "Choose a trip from the list to see its places and itinerary." (13px,
`max-width: 240px`). Maps directly onto the current `App.tsx` empty state (already has the
icon+heading+description structure) — token/copy update only. Minor copy difference
(current: "view its details, places, and itinerary" vs mockup: "see its places and
itinerary") — adopt the mockup's wording since Frontend should follow the spec verbatim for
new copy.

## Mobile layout (`trips-mobile.dc.html`)

Modeled at a 390×844 frame (iPhone-class viewport), single scrollable column, no persistent
two-panel — **list view** and **detail view** are two absolutely-positioned, full-bleed
panels that cross-fade/slide between each other; nothing about this in the current codebase
exists yet (there's no mobile-specific Trips layout today at all — this is genuinely new
responsive work, not a reskin of an existing mobile view).

**New constraint (2026-07-21, COO/PO): no horizontal scrolling anywhere on the mobile Trips
screen, with exactly one documented exception.** The status filter chip row is the only
element permitted `overflow-x: auto` — already specified below, because 5 status chips
genuinely can't fit one mobile-width line. Everything else must wrap or truncate, never
require a horizontal swipe/scroll:
- **Trip cards** — name truncates with ellipsis (already specified above in the desktop
  section and inherited here); date range, status badge, and the place-name/category chip
  row all wrap onto additional lines as needed, they do not scroll.
- **Place-name and category chip rows** (trip cards, place-section headers) — wrap to
  multiple lines when they exceed the card width; do not lay out as a horizontally
  scrolling strip.
- **Item rows** (item cards inside place sections and `TripItemsSection`) — label and sub
  text wrap or truncate within the row's fixed width; the row itself never becomes wider
  than the viewport or scrolls sideways.
- **Any other row/list content** introduced by this reskin (meta row tags, stepper labels,
  etc.) follows the same rule by default unless a future spec update adds another named
  exception the way the status-chip row is named here.

This is a real, verifiable constraint, not a style preference — see Phase 2 success
criteria below for its Definition-of-Done form.

### List view

- Header: "My Trips (N)" (Newsreader 600/28px) + a small circular **"+"** FAB-style button
  (36×36px, `11px` radius, primary bg, white `+`, 20px line-height) — replaces the desktop's
  labeled "+ New Trip" button with an icon-only equivalent, appropriate for the narrower
  viewport.
- Search input: placeholder **"Search trips…"** (shorter than desktop's — mobile mockup
  doesn't mention "or places" in the placeholder despite using the identical search-filter
  logic; minor copy inconsistency between the two mockups, not necessarily a conflict —
  recommend using the desktop's fuller "Search trips or places…" on mobile too for
  consistency, since the underlying behavior is identical).
- Status filter chips: same as desktop, horizontally scrollable (`overflow-x:auto`) rather
  than wrapping, since mobile width can't fit all 5 chips without scrolling.
- Trip cards: same content model as desktop (name, dates, status badge, place/category
  chips) at slightly larger type (18px name vs 16.5px desktop) and `16px` padding/`16px`
  radius (vs desktop's 14px/14px) — a deliberate, not accidental, size bump for touch
  targets.
- **Bottom tab bar** (Map/Trips/Admin): `10px 0 26px` padding (the extra bottom padding
  accounts for the iOS home-indicator safe area), `border-top: 1px solid border`,
  `bg-surface`. Each tab: icon (21px) + label (10.5px Manrope, 600 inactive/700 active)
  stacked vertically. Active (Trips): `primary` color on both icon and label. Inactive:
  `ink-faint oklch(65% 0.01 75)`.

  **This tab bar exists only in the list view** (C9) — the detail view has no bottom tab
  bar in the mockup, using a top back-button instead. **Confirmed 2026-07-21 (COO/PO):**
  deliberate, keep as-is — see C9 resolution in the index above.

### Detail view

- **Back bar:** `‹ Trips` (chevron icon + "Trips" text, Manrope 600/15px, `primary` color),
  `6px 16px 10px` padding, no border/background — sits above the content, replaces the
  desktop's Edit/Photos-button-adjacent navigation model entirely on mobile (there's no
  visible Edit/Photos button in the mobile detail mockup at all — **only the back button,
  title, status badge, and stepper are shown**; Edit and Photos are conspicuously absent).

  **Resolved 2026-07-21 — Mobile Edit/Photos entry point: compact icon pair, not an
  overflow menu (my call, as UX).** Two options were on the table: (a) an overflow ("⋯")
  menu exposing both actions — the COO/PO's initial call, recorded in BRD v3.3/v3.4 §5.16
  WP-04 — or (b) a compact icon-only Edit/Photos pair directly in the header, next to the
  back button — the PO's answer in a later round of the same conversation, who then
  explicitly deferred the final call to UX, flagging extensibility (room for more actions
  later) as the one thing worth weighing. My decision: **compact icon pair.** Reasoning —
  overflow menus earn their keep at 3+ actions; hiding just two frequent, primary actions
  behind an extra tap works against affordance and discoverability for no real benefit at
  today's scope. It also keeps mobile behavior-consistent with desktop, where Edit and
  Photos are already always visible, not tucked away — this is a density change (icon-only
  vs. icon+label), not a new interaction pattern. Extensibility isn't foreclosed: if a
  third action is added later, converting this pair to an overflow menu at that point is a
  small, well-justified change, not a redesign. This supersedes the overflow-menu wording
  in BRD WP-04 — COO to reconcile in a separate BRD pass, not this document's job.

  **Spec:** two icon-only buttons in the header row, right of the title/status-badge row,
  left of or level with the back bar per Frontend's layout judgment — Edit (new pencil
  glyph, §3) and Photos (existing camera glyph, §3), each a `36×36px` tap target, `10px`
  radius (§5), secondary-button chrome (`bg-surface`, 1px `border`, hover `bg-subtle`), icon
  centered at `18-20px`, color `ink`. Preserve the existing `isLocked` conditional hiding of
  Edit, same rule as the desktop header (see the Right panel "Header" cross-reference above)
  — Photos stays visible regardless of lock state, matching desktop.
- Title + status badge: same content as desktop, smaller type (26px vs 34px), badge to the
  right of the title on the same row (not below it).
- Meta row: same `·`-separated dates/companions/tags pattern as desktop.
- **Status stepper:** same dot/line logic as desktop, smaller (18px dots vs 22px, 20px
  connecting lines vs 36px). **Different CTA presentation from desktop:** on mobile, the
  next-step hint + button live in their own **separate highlighted callout box**
  (`primary-subtle` background, `14px` radius, `14px 16px` padding) below the stepper card —
  not inline within the same card as desktop. This is a deliberate per-breakpoint difference,
  not something to reconcile into "identical minus width" — implement both exactly as shown.
- Place sections: same structure as desktop, `16px` radius (vs 14px desktop), slightly
  smaller type throughout (city name 16px vs 17px, item label same 13.5px).

### Slide/cross-fade transition

Both list and detail views are absolutely positioned (`inset:0`) within the same relative
container, fading and sliding simultaneously:
- **List view**, when a trip is selected: `transform: translateX(-30%); opacity: 0;
  pointer-events: none;`
- **Detail view**, when a trip is selected: `transform: translateX(0); opacity: 1;`
  (from a resting `translateX(30%); opacity: 0; pointer-events: none;` when nothing is
  selected)
- Both: `transition: all 0.25s ease;`

This is a "drill-in" pattern (list recedes left + fades, detail arrives from the right +
fades), not a true edge-to-edge push/pull — implement with exactly these transform/opacity
values and duration, not a generic "slide" guess.

## Cross-reference summary: BRD & bug-fix conflict check

| Item | BRD/tracker ref | Mockup shows it? | Verdict |
|---|---|---|---|
| Two-panel desktop layout | TR-11 | Yes, matches | Reskin only |
| Persistent status bar → stepper | TR-12 | Yes, richer widget | **Resolved** — PO confirmed 2026-07-21 the stepper is an acceptable, arguably better, fulfillment of TR-12's intent. BRD v3.4 §5.16 TR-12 note. |
| Search matches trip + place names | TR-13 | Yes, matches (`filterAndSortTrips` already implements this) | Already aligned — copy-only change (placeholder text) |
| Trip count badge | DP-02 | Yes, matches | Reskin only |
| Place section: city/country/date-range | DP-04 | Yes, matches | Reskin only |
| Place chronological ordering | DP-05 | Not visually distinguishable from insertion order in a static mockup (all example data is pre-sorted) | No conflict — behavior unaffected by reskin |
| First place inherits trip dates | DP-06 | Not shown (all example places have explicit dates) — **and this requirement is tracker-status "pending," not yet built** | **Resolved (WP-05)** — Phase 2 reskins the display of dates that exist; it does not (and per BRD-DP06's own tracker entry, currently cannot) address the underlying "first place inherits trip dates" gap. This PR must not be treated as closing that gap. BRD v3.4 §5.16 WP-05. |
| Photos entry point | PH-03 | Yes (desktop); **absent in mobile detail view** | **Resolved** — compact icon-only Edit/Photos pair added to mobile detail header (UX call, 2026-07-21 — see the Mobile "Detail view" section). |
| Trip-level items (flights/cars) | IT-01 / BUG-36 | **No** | **Resolved (C3)** — preserve |
| Remove place | BUG-32 | **No** | **Resolved (C4)** — preserve |
| Per-place date editing | UX-02 | **No** | **Resolved (C4)** — preserve |
| Map standout icon | BUG-34 | N/A — that fix lives in the Map screen, out of scope here | No action needed |
| Ratings, carried-forward tag | (shipped features, `ItemCard.tsx`) | **No** (mockup's item card is simplified) | **Resolved (C5)** — preserve |
| Bulk delete, undo, sort, map-filter badge | FEAT-BD, NTH-01, NTH-03, TR-09, map filters | **No** | **Resolved (C7)** — preserve |
| First-run empty state (vs filtered-empty) | (existing UX, no formal BRD ID) | **No** — mockup only shows filtered-empty | **Resolved (C6)** — preserve |
| Unlock affordance | (existing UX, no formal BRD ID — inverse of TR-12's forward progression) | **No** | **Resolved (C2)** — preserve |
| Mobile detail Edit/Photos entry point | (new — no prior BRD ID; now BRD v3.4 §5.16 WP-04) | **No** — mobile mockup shows no Edit/Photos affordance at all | **Resolved** — compact icon pair (UX call, 2026-07-21). See Mobile "Detail view" section. |
| Mobile no-horizontal-scroll | (new — no prior BRD ID) | N/A — static mockup, scroll behavior not testable from a `.dc.html` snapshot | **Resolved** — new constraint, COO/PO 2026-07-21. Status filter chip row is the sole `overflow-x:auto` exception; everything else wraps/truncates. See Mobile layout section. |

## Phase 2 success criteria

Phase 2 is done when:

1. Desktop and mobile Trips screens visually match this spec's layout/token/state
   descriptions, verified by side-by-side comparison against the two `.dc.html` mockups for
   every state enumerated above (empty list, filtered-empty, selected/unselected card,
   locked/unlocked detail, each of the 4 stepper states, search, each status filter chip).
2. Every item in the "Cross-reference summary" table above has its recorded resolution
   honored in the implementation (not a silent drop) — all C1-C13 decisions plus the
   adjacent flagged items (Confirmed/Completed hue, font loading, TR-12, mobile Edit/Photos,
   mobile no-horizontal-scroll) are captured in this document and in the BRD (v3.4 §5.16)
   per `CLAUDE.md`'s document-lifecycle rule. This gate is now satisfied at the spec level —
   what remains is implementation fidelity, verified by side-by-side comparison and UAT.
3. All currently-shipped Trips-screen functionality with no mockup counterpart (bulk delete,
   undo, sort, map-filter badge, trip-level items, remove-place, per-place date editing,
   ratings, carried-forward tag, Unlock) is present and working in the reskinned UI — a
   Playwright/E2E pass covering these flows (not just visual/unit tests) is part of this
   phase's Definition of Done, since these are exactly the flows a reskin-from-static-mockup
   is most likely to accidentally regress.
4. The mobile Trips view (list ↔ detail slide, bottom tab bar) exists and works at a
   real mobile viewport width — this is net-new responsive surface, not present in the
   current app at all, so its own test coverage (manual or E2E, per whatever this repo's
   mobile-testing conventions turn out to be — flagging that `project_playwright_panel_scoping.md`
   per project memory notes this as known scoping debt) is required, not assumed free from
   the desktop pass.
5. No `dangerouslySetInnerHTML` was introduced anywhere in the implementation (C8).
6. **No horizontal scrolling exists anywhere on the mobile Trips screen except the status
   filter chip row.** Verified at the 390px reference viewport (and at minimum one narrower
   real-device width, e.g. 360px) across every mobile state in criterion 1: trip cards,
   place-name/category chip rows, and item rows all wrap or truncate under real data
   (long trip names, many categories, long item labels) rather than forcing a sideways
   scroll — a data condition the static mockup's fixed example strings don't exercise, so
   this must be checked against real/varied data, not just the mockup's own content.
7. `npm run test:frontend`, `npm run test:backend` (unaffected, but must still pass),
   `npm run type:check:all`, and `npm run check` all pass; CI green on the implementing PR(s).
8. UAT sign-off (mandatory per `CLAUDE.md`) against both desktop and mobile, at minimum
   covering every row of the cross-reference table above.
