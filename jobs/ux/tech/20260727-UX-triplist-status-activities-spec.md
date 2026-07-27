# Trip List Display, Status Pill Colours & Activities — Spec

**Date:** 2026-07-27
**Author:** UX
**GitHub:** #274 (Wave 0 scoping brief S4)
**Tracker:** BUG-53, UX-11, BUG-54, BUG-47, BUG-46
**Status:** Spec complete, no open UX-owned questions. BRD gate and brief dispatch are COO's next step (see "New BRD IDs" at the end — I'm reporting these, not adding them).

**Scope discipline note:** these four items are batched into one pass because they share
a surface (trip-list card) and a data system (Waypoint badges / per-user shading config),
and because BUG-47's redesign directly determines BUG-46's disposition. They are still
four independent decisions — read the relevant section, not the whole document, if you
only need one.

**Built on:** Waypoint Phase 2 (`jobs/ux/tech/20260721-UX-waypoint-spec.md`, WP-03/WP-04,
shipped, PR #205). This spec extends that system — it does not re-litigate any of its
13 resolved conflicts. All new elements below use existing Waypoint tokens; no new colour,
font, or radius token is introduced.

---

## 1. BUG-53 — Trip-list place display (state instead of country, country surfaced separately)

### 1.1 Which surface, and a flagged discrepancy

The GitHub issue and tracker both label this "trip-list place display," which I'm reading
as the **left-panel trip card's place-name chip row** (`TripCard.tsx`) — that's this
section's scope. But the tracker's own "current state" description — *"each place in the
trips panel shows city (bold) with country underneath in lighter text"* — does not match
what `TripCard.tsx` actually renders today (a single-line, non-bold city-name chip, no
country at all; see `src/frontend/components/TripList/TripCard.tsx` lines 117–134). It
**does** match, almost verbatim, the trip-detail place-section header that already ships
today (`{city name, Newsreader 600/17px} / {country · dateRange, 12px ink-muted}` —
Waypoint spec §"Place sections", satisfying DP-04). I think the tracker note was likely
describing that surface, or a pre-reskin build, not the current list-card chip.

**My call:** scope this fix to the trip-list card, per the issue title and tracker
`owner`/topic framing, and flag the discrepancy explicitly (this paragraph) rather than
silently guessing wrong. The design decided below (state as primary, country surfaced
once, separately) generalizes cleanly to the trip-detail place section too if COO/PO
confirms that's also wanted — it would reuse the same rule, not a new one — but I'm not
speccing that change here since no bug ticket flags DP-04 as broken and doing so
unasked would be scope creep on a spec explicitly batched to avoid exactly that.

### 1.2 Data gap — this needs a small Backend change, not just a Frontend one

Checked `buildTripResponse()` (`src/backend/routes/trips.ts` lines 59–104), which is what
serves the trip list: it already calls `tripRepository.getPlaces()`, whose query **already
joins and selects `cityCountryName: countries.name`** (`src/backend/repositories/trips.ts`
line 320) — but the response mapper (`routes/trips.ts` lines 76–89) drops it on the floor;
list responses currently ship `city.country_name` as absent entirely (matches the frontend
type comment: *"present in trip detail responses... Null for list/map endpoints"*).
There is also **no region/state name anywhere on `City` today** — only `region_id` and
`region_iso` (an ISO 3166-2 **code**, e.g. `"US-CA"`, not a display name).

Required Backend data contract change (small — both joins already largely exist):
1. `tripRepository.getPlaces()` (`repositories/trips.ts` ~line 322, where `regions` is
   already joined for `iso3166_2`) — add `regionName: regions.name` to the select.
2. `buildTripResponse()`'s place mapper (`routes/trips.ts` lines 76–89) — add
   `country_name: p.cityCountryName` and `region_name: p.cityRegionName ?? null` to the
   `city` object it builds. (`country_name` is already computed, just not surfaced here.)
3. Frontend `City` type (`src/frontend/types/api.ts`): drop the "null for list/map
   endpoints" caveat on `country_name` (it'll now be populated everywhere `getPlaces()` is
   the source), and add `region_name: string | null`.

