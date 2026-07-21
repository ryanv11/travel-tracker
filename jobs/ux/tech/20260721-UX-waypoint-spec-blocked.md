# Waypoint Redesign Spec — BLOCKED on mockup access

**Date:** 2026-07-21
**Author:** UX
**Trigger:** COO brief — formalize the "Waypoint" Claude Design mockups (claude.ai Design
project `8cc525c1-b678-4976-a207-57f7f489844b`, files `Design System.dc.html`,
`Trips Desktop.dc.html`, `Trips Mobile.dc.html`) into a two-phase, briefable spec.

**Status: NOT DELIVERED.** The formal Phase 1 / Phase 2 spec described in the brief could
not be produced this thread. This document records why, what I verified before concluding
it's a hard blocker, and the preparatory groundwork completed so a follow-up thread can move
straight to spec-writing once access is restored.

---

## The blocker

The brief instructs use of a `DesignSync` tool (`get_project`, `list_files`, `get_file`) to
read the three mockup files. That tool does not exist in this environment:

1. `ToolSearch` was queried multiple ways (`"DesignSync"`, `"design mockup project file sync
   claude.ai"`, `"get_project get_file list_files"`, `"claude.ai design review file content
   read"`, `"mcp"`) — no `DesignSync` tool surfaced in any result, deferred or otherwise.
2. `claude mcp list` shows exactly four configured MCP servers in this environment: `claude.ai
   monday.com` (needs auth), `claude.ai Google Drive` (connected), `claude.ai Gmail` (needs
   auth), `claude.ai Google Calendar` (needs auth). There is no `DesignSync` entry at all —
   not even one sitting in a needs-authentication state. This isn't an auth gate I can clear
   from inside the thread; the server isn't wired up here.
3. As a last check, I tried `WebFetch` directly against the claude.ai project URL
   (`https://claude.ai/project/8cc525c1-b678-4976-a207-57f7f489844b`) — 403 Forbidden, as
   expected for an authenticated claude.ai resource with no session.
4. I searched the repo itself (`grep -ri waypoint`, `find *.dc.html`, `grep -i oklch`, `grep
   8cc525c1`) in case the mockups had already been exported/committed somewhere — nothing.

**I have not fabricated any of the requested spec content as a result.** The brief is explicit
that the exact oklch values, type pairings, icon glyphs, and badge-hue mapping must be carried
over precisely, and that the "what's in it" summary in the brief is a lead, not something to
take as complete — it has to be verified against the actual files. Guessing plausible-looking
values would produce a spec that looks complete but silently diverges from what Ryan actually
approved, and Frontend would build the wrong thing with high confidence. That's a worse
outcome than a blocked thread with an honest note.

**What would unblock this:**
- Get the `DesignSync` MCP server connected/configured for this environment (whatever COO/Ryan
  used to originally read the project), or
- Provide the three `.dc.html` files' raw content through a channel I already have access to
  — e.g. paste/commit them into the repo (`jobs/ux/tech/waypoint-mockups/*.dc.html`) or share
  them via the connected Google Drive MCP.

Either path lets a follow-up UX thread read the actual markup/CSS/`<script type="text/x-dc">`
logic and produce the real Phase 1/Phase 2 spec in one pass.

---

## Preparatory groundwork completed this thread

To avoid losing the whole thread's budget to the blocker, I did the half of the job that
doesn't depend on the mockups: a full read of the current Trips screen implementation and a
cross-reference against every BRD/bug-fix item the brief called out. This is what the
follow-up thread should start from.

### Current stack facts relevant to Phase 1 token placement

- **Tailwind v4, CSS-first config.** `src/frontend/index.css` uses `@import "tailwindcss"` —
  there is no `tailwind.config.js`/`.ts` in the repo. Any Phase 1 token work (colors, type
  scale, radius) belongs in an `@theme` block in `index.css` (or a new imported CSS file), not
  a JS config object. Confirmed via `find` (no config file) and reading `package.json`
  (`tailwindcss@^4.2.2`, `@tailwindcss/vite@^4.2.2`).
- **No component library, no icon library.** `package.json` dependencies contain no
  `lucide-react`, no `@radix-ui/*`, no `shadcn`-anything, no `clsx`/`class-variance-authority`.
  The March 2026 UX audit (`jobs/ux/tech/20260319-UX-design-system.md`) had assumed a
  Tailwind+shadcn/ui migration and recommended Lucide as the icon library — **that migration
  never happened.** Only the Tailwind half landed; shadcn/ui and an icon library were never
  adopted. `jobs/ux/context/current.txt` is stale on this point (still says "awaiting
  Tailwind/shadcn migration" as of March, but Tailwind alone is now fully in place and has
  been for months per the July PRs).
  **Flag for whoever writes Phase 1:** if the Waypoint mockups' "filled-icon set" implies a
  specific icon library (vs. hand-authored inline SVGs), that's a new dependency and needs a
  COO tradeoff call per this role's standing instruction — don't assume it's pre-approved just
  because the March audit once recommended Lucide for a different (shadcn-based) plan.
- **Current palette is teal/amber/violet/emerald**, not blue — a full rebrand already happened
  once (see `jobs/ux/tech/20260321-UX-delivered-vs-mockup-delta.md`, DELTA-01/02/03/13/17). The
  Waypoint rebrand ("warm paper neutrals + deep pine primary") replaces *this* palette, not the
  original blue one. Whoever writes Phase 1 should treat the current teal-based tokens as the
  "before" state, not blue.
