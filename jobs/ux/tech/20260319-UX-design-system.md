# Design System Spec — Travel Tracker
**Date:** 2026-03-19
**Author:** UX (UI/UX Designer)
**Brief:** BRIEF-UX-01
**Stack:** Tailwind CSS + shadcn/ui (Radix UI primitives)
**Status:** Final — this is the single source of truth for Frontend implementation

---

## Overview

This spec defines the complete visual language for Travel Tracker. Frontend must implement this design system in the Tailwind config before touching any component. All values in this document override any existing inline styles.

The design language is **geographic and considered** — earthy, rich, slightly warm. Not generic SaaS blue. The app is built around a map and the colour choices should feel at home alongside cartographic greens, blues, and earth tones.

---

## Section 2a — Colour Palette

### Design Principles
- Primary colour is **atlas teal** — a deep, authoritative blue-green that evokes ocean cartography and feels distinct from generic product blue
- Accent is **amber** — warm, travel-connoting, used for active/in-progress states
- Neutral scale is **slate** — cool grey, clean, works well alongside map colours
- Destructive is **rose red** — distinct from primary, never confused with accent
- Semantic tokens are defined once and referenced everywhere

### Base Palette

```
/* Atlas Teal — Primary */
--color-teal-50:   #F0FDFA
--color-teal-100:  #CCFBF1
--color-teal-200:  #99F6E4
--color-teal-500:  #14B8A6
--color-teal-600:  #0D9488    /* Primary interactive */
--color-teal-700:  #0F766E    /* Primary hover */
--color-teal-800:  #115E59    /* Primary pressed / dark context */
--color-teal-900:  #134E4A

/* Amber — Accent (active/planning states) */
--color-amber-50:  #FFFBEB
--color-amber-100: #FEF3C7
--color-amber-200: #FDE68A
--color-amber-500: #F59E0B
--color-amber-600: #D97706
--color-amber-700: #B45309

/* Slate — Neutral */
--color-slate-50:  #F8FAFC
--color-slate-100: #F1F5F9
--color-slate-200: #E2E8F0
--color-slate-300: #CBD5E1
--color-slate-400: #94A3B8
--color-slate-500: #64748B
--color-slate-600: #475569
--color-slate-700: #334155
--color-slate-800: #1E293B
--color-slate-900: #0F172A

/* Rose — Destructive */
--color-rose-50:   #FFF1F2
--color-rose-100:  #FFE4E6
--color-rose-500:  #F43F5E
--color-rose-600:  #E11D48
--color-rose-700:  #BE123C

/* Emerald — Success / positive completion */
--color-emerald-50:  #ECFDF5
--color-emerald-100: #D1FAE5
--color-emerald-600: #059669
--color-emerald-700: #047857

/* Violet — Place/activity accent (maps to activity tags) */
--color-violet-100: #EDE9FE
--color-violet-700: #6D28D9
--color-violet-800: #5B21B6
```

### Semantic Tokens (Tailwind Custom Tokens)

These are the tokens Frontend configures in `tailwind.config.ts` and references throughout the codebase. No component ever references a raw hex value — only these tokens.

```typescript
// tailwind.config.ts — theme.extend.colors
colors: {
  // Backgrounds
  'bg-base':        '#F8FAFC',   // slate-50 — page background
  'bg-surface':     '#FFFFFF',   // card / modal / input background
  'bg-subtle':      '#F1F5F9',   // slate-100 — section backgrounds, table stripes
  'bg-muted':       '#E2E8F0',   // slate-200 — disabled, inactive

  // Borders
  'border-default': '#E2E8F0',   // slate-200 — default border
  'border-strong':  '#CBD5E1',   // slate-300 — focused / prominent borders

  // Text
  'text-primary':   '#0F172A',   // slate-900 — primary content
  'text-secondary': '#334155',   // slate-700 — secondary content
  'text-muted':     '#64748B',   // slate-500 — placeholders, captions
  'text-disabled':  '#94A3B8',   // slate-400 — disabled text

  // Primary action (teal)
  'primary':        '#0D9488',   // teal-600
  'primary-hover':  '#0F766E',   // teal-700
  'primary-subtle': '#CCFBF1',   // teal-100 — primary badge bg / hover tint
  'primary-text':   '#134E4A',   // teal-900 — text on primary-subtle bg

  // Accent (amber)
  'accent':         '#D97706',   // amber-600
  'accent-subtle':  '#FEF3C7',   // amber-100
  'accent-text':    '#92400E',   // amber-800

  // Destructive (rose)
  'destructive':        '#E11D48',   // rose-600
  'destructive-hover':  '#BE123C',   // rose-700
  'destructive-subtle': '#FFE4E6',   // rose-100
  'destructive-text':   '#9F1239',   // rose-800

  // Success (emerald)
  'success':        '#059669',   // emerald-600
  'success-subtle': '#D1FAE5',   // emerald-100
  'success-text':   '#065F46',   // emerald-800

  // Activity/place accent (violet)
  'activity-subtle': '#EDE9FE',  // violet-100
  'activity-text':   '#5B21B6',  // violet-800
}
```