No schema change, no migration — both `countries` and `regions` tables and their FKs
already exist and are already joined for other fields on this exact query.

### 1.3 Design: two-line place chip + separate country row

**Place chip (existing element, restyled):**

- When `city.region_name` is present: chip becomes a stacked two-line block —
  `city.name` on top, `region_name` below, inside the same chip container
  (`bg-wp-bg-subtle rounded-[7px] px-2.5 py-1`, `rounded-[8px]` on mobile — unchanged
  container). City line: `text-[11px] font-ui font-semibold text-wp-ink leading-tight`
  (bolded — this part of the tracker's ask holds regardless of which surface it
  originally described). Region line: `text-[10px] font-ui text-wp-ink-faint leading-tight`,
  directly below with no extra gap (`leading-tight` on both, no `mt-` between them).
- When `city.region_name` is `null` (region tier disabled for that country — most of
  Europe, per GE-06 default — or genuinely unresolved): chip stays exactly as it renders
  today, single line, city name only, `text-[11px] font-ui text-wp-ink-muted`. **Do not**
  fall back to showing the country name in this slot — that's handled by the row below,
  and showing it in both places would be redundant on every European-trip card.
- Truncation/cap logic (`MAX_PLACE_BADGES = 4`, "+N more") is unchanged.

**New: country row, own row beneath (not merged into the category row) — this is the
pill-vs-row call the PO left open, and my reasoning for row:**

- **Reasoning:** the card already has an established "one row = one meaning" pattern
  (place-name row, category row). Trips can have multiple *countries* (a multi-place
  Euro-trip), so a "pill next to the category" reading — a single, trip-level country
  token — would need somewhere to put more than one country, and merging country and
  category chips into one flex-wrapped row makes them visually interchangeable at a
  glance (both would be small rounded-rect chips) unless they're differently coloured,
  which risks a *third* colour family on a card that currently uses exactly two
  (category = hue 255, place = neutral). A dedicated row preserves the existing
  one-row-one-meaning convention, keeps every chip type visually grouped even as the
  card wraps under narrow widths, and scales to N countries the same way the existing
  place row scales to N places. This is a hierarchy/consistency call, not a space
  optimization — for the common single-country trip it costs one compact row, which is
  earned content given BUG-52's motivation (country wasn't visible or searchable-context
  on the card at all before this change).
- **Placement:** between the place-name row and the category row (geography, then
  classification — matches the reading order of the place-section header on the detail
  view, which puts city/country ahead of category pills too).