- **Current icons are literal emoji**, confirmed in `src/frontend/components/TripDetail/
  ItemCard.tsx` lines 27-34 (`TYPE_ICONS`): `restaurant: '🍽️'`, `hotel: '🏨'`, `flight: '✈️'`,
  `car_rental: '🚗'`, `experience: '🎫'`, `note: '📝'` — this is an exact match to the brief's
  list. Also emoji/symbol elsewhere: nav brand square already uses a plain `T` glyph (not an
  emoji, already fixed per DELTA-17), Photos button uses `📷`, locked-trip banner uses `🔒`,
  empty-state icon uses `🗺`. All of these are candidate Phase 1 icon-replacement targets.

### BRD / bug-fix cross-reference (ready for Phase 2 conflict-checking)

Read in full and summarized below so the follow-up thread doesn't need to re-derive them:

- **DP-04** (BRD line 226): place section shows city + full country name + date range, derived
  from hotel check-in/check-out, falling back to trip dates. **Implemented** —
  `PlaceSection.tsx` line 116 (`place.city.country_name ?? place.city.country_code`) and
  `resolvePlaceDateRange` utility (ADL-24 §5 precedence). Any mockup place-card layout must
  preserve this exact precedence chain, not just the visual format.
- **DP-05** (BRD line 227): places have optional arrival/departure dates; when set, places sort
  chronologically by arrival date; when not set, insertion order is preserved. **Implemented**
  — `TripDetail.tsx` lines 237-245, explicit sort with nulls-last, lexicographic YYYY-MM-DD
  comparison.
- **DP-06** (BRD line 228): first place added to a trip inherits the trip's date range;
  subsequent edits are independent. Tracker shows `BRD-DP06` as a separate tracker entry,
  **status "pending"** (not yet built) — this is a real gap, not just a display nuance. A
  mockup place-card that assumes dates are always populated should be checked against this: is
  the "no dates set yet" state shown anywhere in the mockup? If the mockup only shows populated
  states, Phase 2 spec must call out the currently-still-open DP-06 gap explicitly so it isn't
  silently dropped.
- **BUG-31** (tracker, DP-04/DP-05): fixed 2026-07-20, PR #162 — root cause was a backend
  read-path bug (GET didn't return `arrived_on`/`departed_on`), not display logic. No residual
  UI risk, but confirms per-place date display is now reliable — safe to reskin.
- **BUG-32**: "no way to remove a place" — fixed via DELETE route + confirm dialog + item
  reassignment to trip-level on delete. Implemented in `PlaceSection.tsx` lines 165-189, 236-251
  (`Remove` button, `ConfirmDialog`, message differs based on whether the place has items).
  **Phase 2 must preserve this exact confirm-then-cascade-reassign flow** if the mockup's place
  card doesn't show a remove affordance in its "static" state (mockups conventionally don't
  render hover-only/confirm-only chrome) — don't let it be silently dropped for looking cleaner.
- **BUG-34**: map standout-icon inconsistency — fixed in the **map layer**, not Trips screen.
  Not in scope for this spec at all (Map screen is out of scope per Ryan's decision), but noting
  it so nobody confuses it with a Trips-screen item.
- **BUG-36 / IT-01** (BRD line 149, "user can log items against a trip or a specific place"):
  trip-level Add Item entry point, restricted to Flight/Car Rental. **Implemented** as a whole
  separate section, `TripItemsSection.tsx`, rendered above the Places list in `TripDetail.tsx`
  line 233 — has its own header, its own "+ Add Trip Item" button (deliberately distinctly
  labelled from PlaceSection's "+ Add Item" to avoid an accessible-name collision that broke
  E2E tests once already). **This is a structural element with no obvious mockup equivalent**
  unless the Waypoint mockup was built after BUG-36 landed (2026-07-20) — the brief's own "what's
  in it" summary doesn't mention a trip-level items section at all. Whoever reads the actual
  mockup must check explicitly whether `Trips Desktop.dc.html`/`Trips Mobile.dc.html` render
  this section; if it's absent from the mockup, that is a **conflict to flag to COO**, not a
  silent omission — trip-level items are a real, tested, BRD-linked feature and can't just
  disappear in the reskin.

### Existing UI surface not mentioned in the brief's "what's in it" summary

These exist in the current Trips screen today and have no visible counterpart in the brief's
summary of the mockups. Flagging now so the follow-up thread checks for them explicitly rather
than assuming silence means "removed by design":

- **FEAT-BD bulk multi-select delete** (`TripsLayout.tsx` lines 48-192): a "Select" mode toggle,
  checkboxes on trip cards, a bulk action bar, 5-second undo window on delete. Substantial,
  tested functionality.
- **NTH-01 undo bar**, **NTH-03 per-status filter counts** (`(12)` next to each status chip).
- **Sort control** (Newest/Oldest/Name A-Z/Name Z-A) — TR-09, in the left panel under search.
- **Map filter badge** (`Country:`/`Region:`/`City:` — set when arriving from a Map-screen
  click-through) with a clear (×) affordance.
- **Geocoding-pending indicator** in the nav bar (NR-06) — not Trips-screen-specific but shares
  the nav bar the mockups' bottom tab bar/nav will replace or coexist with on mobile.
- **RequireOwner gate messaging** or nav — Admin link is owner-only, hidden until identity
  resolves; relevant if the mockup's mobile bottom tab bar always shows an Admin tab regardless
  of ownership (would be a real behavior change, not just a skin).

None of the above is fabricated content about the mockups themselves — it's an inventory of
what Phase 2 needs to reconcile once the mockups can actually be read.

---

## Recommended next step

Re-run this brief once one of the two unblock paths above is available. Given the groundwork
above is already done, the actual Phase 1 token enumeration + Phase 2 layout/state breakdown
should be a single focused pass once the mockup files can be read — no need to re-audit the
current implementation from scratch.