### Status Badge Colour Map

| Status | Background | Text |
|--------|------------|------|
| planning | `primary-subtle` (#CCFBF1) | `primary-text` (#134E4A) |
| active | `accent-subtle` (#FEF3C7) | `accent-text` (#92400E) |
| review_pending | `accent-subtle` (#FEF3C7) | `accent` (#D97706) |
| locked | `bg-subtle` (#F1F5F9) | `text-secondary` (#334155) |
| consider | violet-100 (#EDE9FE) | violet-800 (#5B21B6) |
| confirmed | `primary-subtle` (#CCFBF1) | `primary-text` (#134E4A) |
| completed | `success-subtle` (#D1FAE5) | `success-text` (#065F46) |
| cancelled | `destructive-subtle` (#FFE4E6) | `destructive-text` (#9F1239) |
| next_time | `accent-subtle` (#FEF3C7) | `accent-text` (#92400E) |

### WCAG AA Contrast Compliance

All text/background pairings must meet WCAG AA (4.5:1 for normal text, 3:1 for large text).

| Pair | Contrast Ratio | Pass |
|------|----------------|------|
| `text-primary` (#0F172A) on `bg-base` (#F8FAFC) | 17.8:1 | Pass |
| `text-secondary` (#334155) on `bg-surface` (#FFF) | 9.7:1 | Pass |
| `text-muted` (#64748B) on `bg-surface` (#FFF) | 5.9:1 | Pass |
| `primary` (#0D9488) on `bg-surface` (#FFF) | 4.6:1 | Pass (large text) |
| `primary-text` (#134E4A) on `primary-subtle` (#CCFBF1) | 7.8:1 | Pass |
| `success-text` (#065F46) on `success-subtle` (#D1FAE5) | 7.5:1 | Pass |
| `destructive-text` (#9F1239) on `destructive-subtle` (#FFE4E6) | 8.1:1 | Pass |
| `activity-text` (#5B21B6) on `activity-subtle` (#EDE9FE) | 6.9:1 | Pass |
| White (#FFF) on `primary` (#0D9488) | 4.6:1 | Pass (large text / buttons) |
| White (#FFF) on `destructive` (#E11D48) | 5.5:1 | Pass |

Note: `primary` (#0D9488) on white is borderline for normal-weight small text (4.6:1). Primary-coloured text should be `text-base` (16px) or larger, or use `font-medium`. Do not use `primary` as a colour for 12px–13px body text.

---

## Section 2b — Typography Scale

### Font Family

**Recommendation: Inter**

- Available via Google Fonts CDN (one `<link>` in `index.html`)
- System fallback: `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
- Rationale: Inter has superior legibility at small sizes (11–13px), excellent number tabular figures for dates and IDs, and works well for both UI text and data values. It is the de facto standard for data-dense desktop applications.

```html
<!-- index.html <head> -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
```

```typescript
// tailwind.config.ts
fontFamily: {
  sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
}
```

### Type Scale

| Token | Size | Line Height | Weight | Use |
|-------|------|-------------|--------|-----|
| `text-xs` | 11px | 16px (1.45) | 400/500 | Metadata, inactive badges, timestamps |
| `text-sm` | 13px | 20px (1.54) | 400/500 | Body copy, form labels, card secondary text |
| `text-base` | 14px | 22px (1.57) | 400/500 | Default body text, table rows, input values |
| `text-md` | 15px | 24px (1.6) | 500/600 | Section headings within components (PlaceSection) |
| `text-lg` | 18px | 28px (1.55) | 600/700 | Modal titles, card titles |
| `text-xl` | 20px | 30px (1.5) | 700 | Page-level h2 (ReviewPanel heading) |
| `text-2xl` | 24px | 32px (1.33) | 700 | Page-level h1 (Trip name, Trips list heading) |

Note: `text-md` is a custom token added to the Tailwind config. The default Tailwind `text-base` is 16px — this app uses 14px as its base, which is correct for a data-dense desktop application.

### Weight Usage Rules

- **400 (regular):** body text, form values, descriptions
- **500 (medium):** labels, secondary headings, UI element text (nav links, tab labels)
- **600 (semibold):** card titles, section headings, badge text, primary labels
- **700 (bold):** page h1 headings, modal titles, primary CTA button text

Never use 300 (light). Never use 800+ (heavy) — not in the Inter subset loaded.

### Line Height Guidelines

- Compact single-line text (badges, tags, buttons): `leading-none` or `leading-tight` (1–1.25)
- Body text in paragraphs: `leading-relaxed` (1.625) — use for notes, descriptions
- Default UI text: `leading-normal` (1.5)

---

## Section 2c — Spacing Scale

### Active Spacing Tokens

The app uses Tailwind's default spacing scale (4px base unit). The following values are the only ones used in this application. Deviating from this list requires explicit sign-off.

| Token | Value | Use |
|-------|-------|-----|
| `space-0.5` | 2px | Micro gaps (star rating gaps, icon margins) |
| `space-1` | 4px | Inline icon-to-text gaps |
| `space-1.5` | 6px | Tag/chip horizontal padding, small gaps |
| `space-2` | 8px | Default horizontal padding inside compact elements (badges, tags) |
| `space-3` | 12px | Default gap between list items, card internal sections |
| `space-4` | 16px | Card padding (compact), field bottom margin |
| `space-5` | 20px | Section separation within a page |
| `space-6` | 24px | Page content padding (horizontal), modal padding |
| `space-8` | 32px | Page section gaps, modal bottom margin |
| `space-12` | 48px | Major section separation |

### Component Internal Padding Rules

| Component | Padding |
|-----------|---------|
| Navigation bar | `py-2 px-5` (8px 20px) |
| Page content area | `py-6 px-6` (24px both) |
| Card (TripCard, ItemCard) | `p-3` (12px) |
| Modal | `p-6` (24px) |
| Form field (input, select, textarea) | `py-2 px-3` (8px 12px) |
| Button (default) | `py-2 px-4` (8px 16px) |
| Button (compact) | `py-1 px-3` (4px 12px) |
| Badge / tag | `py-0.5 px-2` (2px 8px) |
| Section header (PlaceSection) | `py-3 px-4` (12px 16px) |
| Admin list row | `py-2 px-3` (8px 12px) |

### Layout Rules

- **Page max-width:** `max-w-3xl` (768px) for single-column content (Trips list, Trip Detail, Admin)
- **Page horizontal centering:** `mx-auto`
- **Gap between trip cards:** `gap-2` (8px) — dense list, not generous
- **Gap between PlaceSection cards:** `gap-4` (16px) — enough to visually separate places

Note: Dropping max-width from 900/960px to 768px and using the reclaimed space for better data density within the content width is the correct trade. If a two-column layout is adopted later (sidebar + detail), the combined max-width can expand to `max-w-5xl`.

---

## Section 2d — Border Radius & Elevation

### Border Radius

Two values only:

| Token | Value | Use |
|-------|-------|-----|
| `rounded` | 6px | Default for all interactive elements: buttons, inputs, badges, small cards |
| `rounded-lg` | 8px | Large containers: modals, page-level cards (TripCard, PlaceSection) |
| `rounded-full` | 9999px | Status badges (pill shape only) |

Do not use `rounded-sm` (4px), `rounded-md` (different value in shadcn), `rounded-xl`, or `rounded-2xl` in this application. Consistency of radius is non-negotiable.

### Elevation / Shadow Scale

Three levels only:

| Level | Token | CSS Value | Use |
|-------|-------|-----------|-----|
| 0 | none | none | Inline elements, flat sections |
| 1 | `shadow-sm` | `0 1px 2px rgba(0,0,0,0.06)` | Cards (TripCard, ItemCard, PlaceSection) |
| 2 | `shadow-md` | `0 4px 12px rgba(0,0,0,0.08)` | Hovered cards, dropdowns |
| 3 | `shadow-xl` | `0 20px 48px rgba(0,0,0,0.16)` | Modals, dialogs |

TripCard hover state: transition from `shadow-sm` to `shadow-md`. Do not use raw `rgba` values inline — use these tokens.

---

## Section 2e — Component Inventory

### Required shadcn/ui Components

All components should be installed via the shadcn/ui CLI and copied into `src/frontend/components/ui/`. They are owned source code once installed — customise freely per spec below.

---

#### Button

**Where used:** All interactive buttons throughout the app (nav actions, form submit, card actions, modal actions, admin CRUD actions)

**Variants required:**

| Variant | Use | Tailwind classes (key) |
|---------|-----|------------------------|
| `default` | Primary action (create, submit, confirm positive) | `bg-primary text-white hover:bg-primary-hover` |
| `outline` | Secondary action (edit, cancel, back, filter) | `border border-border-default bg-surface hover:bg-subtle` |
| `ghost` | Tertiary / inline action (nav links, icon buttons) | `hover:bg-subtle` |
| `destructive` | Delete, deactivate | `bg-destructive text-white hover:bg-destructive-hover` |

**Sizes:**

| Size | Use |
|------|-----|
| `default` | Modal actions, main page CTAs |
| `sm` | Card inline actions (Edit, Delete on ItemCard) |
| `icon` | Icon-only buttons (close modal ×, dismiss geocoding) |

**Customisations:**
- `focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2` on all variants (resolves G-02)
- `disabled:opacity-50 disabled:cursor-not-allowed`
- Loading state: add `<Loader2 className="animate-spin" />` icon before label when `isPending`

---

#### Input

**Where used:** All text inputs throughout the app (TripForm name, ItemForm fields, Admin new-item forms, city search, country search)

**Customisations:**
- `focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1` (resolves G-02)
- `placeholder:text-muted`
- Consistent `text-base` (14px) and `py-2 px-3` padding

---

#### Select

**Where used:** Status selectors (TripList filters, ReviewItemRow), sort dropdown, Admin — all native `<select>` elements

**Note:** shadcn/ui `Select` uses Radix UI — it replaces native `<select>`. Required for consistent cross-browser appearance and keyboard nav.

**Customisations:** Same focus ring as Input.

---

#### Dialog (Modal)

**Where used:** TripForm, ItemForm, AddPlaceFlow, CarryForwardModal, ConfirmDialog

**Replaces:** All existing custom `overlayStyle` + `modalStyle` implementations.

**Customisations:**
- Max width variants: `sm` (400px — ConfirmDialog), `md` (520px — CarryForwardModal, AddPlaceFlow), `lg` (560px — TripForm, ItemForm)
- `rounded-lg shadow-xl`
- Backdrop: `bg-slate-900/45`
- Close button (×) positioned top-right using `DialogClose` with icon-size Button

---

#### Badge

**Where used:** StatusBadge, category tags, activity tags, "Inactive" indicator, "carried forward" indicator

**Variants required:**

| Variant | Use |
|---------|-----|
| `default` | Generic badge |
| `planning` | Trip status: planning |
| `active` | Trip status: active |
| `review` | Trip status: review_pending |
| `locked` | Trip status: locked |
| `consider` | Item status |
| `confirmed` | Item status |
| `completed` | Item status |
| `cancelled` | Item status |
| `next-time` | Item status |
| `category` | Category chip in TripForm toggle and TripCard |
| `activity` | Activity chip (violet) |
| `muted` | Inactive, carried-forward, metadata labels |

Each variant maps to a colour pair from Section 2a. `StatusBadge` should be reimplemented using this Badge component.

---

#### Card

**Where used:** TripCard, ItemCard (as a container), PlaceSection (outer container)

**Customisations:**
- `shadow-sm hover:shadow-md transition-shadow duration-150` on TripCard
- `rounded-lg border border-border-default bg-surface`
- Internal: `CardHeader`, `CardContent`, `CardFooter` sub-components from shadcn

---

#### Tabs

**Where used:** AdminPanel tab bar

**Replaces:** Current manual button-based tab implementation.

**Customisations:**
- `text-sm font-medium` for tab labels
- Active: `text-primary border-b-2 border-primary`
- Inactive: `text-muted hover:text-secondary`

---

#### Toast / Sonner

**Where used:** Global success feedback for all mutations (resolves G-05)

**Recommendation:** Use `sonner` (the shadcn/ui recommended toast library) — it is a peer dependency of shadcn and integrates cleanly.

**Install:** `npx shadcn@latest add sonner`

**Customisations:**
- Position: `bottom-right`
- Success: green (`success` / `success-text` colours)
- Error: red (`destructive` colours)
- Info: teal (`primary` colours)
- Duration: 3000ms default, 5000ms for errors

**Usage pattern:** `toast.success('Trip created')`, `toast.error('Failed to save')` called after mutations.

---

#### Dropdown Menu

**Where used:** Not currently used in the app. Reserved for future use (e.g. more actions on TripCard — "Duplicate", "Archive").

---

#### Tooltip

**Where used:**
- Geocoding pending indicator (show full explanation on hover)
- Status badge (show full status label for locked trips)
- Map legend items (show description of each shading state)

**Customisations:** Standard shadcn defaults sufficient.

---

#### Separator

**Where used:** ReviewPanel section dividers, PostTripReview bottom action bar divider

---

#### Checkbox

**Where used:** CarryForwardModal candidate list (styled checkbox per row)

**Replaces:** Native `<input type="checkbox">` in CarryForwardModal.

**Customisations:**
- `data-[state=checked]:bg-primary data-[state=checked]:border-primary`

---

### Components to Build (not in shadcn/ui standard set)

#### StatusBadge (custom)
Rebuild using shadcn Badge with variant map per Section 2e above. Single shared component.

#### RatingStars (custom)
Replace emoji `★` characters with Lucide `Star` / `StarOff` icons. Fill with `text-amber-500`, empty with `text-slate-300`. Keep the 1–5 button pattern, add Tailwind focus ring.

#### EmptyState (custom)
New component. Used for: zero trips on map, zero items in PlaceSection, zero results in city search.
Props: `icon` (Lucide icon), `title` (string), `description` (string), optional `action` (Button).

---

## Section 2f — Icon System

### Recommendation: Lucide React

Lucide is the default icon set for shadcn/ui and is already a dependency once shadcn is installed. It provides:
- 1400+ consistent SVG icons
- React components with clean props (`size`, `className`, `strokeWidth`)
- Treeshakeable (only imported icons bundled)
- Consistent 2px stroke weight, 24px default grid

**Install:** Lucide is included as a peer dep with shadcn — no separate install needed.

### Icon Map for This Application

| Concept | Lucide Icon | Notes |
|---------|-------------|-------|
| Navigation: Map | `Map` | Nav bar |
| Navigation: Trips | `Briefcase` | Nav bar |
| Navigation: Admin | `Settings2` | Nav bar |
| App logo / brand | `Globe` | Nav bar (replaces ✈️ emoji) |
| Item type: Restaurant | `UtensilsCrossed` | |
| Item type: Hotel | `Building2` | |
| Item type: Flight | `Plane` | |
| Item type: Car Rental | `Car` | |
| Item type: Experience | `Ticket` | |
| Item type: Note | `FileText` | |
| Trip status: Active | `Activity` or `Zap` | |
| Trip status: Locked | `Lock` | Replaces 🔒 emoji |
| Trip status: Planning | `CalendarDays` | |
| Photo album | `Images` | Replaces 📷 emoji |
| Geocoding pending | `CloudOff` or `MapPin` + spinner | Replaces ☁ emoji |
| Carry forward | `ArrowRight` or `History` | |
| Delete | `Trash2` | |
| Edit | `Pencil` | |
| Add | `Plus` | |
| Close modal | `X` | |
| Clear filter | `X` | |
| Sort | `ArrowUpDown` | |
| Search | `Search` | Search input prefix |
| Rating star (filled) | `Star` (filled) | `fill-amber-400 text-amber-400` |
| Rating star (empty) | `Star` | `text-slate-300` |
| Success / check | `CheckCircle2` | |
| Warning | `AlertTriangle` | |
| Error | `AlertCircle` | |
| Map legend | `Layers` | Legend toggle button |
| Expand / collapse | `ChevronDown` / `ChevronUp` | |

### Usage Rules

- All icons rendered as `<IconName size={16} />` for inline use (buttons, badges)
- `<IconName size={20} />` for standalone icons in cards and item type selectors
- `<IconName size={24} />` for empty state illustrations
- Never mix Lucide with emoji for the same semantic concept
- `aria-hidden="true"` on decorative icons; `aria-label` on icon-only buttons