- **Source:** derived **client-side from `trip.places`**, not from `trip.countries`.
  I checked `tripRepository.getCountries()` (`repositories/trips.ts` lines 334–346): that
  field is fed by the **`trip_countries` explicit-association table** (ADL-23's "country
  with no city yet" feature), a different and mostly-empty-in-practice data source for a
  trip built the normal way (add places, not standalone country associations) — it is
  **not** "the countries this trip's places are in." Using it here would render the row
  empty for most real trips, defeating the point. Compute instead:
  `Array.from(new Set(trip.places.map(p => p.city.country_name).filter(Boolean)))`,
  ordered by first appearance in `trip.places` (same order as the place-chip row above
  it, so the two rows read as visually connected, not independently re-sorted).
- **Shape — deliberately distinct from both existing chip types, using only existing
  tokens:** `inline-block rounded-[7px] px-2.5 py-1 text-[11px] font-ui text-wp-ink-muted
  border border-wp-border bg-transparent` (`rounded-[8px]` on mobile, matching the
  responsive pattern already used for place/category chips). This is an **outline** chip
  — filled place chips (`bg-wp-bg-subtle`) and filled hue-255 category chips both read as
  "solid," so an outline treatment for country reads as a third, distinct tier at a glance
  without a new colour token: solid neutral = where (city/state), outline neutral = also
  where but a coarser grain (country), solid hue-255 = what kind of trip (category).
- **Truncation:** reuse the same cap pattern as the place-chip row ("+N more" once count
  exceeds a cap) for defensiveness against a pathological many-country itinerary — most
  trips will show exactly one chip here, so this is a rarely-hit guard, not a primary
  design surface.
- **Dedup against the place-chip fallback:** since region-less places already show no
  country in their own chip (§1.3, place chip), there's no duplication to resolve — this
  row is the sole place country appears, for every place, regardless of whether that
  place's chip shows a state or not.

### 1.4 Mobile

No structural difference — the two-line place chip and the new country row both follow
the existing wrap-not-scroll rule already in force for this card (WP-04's mobile
no-horizontal-scroll constraint, already applied to the place/category chip rows). Radius
bump to 8px on mobile chips is already the established pattern (see `TripCard.tsx`'s
`isMobile` conditional) — apply the same bump to the new country chip.

### 1.5 What this does NOT touch

- Trip-detail place section (DP-04) — see §1.1's flagged discrepancy; not in scope here.
- `TripSummaryPlace`/`City` fields beyond the two additive ones in §1.2 — no other trip
  list field changes.
- BUG-52 (search doesn't match country name) — this spec makes country *visible* and
  *sourced from the same field* that would drive a search-match fix, which should make
  BUG-52 cheaper once briefed, but does not itself change `filterAndSortTrips` search
  logic. Flagging the adjacency, not claiming to fix BUG-52.

---

## 2. UX-11 — Trip-list status pill colours match map shading (admin-driven)

### 2.1 The core problem: trip status and shading state are different taxonomies

Trip status (`planning` / `active` / `review_pending` / `locked` — 4 values, one per trip)
and map shading state (`active` / `planned` / `visited_once` / `visited_once_planning` /
`visited_multiple` / `visited_multiple_planning` / `never_visited` — 7 values, one per
**place aggregate**, computed from *all* trips touching that place — see
`jobs/architect/tech/20260307-map-shading-spec.md` §1–2) are not the same axis. A single
trip's status pill cannot losslessly express a 7-state, aggregate-of-all-trips value — and
a trip with multiple places could, in principle, contribute to different shading states at
each place, so there is no single well-defined "this trip's shading state" for the review/
locked cases anyway. This has to be a **deliberate, partial, semantically-honest mapping**,
not an attempt at 1:1 fidelity — I'm stating this explicitly so nobody reads a future
gap ticket ("why doesn't Locked show visited_multiple when this is my 3rd trip here") as
a bug relative to this spec. It's out of scope by design, reasoned below.

### 2.2 The mapping (my recommendation, semantically grounded)

| Trip status | Shading state used | Why |
|---|---|---|
| `planning` | `planned` | Exact semantic match — a trip that exists but hasn't happened is definitionally what produces the map's "planned" shading. No ambiguity, no aggregation needed. |
| `active` | `active` | Exact semantic match, and MP-06 already establishes "active overrides everything" as a shared concept on both surfaces. |
| `review_pending` | `visited_once` | The shading spec's own §1 definition counts `review_pending` and `locked` **identically** as "completed" — shading cannot and does not distinguish them either. `visited_once` is the simplest, most common "this happened" representative; using it does not fabricate false precision because shading itself has no more specific answer available at the single-trip level (see §2.1). |
| `locked` | `visited_once` | Same reasoning as `review_pending` — **deliberately the same shading colour as Review**, not a different one. I considered mapping `locked` to `visited_multiple` to give it a visually distinct colour from Review, and rejected it: a first-ever trip to a place, once locked, would show the map's "visited multiple times" colour on its list pill while the map itself correctly shows "visited once" for the same trip — a direct, visible contradiction between the two surfaces, which is worse than not having this feature at all given the whole point is cross-surface consistency. Distinctness between Review and Locked is preserved through the label text (already "REVIEW" vs "LOCKED") and an icon (below), not colour. |

`visited_once_planning` / `visited_multiple_planning` are **not used** by this mapping —
those states depend on whether *other* trips to the same place are separately in planning,
which isn't knowable from one trip's own status. This is map-only richness; no gap to close.

**Distinctness for Review vs Locked (accessibility — colour is not the only carrier):**
add the existing `LockedIcon` (`src/frontend/components/icons/LockedIcon.tsx`, already
shipped and already used elsewhere in `TripDetail.tsx`) inline before the label text,
12px, on the Locked pill only. No new icon needed. Review pill: text only, as today.

### 2.3 Contrast — the real implementation cost of this item

Today's badge colours are fixed oklch pairs, each background/text combination hand-picked
for AA contrast (Waypoint spec §1). Shading colours are **per-user, admin-picked via a
plain colour picker** (`ShadingConfig.color_hex`, arbitrary hex, AD-04/AD-07) — an admin
could pick a light pastel or a near-black swatch for any state, with no text-colour
counterpart stored alongside it. A fixed light-or-dark text choice will fail contrast for
some admin-chosen colours.

**Required: a small "pick readable text colour" utility**, not a new dependency — compute
relative luminance of `color_hex` (standard WCAG formula), then pick whichever of
`--color-wp-ink` (dark) or white gives the higher contrast ratio against that background;
prefer either if it clears 4.5:1, otherwise take the higher of the two (an admin picking a
genuinely illegible-with-either colour is an edge case this can't fully solve, and isn't
new — the colour picker already lets them do that for map fills today, where WCAG text
contrast was never a concern because map shading is fill-only, no text on top). This is
the one piece of this whole spec that is genuinely new engineering, not a reskin — flagging
it plainly for COO's effort estimate: **S** (one pure function + a unit test asserting a
few known-tricky hexes, e.g. the shipped defaults' mid-tones), not architecture-level, but
not free either.

### 2.4 Where this applies, and where it doesn't

`StatusBadge` (`src/frontend/components/shared/StatusBadge.tsx`) is a **shared** component
used for both trip statuses and item statuses, and for trip statuses specifically it
renders in two places: the trip-list card (this brief's named target) and the trip-detail
header. **Apply the shading-driven mapping in both** — not just the list card. Leaving the
detail header on the old static hue while the list card uses live shading colours would
mean the same trip's Planning badge renders two different colours depending which panel
you're looking at, which is a direct instance of exactly what this role won't tolerate
("the app must feel like one product"). This is a single shared-component change, not two.

**Does not apply to item statuses** (`confirmed` / `completed` / `cancelled` / `consider` /
`next_time`, used on `ItemCard` rows). Shading has no item-level analogue — items don't
have a place-visit-count concept — so there's nothing for item badges to derive from.
Item badges stay exactly as today's fixed Waypoint hue table (`badges.ts`, unchanged).

### 2.5 Data plumbing — already-established pattern, not new architecture

`useShadingConfig()` (`src/frontend/hooks/useMapShading.ts`) already fetches
`GET /api/map/shading/config` (per-user, per ADL-28) and is already consumed via inline
`style={{ backgroundColor: state.color_hex }}` in `MapLegend.tsx` — i.e. the "read
per-user shading colour and apply it as a runtime style rather than a static Tailwind
class" pattern **already exists and already ships** in this codebase. `StatusBadge` (trip
statuses only, per §2.4) should follow the identical pattern: look up its hue's
`state_key` in the same `useShadingConfig()` result, apply `color_hex` as
`backgroundColor` and the computed text colour (§2.3) as `color`, inline. This is a
genuinely small change riding an established precedent — not the "new architecture"
tradeoff this role is required to flag when one exists. The one real cost is §2.3's
contrast utility.

**Loading/error state:** `useShadingConfig()` can be loading or (per `MapLegend`'s own
comment) 403 for non-owners in today's model. `StatusBadge` must not block or blank out
while shading config is loading — fall back to the existing static Waypoint hue for
`planning`/`active`/`locked` (review reuses the same fallback family as locked, i.e.
`confirmed`'s existing hue as a stand-in, since there's no static "visited_once" hue
today) until the live config resolves, then swap. This avoids a pill flashing colourless
or unstyled on every trip-list load.

### 2.6 Desktop / mobile / dark theme

No difference — `StatusBadge` is one component, same styling logic at every breakpoint.
No dark theme exists anywhere in this codebase today (checked `index.css` and
`theme-waypoint.css` — zero `dark`/`prefers-color-scheme` references), so that part of the
brief's constraint is currently N/A; noting it rather than silently skipping it. The
luminance-based contrast approach in §2.3 is theme-agnostic by construction (it reacts to
whatever background colour it's actually given), so it needs no rework if dark mode is
ever added later.

---

## 3. BUG-54 — Category/activity colour customization: does UX-11 make it free?

**No.** Explicitly ruling this out, per the brief's instruction to say which.

UX-11 builds one reusable piece of machinery: "read a per-user colour value and render it
as a runtime style with computed contrast text" (§2.3, §2.5). BUG-54 could **reuse that
rendering technique** if it existed — but it still needs, and this spec does not provide:

1. A schema change — categories and activities (`categories`/`activities` tables) have no
   colour column today; AD-09 defines them as global seeded lists with no per-user or
   per-entry colour concept at all.
2. A net-new admin UI section — there is no "pick a colour for this category" control
   anywhere in `AdminPanel.tsx` today; `ShadingTab.tsx`'s colour pickers are wired
   specifically to the six shading states, not a generic mechanism categories/activities
   could plug into without their own UI work.
3. A decision AD-09 doesn't currently make: categories/activities are **global**, shared
   across all users — a "colour" on a global, multi-user-editable entry raises the same
   kind of per-user-vs-shared question AD-07/AD-08 already had to resolve for shading and
   companions, and hasn't been asked for categories/activities yet.

Reusing a rendering *technique* is not the same as the feature being free — the schema and
admin-UI work dominate the cost here, and neither is a byproduct of UX-11. BUG-54 stays
parked, exactly as the PO flagged it.

---

## 4. BUG-47 — Auto-populate activities from trip/place content

### 4.1 Why a literal "derive all activities from content" isn't achievable

Activities are a 17-entry free-text list (`ACTIVITIES` in `src/backend/db/seed-data.ts`:
Skiing, Snowboarding, Dining, Hiking, Beach Day, Cooking Class, Wine Tasting, Sightseeing,
Museum, Cycling, Sailing, Surfing, Snorkelling/Diving, Shopping, Live Music/Events, Spa/
Wellness, Other), extensible by any user (AD-09). The only structured, always-present
per-item signal is `item_type` — a 6-value enum (restaurant / hotel / flight / car_rental /
experience / note). Six coarse types cannot disambiguate seventeen specific activities:
an `experience` item could be a ski lesson, a museum ticket, or a wine tour, and nothing in
the item's structured fields says which. There's no cuisine-type-style sub-field on
`experience` items to lean on, and free-text keyword-matching against item names/notes
would be fragile and wouldn't extend to custom user-added activities (AD-09) at all, since
a custom activity carries no keyword mapping.

I'm not proposing keyword matching or a fake "experience → Sightseeing" guess — presenting
a wrong guess as if it were derived is worse than the current empty-by-default state; it
erodes trust in the feature the first time someone's ski trip auto-tags as "Sightseeing."

### 4.2 The design: suggest, don't silently write — modeled on the app's existing IT-07 pattern

This codebase already has a working, tested pattern for exactly this shape of problem —
"offer a data-derived suggestion, let the user explicitly accept or reject it, never
silently apply it" — in IT-07 (carry-forward items: *"the app automatically prompts the
user with those items as carry-forward suggestions. The user can accept or reject each
suggestion individually."*). BUG-47 should use the same interaction principle rather than
inventing a defaulting engine, for two concrete reasons: it avoids the "never overwrite a
user edit" trap this codebase has already had to solve once (IT-11/DP-06's explicit
"a user edit is never overwritten by a subsequent re-defaulting" rule) by never writing
anything without an explicit click, and it's cheaper to build — the interaction pattern
already exists in-app, this reuses it rather than designing a new one.

**Concretely, in the trip's Activities field (both create and edit forms, §5):**
- **Selected** activities render exactly as today (existing filled chip style,
  `chipClass(true)` in `TripForm.tsx`).
- **Suggested** activities render as a **visually distinct, lower-emphasis chip group**
  directly below the Selected row, computed **live** on every render from the trip's
  current items (not stored, not a one-time write) — clicking a suggested chip promotes
  it into Selected (a normal `toggleId` call, same mechanism already used for every other
  multi-select field on this form). Nothing is ever auto-checked or silently added.
- **Derivation table** (item_type → suggested activity), deliberately thin and honest
  about what's derivable today:

  | `item_type` | Suggests | Confidence |
  |---|---|---|
  | `restaurant` | "Dining" | High — unambiguous, matches a seeded activity name exactly |
  | `hotel`, `flight`, `car_rental`, `note` | (none) | Accommodation/logistics/notes aren't activities |
  | `experience` | (none) | Too coarse to disambiguate — see §4.1; showing nothing here is correct, not a gap |

  This is a small, explicit lookup, not a general inference engine — extensible later if a
  more specific structured field is ever added to `experience` items (not proposed here;
  flagging the extension point, not speccing new schema).
- **Suppression:** a suggestion for an activity already present in Selected (whether the
  user added it manually or accepted it as a suggestion earlier) simply doesn't render —
  no duplicate chip, no need to track "was this previously rejected" state, since nothing
  is ever removed automatically either.
- **Trigger/recompute:** the Suggested row recomputes from whatever items exist on the
  trip at the moment the form is open — no background job, no write-on-item-add. This is
  cheap (a `groupBy(item_type)` over already-loaded item data) and sidesteps every
  silent-overwrite risk by construction, since there's no persisted "derived" state to get
  out of sync with a user's manual edits.

### 4.3 Categories are unaffected

Per the brief and PO confirmation, trip categories stay fully manual — nothing in this
section touches `Categories` field rendering or `trip_categories` data.

---

## 5. BUG-46 — Activities selector missing from trip create: fix or delete?

**Fix — do not delete.** Confirmed by walking through `TripForm.tsx`: the selector is
gated behind a single `isEditing &&` condition (line 324,
`{isEditing && activities.length > 0 && (...)}`) — a straightforward parity gap, not
something BUG-47's redesign removes the need for.

**Why BUG-47 doesn't supersede this fix:** the Suggested-chips mechanism in §4.2 is
item-driven, and **no items exist yet at trip-create time** — TR-01 creates a trip with
name/dates/destinations (places), but items (restaurant/hotel/flight/etc.) are logged
afterward from the trip-detail view (`TripItemsSection`, place sections' "+ Add Item").
So even after BUG-47 ships, opening the create form would show an empty Suggested row —
which degrades gracefully to exactly what the plain manual Activities field looks like
today on Edit before any items exist. The manual Selected-chip field is still load-bearing
on create; removing it would be a straight regression (no way to set activities at
creation time at all), not a simplification.

**Fix:** remove the `isEditing &&` gate so the Activities field renders on both create and
edit (same condition as Categories/Companions already use — just `activities.length > 0`).
No new UI needed for this fix in isolation.

**Sequencing — independent of BUG-47:** this fix does not depend on §4's Suggested-chips
design landing first. It can ship immediately as a plain parity fix (create gets the same
manual field edit already has); BUG-47 later adds the Suggested row to both forms at once,
since by then both forms share the same field. COO can order these two briefs either way.

---

## 6. Summary table (cross-reference)

| Item | Verdict | Depends on |
|---|---|---|
| BUG-53 | Spec'd — 2-line place chip (state) + new country row (own row, not merged with category chips) | Small Backend field addition (§1.2), no schema change |
| UX-11 | Spec'd — trip status → shading-state colour mapping (§2.2), applies to both list card and detail header | New contrast-utility (S effort, §2.3); reuses existing `useShadingConfig` pattern (§2.5) |
| BUG-54 | Stays parked — **not** made free by UX-11 (§3) | Needs schema + new admin UI, neither provided here |
| BUG-47 | Spec'd — suggestion-based (not silent-write), item_type-driven, thin but honest derivation (§4) | None — self-contained |
| BUG-46 | **Fix, not delete** (§5) | None — independent of BUG-47, can ship first |

---

## 7. New BRD requirement IDs — reporting only, not adding (COO owns the BRD gate)

Per `CLAUDE.md`'s BRD-gate rule, these need a BRD home before any brief dispatches. My
recommendation, for COO to place/number:

- **BUG-53** → a new sub-requirement under §5.9 (I'd suggest `DP-07`): trip-list card place
  display shows city + region/state (when resolved) per place, plus a deduped, ordered
  country row beneath the place-name row. Success criteria: a place with a resolved region
  shows city (bold) + region on two lines; a place without one shows city only (unchanged
  from today); every place's country appears exactly once in the country row, deduped and
  ordered by first appearance among the trip's places; no horizontal scroll introduced on
  mobile (WP-04 constraint).
- **UX-11** → a new sub-requirement under §5.9, cross-referencing AD-07/MP-04 (I'd suggest
  `DP-08`): trip status pills (list card and detail header) derive their colour from the
  requesting user's own map-shading configuration per the mapping in §2.2, remaining
  correct after that user changes their shading colours in Admin, with no less than
  4.5:1 text contrast against the resulting background regardless of the admin-chosen
  colour. Success criteria: changing a shading colour in Admin (`ShadingTab`) changes the
  corresponding trip-status pill colour on next load, for that user only; a two-user
  isolation check (one user's shading edit never changes another user's pill colours,
  consistent with AD-07's existing isolation guarantee); every combination of the four
  trip statuses against at least one very light and one very dark admin-chosen colour
  passes an automated contrast check.
- **BUG-47** → a new requirement under §5.1 (I'd suggest `TR-16`, next after TR-15):
  trip activities can be suggested from the trip's logged item types (§4.2's table) and
  accepted individually; suggestions never silently write to the trip's activity list;
  trip categories are explicitly out of scope for this requirement (remain TR-03, manual).
  Success criteria: a trip with a `restaurant` item shows "Dining" as a suggested (not
  selected) chip until clicked; accepting it adds it to the trip's activities exactly like
  a manual selection; removing it afterward and adding another `restaurant` item does not
  re-add it (nothing is ever auto-written); a trip with only `hotel`/`flight`/`note`/
  `car_rental` items shows no suggestions.
- **BUG-46** → no new ID needed; it's a conformance fix against the existing TR-04
  ("assign activities to a trip"), which already implies parity between create and edit.

---

## 8. Effort flags for COO (implementation cost, not my call to approve)

- UX-11's contrast utility (§2.3) is the one piece of genuinely new logic in this whole
  spec — small (S), but real; call it out in the Frontend brief rather than bundling it
  as "just reskinning."
- BUG-53's Backend field addition (§1.2) is small but is a **Backend** change feeding a
  **Frontend** spec — the brief needs both agents, sequenced Backend-first (or the same
  PR if COO prefers, but the field has to exist before Frontend can consume it).
- BUG-47 (§4.2) is self-contained frontend logic (a lookup table + a render-time group-by
  over already-loaded item data) — no backend change, no new endpoint.
- BUG-46 (§5) is a one-line conditional removal — trivial, can be its own small PR.
