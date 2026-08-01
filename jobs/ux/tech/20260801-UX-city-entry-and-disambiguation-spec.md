# City entry, disambiguation, and location-status — UX spec

**Author:** UX Designer
**Date:** 2026-08-01
**Status:** Spec — no implementation. Frontend brief downstream, gated on Architect data-model review of §7.
**BRD:** GE-16 (`_project/travel-tracker-BRD.md` §5.2)
**Inputs:** ADL-46 (`jobs/architect/tech/ADL-46-non-owner-access-model.md`), its PO summary
(`jobs/architect/tech/ADL-46-summary-for-PO.md`), current `main` @ `b26c21c`, and the in-flight
`release/adl46-access-model` branch (PR #341, not yet merged — referenced for calibration only,
see §0.1).
**Dispatched deliberately ahead of the Architect** — the brief's framing, which I have followed:
design the experience first; the data model serves it, not the reverse. The existing
`(name, country_code, region_id)` identity model is treated as an input, not a constraint.

---

## 0. Sourcing note — a discrepancy in my brief, resolved

My brief pointed me at `jobs/architect/tech/20260731-ADL46-release-fresh-eyes-review.md` for two
findings (F1: ambiguous lookup auto-picks first candidate; F2: repointing a place doesn't
recompute the stale shared entry's coordinates). **That file does not exist.** Two independent
probes: (1) `find`/`ls` on `jobs/architect/tech/` on my worktree and (2) `git ls-tree -r` against
both `origin/main` and `origin/release/adl46-access-model` — neither lists a file by that name or
date. This is not upgraded to "the content doesn't exist" — it doesn't, under a two-probe negative
finding, but the **content itself is real** and I traced it to
`jobs/architect/tech/ADL-46-non-owner-access-model.md` §4.3.1 (D12, the wrong-match problem) and
§4.4.3 (the stale-Springfield-Illinois lifecycle, lines ~1001–1008) — matching the brief's
description almost verbatim. I've worked from that source. Flagging the filename mismatch to COO
in my completion report rather than silently substituting.

### 0.1 What's already shipped vs. what I'm designing

`main` today (what I audited and am designing against) has **no** ADL-46 behaviour: two city
states only (`pending`/`resolved`, no `unresolvable`), a client-side single-guess Nominatim call,
no region-aware disambiguation, and no place-level city correction endpoint. The in-flight
`release/adl46-access-model` branch (PR #341, Frontend stage, not yet merged to `main`) has
already shipped a **UX-unreviewed** minimal version of one piece of this: it narrows the existing
region `<select>` to ambiguous candidates with inline hint text ("multiple matches found, please
choose") when Springfield-style ambiguity occurs within one country. That's D14's mechanism,
implemented literally and correctly, but built with no UX pass — exactly the situation this brief
exists to prevent recurring. My §3.3 below refines that same control (labelling, ordering,
grouping) rather than replacing it — Frontend gets a small follow-up diff, not a rewrite, once
this spec is approved. This does not block PR #341's merge.

---

## 1. Framing: three-tier precedence, stated once, applied everywhere

Every auto-suggestion in this flow — country, region, coordinates — is governed by one rule,
adopting the COO's proposal outright because it is the correct generalisation of what GE-16
already mandates for coordinates:

1. **Explicit user selection always wins and is never silently overwritten.** GE-16 already
   requires this for country/region against geocoding; I extend it as the universal rule for this
   whole surface.
2. **Trip-level context (the trip's associated countries) narrows *suggestions and ordering*
   only, never *availability*.** Nothing the user could otherwise pick is ever removed.
3. **Unconstrained discovery** (today's plain single-guess lookup) is the fallback when neither
   of the above applies.

This is the spine the rest of the spec hangs on. Every "shortlist" below is tier 2; every
"always editable, always visible" is tier 1.

**A grounding check on tier 2, because I was wrong about it once mid-investigation and want the
correction on record rather than silently fixed:** I initially assumed `trip_countries` was
theoretical — a schema-only concept with no way for a user to populate it — because a grep for the
Drizzle symbol `tripCountries` across `src/frontend` returned nothing. That's a **naming-mismatch
miss**, the exact failure mode CLAUDE.md's negative-findings rule warns about. A second probe
(reading `TripForm.tsx:51–68, 199–261`) found a fully-built, working "Countries" multi-select
(chips + inline search, optional field) that submits `country_codes` on trip create/edit. **Tier 2
is immediately usable, not a prerequisite follow-on.** It's optional and will often be empty for a
spontaneous trip — the design below must degrade to tier 3 gracefully when it is, not treat an
empty set as an error or nag the user to fill it in.

---

## 2. Current-state audit (main, pre-this-spec)

| Surface | File | State |
|---|---|---|
| City search | `AddPlaceFlow.tsx:272–306`, `useCities.ts:73–81` | Debounced (300ms), full unfiltered result list already shown (no artificial narrowing) — the "shortlist, never filter to zero" spirit already holds here. Result rows show only `name` + `country_code` — **no region**, so two same-name/same-country cities (once D13 permits them) are visually identical in this list. |
| New-city form | `AddPlaceFlow.tsx:350–478` | Raw Tailwind (`teal-600`, `gray-300`, etc.) — **not migrated to Waypoint tokens.** Country/region auto-fill fires a single client-side Nominatim call with `limit=1` on form open (`handleOpenNewCityForm`, `useCities.ts:37–60`) and silently sets both fields from one guess, no country constraint, no user-visible "this is a guess" signal. This is the literal mechanism behind the Rome-Italy-vs-Rome-Georgia and first-candidate-Springfield failure modes. |
| Map pins | `CityMarkers.tsx:52–57` | Confirmed by reading `buildCityGeoJSON`'s filter condition and the file's own header comment: **only `geocode_status === 'resolved'` cities render a pin. A `pending` city produces zero visual trace on the map.** No affordance exists anywhere for "N places aren't on the map yet." |
| Country/region shading | `CountryLayer.tsx`, `RegionLayer.tsx` | Keyed on `country_code`/region only — confirmed independent of city coordinates. A pending city's country still shades normally. |
| Place display | `PlaceSection.tsx:140–163` | Shows city name (links to `/cities/:id`) + country name subtitle. **No location-status indicator of any kind**, and **no UI control to re-point a place's city** — the GE-16 correction mechanism has zero surface here. |
| Cross-trip city view | `CityItemsPage.tsx` (IT-09, built by an implementation agent with no UX spec, per brief) | Assessed fully in §6. |
| Place PATCH | `places.ts:131–179` on `main` | Accepts only `arrived_on`/`departed_on`. **No `city_id` field — the re-point capability does not exist on `main` today.** It exists on `release/adl46-access-model` (`places.ts:141,154` there), per D11, not yet merged. My §5 design consumes that once it lands; no new backend request from me. |

---

## 3. The end-to-end flow

### 3.1 Search (minimal change)

Keep the existing debounced catalogue search and its "show everything, filter nothing" behaviour
— it already satisfies the shortlist-plus-full-list spirit at this step. Two additions:

- **Show region when the result has one:** `Springfield — Illinois, US` not `Springfield US`. This
  is the minimum needed once D13 legalises same-name-different-region duplicates; without it the
  search results are ambiguous exactly where they most need not to be. *(Data implication — §7.)*
- **Label a result that is the searching user's own private draft.** A `pending` or
  `unresolvable` city is only ever visible in its creator's own search (GE-16) — so if one appears
  here, it is always *this user's own*, never a stranger's. Tag it inline, small and muted:
  `Springfield — Illinois, US · confirming location`. This prevents the single most likely
  duplicate-creation mistake: re-searching a name in a later session, not recognising your own
  in-flight draft, and creating a second row for the same trip.
- **Order, don't filter, by trip countries (tier 2).** When the trip has associated countries
  (`TripForm`'s Countries field), results whose `country_code` is in that set sort first. Nothing
  is hidden or removed — this is ordering only, consistent with the PO's explicit instruction that
  trip countries "drive autofill and proposed options only — never restrict."

"+ Add new: `{query}`" stays pinned at the end of the list, unconditionally available, exactly as
today.

### 3.2 New-city form — country (the fix for cross-country ambiguity)

**Decision: the country field is never auto-committed without the user seeing and confirming it as
a suggestion.** This is the answer to Rome-Italy-vs-Rome-Georgia, and it is a pure frontend
sequencing fix — it needs no backend change and does not depend on D12's server-side country
constraint at all, because it prevents the ambiguity from ever reaching the geocoder in the first
place.

Concretely, replace `handleOpenNewCityForm`'s current behaviour (`AddPlaceFlow.tsx:191–209`) with:

1. **Pre-select using tier 2 first.** If the trip has exactly one associated country, pre-select it
   in the dropdown outright (ranking a list of one is meaningless — just pick it). If it has two or
   more, group the dropdown with a native `<optgroup label="This trip">` holding those countries at
   the top, then `<optgroup label="All countries">` for the rest — the PO's shortlist-plus-full-list
   pattern, using the exact native control it was proposed for. No new component.
2. **If the trip has no associated countries (tier 3, the common case for a spontaneous trip),**
   fall through to today's single-guess lookup — but render it as a **visibly tentative** default,
   not a silent fill: a small `Suggested` chip/caption directly under the dropdown, e.g. `Suggested:
   France — from "Rome"`. It still fires on name-commit (blur or opening the form with a name
   already typed), never per-keystroke, so it respects the rate-limit constraint unchanged.
3. **The dropdown itself is always a normal, fully-populated, freely-changeable `<select>`
   regardless of which of the above set its value.** Nothing about this design ever removes the
   user's ability to pick any country — only what's pre-selected or listed first changes.

**Why this and not a smarter geocoder query:** any solution keyed on improving the *geocoder's*
country guess still produces a single silent answer the user has to notice is wrong. A form field
whose current value is visibly a suggestion, sitting inside a control the user was already going to
look at to add a city, is cheaper to build and impossible to walk past unnoticed in the way a
filled-in-and-forgotten field is.

### 3.3 New-city form — region (refines the D14 mechanism already shipping)

D14 (ADL-46 §4.3.2) already decided the right shape and PR #341 already built it: reuse the
existing region `<select>`, populate it with the geocoder's candidates instead of auto-picking
`[0]`, no new component. I'm not proposing to replace this — I'm specifying the labelling and
grouping it shipped without, since no UX pass touched it:

- **Distinguishing label, not a bare region name.** `Springfield — Illinois` /
  `Springfield — Missouri`, not two "Illinois" / "Missouri" entries indistinguishable from a normal
  region picker — the whole point is that this is a *disambiguation*, and the UI should say so.
- **Placeholder text changes to signal ambiguity, not optionality.** Today's default
  ("No region selected") reads as "this field is optional, skip it." When multiple geocoder
  candidates are on offer, the placeholder becomes `Multiple matches — choose one` so the user
  understands *why* the dropdown suddenly has unfamiliar-looking entries, rather than reading it as
  a normal optional field they can ignore.
- **Zero candidates or a single unambiguous one:** unchanged from what's shipping — auto-select on
  exactly one, leave blank (creates `pending`) on zero.
- **Dismissing/ignoring an ambiguous choice still creates the place**, per GE-16's explicit success
  criterion — this is already true of the shipped mechanism; restating it so Frontend doesn't
  "fix" it into a blocking requirement later.

I have no changes to the backend contract here — this is presentation-layer only, on top of what
D14/PR #341 already returns.

### 3.4 What the user sees immediately after creating an ambiguous or unresolved city

This is the gap neither the current implementation nor D14 addresses: **the three states are
invisible at the exact moment they're created**, which is when setting the right expectation costs
the least. On successful city+place creation, the confirmation the user already sees (today: the
modal just closes, or shows warnings per `AddPlaceFlow.tsx:230–259`) gets one addition based on the
returned `geocode_status`:

| Status | What the user sees on creation |
|---|---|
| `resolved` | Nothing extra — the happy path stays silent, as it should (feedback for a success that needs no action is noise). |
| `pending` | A single non-blocking line before the modal closes: *"Added — still confirming this location. It's saved to your trip and only visible to you until then."* Sets the private/temporary expectation up front rather than leaving the user to discover a missing pin later and wonder if something broke. |
| `unresolvable` | Same moment, distinct tone: *"Added — we couldn't find this location. It's saved and only visible to you; you can point it at a different city any time from the place."* This is the **only** state that never self-resolves (never retried), so telling the user *now* that action, not patience, is what fixes it, matters more here than anywhere else in the flow. |

Both non-`resolved` messages are informational, not alarms — nothing failed from the user's
perspective, the place was added successfully in both cases, per the hard constraint that city
creation never blocks on geocoding.

---

## 4. Explicit answers (per the brief's requirement)

### 4.1 Pin vs. no pin

**No pin when there are no coordinates — a fabricated pin is worse than none.** I considered and
reject placing a pin at a fallback location (region or country centroid): it would be wrong for
100% of such pins, every time, in a way indistinguishable on the map from a correct one — strictly
worse than the Springfield-Illinois-labelled-Missouri bug, which is at least sometimes right. A
missing pin at least admits it doesn't know; a fabricated one lies confidently.

**But silent omission is also rejected, for the reason the COO's framing gives:** a user cannot act
on an absence they can't see, and `unresolvable` is permanent, not a loading state — there has to be
a way to *find and fix* it, not just wait.

**Decision: a single, count-based, expandable affordance next to `MapLegend`, never an individual
placeholder pin.** A small chip: `2 places not yet located`. Clicking expands a short list — one
row per affected place, each showing the city name, its trip, and a coloured status dot (neutral =
`pending`/"still confirming", the new `unlocated` hue = `unresolvable`/"location not found," with an
inline `Fix →` on the latter that navigates to that place, where §5's "Change city" control lives).

Why one combined affordance and not two separate ones (e.g. a `pending` counter and an
`unresolvable` counter): two small counters competing for the same sliver of map-adjacent space is
exactly the "nothing fights for attention equally" violation my role won't tolerate — one entry
point, status differentiated inside the list it expands to, is calmer and just as informative.

**Why this doesn't feel like "nothing happened":** the country a pending/unresolvable city belongs
to still shades correctly (`CountryLayer`/`RegionLayer` key off `country_code`/region, independent
of coordinates — confirmed by reading both files). The user planning a trip to a not-yet-located
city still sees their country highlighted; only the precise dot is missing, and the new affordance
says exactly that rather than leaving a silent gap.

**Data source: no new endpoint.** `CityMarkers.tsx` already has every loaded trip's
`place.city.geocode_status` in hand (it's what the resolved-only filter reads today) — the
unlocated-count list is the same data, inverted, computed client-side. Confirmed by reading the
existing filter; no backend change implied here.

### 4.2 Canonicalisation surfacing

**Decision: no canonical-name-plus-aliases data model. The catalogue's name is the geocoder's
canonical name, shown to everyone, with one non-blocking, one-time disclosure at the moment it
first diverges from what the user typed.**

I considered the alias alternative (store the user's typed spelling as a personal display override
of a shared canonical row) and reject it for this pass:

- It is real, ongoing complexity — a new table, a per-user override join on every surface that
  renders a city name (search results, place cards, `/cities/:id`, the map's `text-field`), for a
  want that is fundamentally cosmetic.
- It actively works against the reason canonicalisation exists at all: the whole value of
  resolve-then-create (ADL-46 D5) is convergence — many spellings collapsing onto one row. If each
  user then sees their own spelling back, two users looking at the same shared catalogue entry for
  the same real place could disagree in the UI about its name, which is a worse confusion than the
  one it would fix.
- Real divergence beyond case/whitespace is rare in practice and usually a genuine correction
  (`Denverr` → `Denver`), not a translation — **except** for the small number of cases the geocoder
  legitimately answers in the local language (Rome → Roma, Munich → München), which is the one
  case worth softening.

**The disclosure, concretely:** compare the request's `name` to the response's `name` (already
available client-side — no schema change). When they differ by more than case/whitespace, show one
inline, dismissible line at the same creation-confirmation moment as §3.4: *"Saved as 'Roma' —
OpenStreetMap's name for this city."* Once. Never repeated on subsequent views of the same city.

**One thing worth flagging to Backend/Architect that materially reduces how often this fires, not
a UX decision itself:** request the geocoding service with an English-preferred locale parameter
(Nominatim's `accept-language=en`) rather than accepting whatever language the service defaults to.
This turns most of the residual divergence cases from translations (surprising) into spelling
corrections (unsurprising), without touching the UX design above. *(Implementation-parameter note,
not a data-model implication — flagged in §7 for completeness.)*

### 4.3 Disagreement between user and geocoder

Per ADL-46 D5/D12: whatever the user selects is geocode-checked; agreement promotes to `resolved`;
disagreement leaves the row `pending` — usable, private, no pollution. **What the user sees in the
disagreement case is exactly §3.4's `pending` message — no separate UI is needed.** From the user's
point of view, "the geocoder didn't confirm what I picked" and "the geocoder hasn't answered yet"
are the same experience: their choice was accepted, the place was created, nothing is blocked, and
the record will either resolve quietly later or sit as their own private draft indefinitely. Giving
disagreement a *different* message than a not-yet-attempted lookup would imply a distinction
(*"you might be wrong"* vs. *"we haven't checked yet"*) that the user cannot act on differently
either way — the only available action in both cases is the same "Change city" control, so the
messaging should be the same too. I'm deliberately not building a "the geocoder disagrees with you"
alarm state; it would be new UI for a distinction that changes no action.

---

## 5. Ongoing visibility + the correction entry point (fills the GE-16 gap)

**The GE-16 correction right ("the user who created a place can correct it at any time") is not
conditional on location status** — it applies to a `resolved` city that's simply wrong (the
residual risk ADL-46 §4.3.1 accepts: one geocoder candidate, internally consistent, still the wrong
place) exactly as much as to a `pending`/`unresolvable` one. So the control must be **always
present**, not hidden behind a status badge — the badge is what draws attention to it, not what
gates its existence.

**In `PlaceSection.tsx`'s header** (next to the existing city name link at `:144–150`):

- **A small, always-visible "Change city" affordance** — the pencil/edit glyph already in the
  Waypoint icon set (§3, `20260721-UX-waypoint-spec.md` — "edit/pencil," currently used for the
  mobile trip-detail Edit entry point), `aria-label="Change city"`. Same visibility rule as the
  existing Remove-place control: hidden/disabled when `isLocked`.
- **Opens the same search-and-create UI as Add Place**, reused as a shared component parameterised
  by an `onSelect` callback: Add Place creates a new place; Change City calls `PATCH
  .../places/:placeId` with `city_id` instead (the D11 capability, already implemented on
  `release/adl46-access-model`, not yet on `main` — see §0.1/§7). This is an implementation-cost
  call, stated because my persona doesn't spec expensive things without a reason: building a second
  search-and-disambiguate UI from scratch for this would duplicate every rule in §3, and there's no
  design reason for the two flows to look different.
- **A location-status badge**, shown only when non-`resolved` (silence is the `resolved` state, per
  §3.4's reasoning): reuses the existing `StatusBadge`/`BADGE_HUE_CLASSES` mechanism
  (`design/badges.ts`) rather than inventing a new badge component.
  - `pending`: reuse the existing **`locked` hue** (`wp-status-locked-bg`/`-text`, neutral
    grey, hue 80) — already used for a subdued, non-alarming, "not yet active" state (trip
    status Locked, item status Consider); the semantic fit is direct. Label: `Confirming
    location`. A small CSS-only pulsing dot, no new icon asset. Non-interactive (no click target
    on the badge itself — the standing "Change city" control next to it is the action, if the
    user wants one, though nothing requires it).
  - `unresolvable`: **new hue needed** — none of the eight existing hues is free without semantic
    collision (255/indigo is already category chips, which sit in this same header region; 75/amber
    is already trip-status Active). Propose `unlocated`, hue 45 (orange), following the documented
    recipe exactly: `--color-wp-status-unlocated-bg: oklch(94% 0.03 45)`,
    `--color-wp-status-unlocated-text: oklch(40% 0.12 45)`. Sits between red (25, Cancelled) and
    amber (75, Active) with clean separation from both. Label: `Location not found`. Icon: the
    **existing** location-pin glyph from the Waypoint icon set (already used as brand mark / Map
    tab / empty-state icon), recoloured to the new hue's text token — no new SVG asset. **This
    badge is itself the "Fix →" shortcut** — clicking it opens the same Change City control as the
    pencil icon (they're two entry points to one action, not two different actions).

**Cost flag to COO, per my persona's obligation to name new tokens rather than assume them free:**
one new badge hue (two CSS custom properties + one `BadgeHue` enum entry + one `BADGE_HUE_CLASSES`
row) — no new npm dependency, no new component, genuinely small, but it is a new design token and I
name it rather than fold it in silently.

---

## 6. `/cities/:id` (CityItemsPage) — assessment and required additions

**As built, it's a solid foundation for the wrong scope.** It does the one thing IT-09 asked for
correctly — cross-trip rated items, sort/filter parity with the trip-level view, per-item trip
attribution — and it already uses Waypoint tokens properly (`wp-ink`, `wp-bg-page`,
`wp-border-soft`, `wp-primary-subtle`, etc.), unlike `AddPlaceFlow.tsx`. It reuses existing shared
components (`RatingSortFilterControls`, `RatingStars`, `LoadingSpinner`, `ErrorMessage`) rather than
reinventing them. No complaint about craft.

**Where it falls short of what this spec now needs it to be — the "natural home" framing in the
brief is right, and this page has to grow into a city profile, not stay an items list with a city
name pasted on top:**

1. **Real defect, not just a missing feature: the header has no stable data source.** City
   name/country come from React Router `location.state` (`CityItemsPage.tsx:35–38, 79–80`), which
   is empty on a direct link, a refresh, or a bookmark — degrading to a bare "This city" heading
   (`:106`). A page reachable by URL that loses its own subject on refresh is a defect regardless of
   this spec; it just becomes more visible once the header needs to carry more (see below). Fix:
   the page needs its own data fetch for city metadata (name, country, region — same information
   `GET /api/cities/:id` already returns per `cities.ts:195–217`), not router state as the source of
   truth. Router state can remain a fast-path hint to avoid a flash of "This city" while the fetch
   is in flight, but it must not be the only source.
2. **No location-status surfaced at all.** Given §5 puts the *action* at the place level (a city can
   be reached from several places/trips, so there's no single unambiguous place to redirect a fix
   to from here), this page's job is to *inform*, not *act*: show the same badge treatment as §5
   (read-only — no pencil icon here) plus, when non-`resolved`, one line pointing back to where the
   action lives: *"This location hasn't been confirmed yet. You can fix it from any place using this
   city — look for the pencil icon next to the city name."* **Do not add a city-editing form to this
   page.** That would blur the tier boundary ADL-46 draws deliberately — catalogue curation stays
   owner-only (tier 3), the user's own correction is place-scoped (tier 2, via D11) — and there's no
   backend capability for a direct city-level PATCH by a non-owner to build against.
3. **Cheap, worthwhile addition: "Visited on N trips."** The data is already in the items response
   (`item.trip_name`/`trip_start_date` per item) — a one-line count in the header costs nothing and
   answers a question the page currently makes the user count out by scrolling.
4. **No map/coordinate preview.** Explicitly a "nice to have, not required" call, not an oversight:
   a small static thumbnail would reinforce "this is a confirmed real place" for a `resolved` city,
   but per my role's stance against dead white space, it only earns its space if it's dense — a
   full-width empty-feeling map hero is not worth it for one pin. If Frontend has room, a small
   fixed-size inline thumbnail next to the country/region line is the right shape; if not, cut it
   without regret — nothing else in this spec depends on it.

---

## 7. Data-model / API implications — for the Architect

Everything in this section is something my design needs that I did not verify as already
supported, or a place I deliberately declined a change others might expect. None of it is mine to
design further.

1. **Region name in city-facing responses.** `City` (`types/api.ts:97–108`) carries `region_id` and
   `region_iso` but no human-readable `region_name`. §3.1's search-result labelling
   (`Springfield — Illinois`) and §3.3's disambiguation dropdown both need it. Precedent exists:
   `country_name` was added to trip-detail city responses for exactly this reason (D-04, referenced
   in `PlaceSection.tsx:12`) — this is the same gap one level down, surfacing now because D13
   legalises the duplicate names that make the region label load-bearing rather than decorative.
2. **A stable city-metadata source for `/cities/:id`.** §6 item 1 needs the page to fetch city
   name/country/region/`geocode_status` independent of router state. `GET /api/cities/:id`
   (`cities.ts:195–217`) already returns this per ADL-46 §4.4's note that it's deliberately
   uncontained — confirm the response shape covers what the header needs, or extend it. This is
   likely a small addition to an existing route, not new architecture.
3. **No new city state.** Everything above fits inside the existing three states BRD GE-16 already
   mandates (`resolved`/`pending`/`unresolvable`). I am explicitly **not** requesting a fourth status
   to distinguish "geocoder confirmed" from "geocoder didn't confirm but user's choice stood" (the
   disagreement case, §4.3) — I designed the UI to need no such distinction, which happens to match
   ADL-46's own stated position (§4.3.1: "no actor can perform that transition until the owner
   repair surface exists," a sequencing argument, not a headcount one). Recording the agreement so
   the Architect doesn't read my silence on this as an oversight.
4. **No alias/canonical-name-plus-display-override table.** §4.2 explicitly rejects this. If the
   Architect independently sees value in it for a reason outside this spec's scope, that's a fresh
   decision, not something my design is asking for.
5. **The Change City control (§5) needs no new backend work beyond what ADL-46 D11 already
   specifies.** `PATCH /api/trips/:tripId/places/:placeId` accepting `city_id` exists on
   `release/adl46-access-model` (`places.ts:141,154` there) but not yet on `main`
   (`places.ts:131–179` on `main` only accepts dates). My design is written against the shape D11
   already defines — flagging the dependency explicitly rather than assuming it's live everywhere.
6. **English-preferred geocoder locale (§4.2), an implementation parameter, not a schema
   change.** Passing `accept-language=en` (or the requesting user's locale) to Nominatim. Named
   here so it isn't lost between a UX spec and a backend brief; it's a one-line request-parameter
   change to whichever service call ADL-46's proxy (D7) makes.
7. **New Waypoint design token, not a schema implication but named for completeness:** the
   `unlocated` badge hue (§5) — two CSS custom properties and one enum entry, no new dependency.

---

## 8. What I rejected, and what I'm ratifying with a caveat

**Ratified as proposed, no change:**

- **Agreement promotes to resolved** (PO) — consumed directly in §3.4/§4.3, no UI change needed
  beyond the messaging I've specified.
- **Three-tier precedence** (COO) — adopted as the spec's organising principle (§1), not just
  applied once.

**Ratified with a refinement, not a rejection:**

- **Shortlist-plus-full-list via `<optgroup>`** (PO) — adopted for both the country field (§3.2,
  new application) and the region field (§3.3, refines what D14/PR #341 already shipped). The
  refinement is labelling and grouping semantics, not the mechanism, which was already correct.
- **Trip countries constrain autofill/proposed options only** (PO) — adopted, with the corrected
  grounding from §1: this is immediately usable (a working UI already sets `trip_countries`), not
  a future dependency, but it is optional and commonly empty, and the design must not read an empty
  set as an error.

**Rejected:**

- **A canonical-name-plus-aliases data model** (the open question the brief specifically asked me
  to answer). §4.2: no. The one real problem it would solve (translations reading as surprising) is
  better and more cheaply solved by requesting an English-preferred geocoder locale.
- **A fabricated placeholder pin** (region/country centroid) for cities with no coordinates. §4.1:
  worse than no pin — wrong 100% of the time rather than some of the time, and visually
  indistinguishable from a correct pin.
- **Two separate map counters** (one for `pending`, one for `unresolvable`) instead of one combined
  affordance. §4.1: unnecessary competition for the same screen real estate; one entry point with
  status differentiated inside serves the same information need.
- **A city-editing form on `/cities/:id`.** §6: would blur the tier-2/tier-3 boundary ADL-46
  deliberately draws and has no backend capability to build against for a non-owner.
- **A separate "disagreement" alarm state distinct from `pending`'s messaging.** §4.3: the user
  cannot act on the distinction differently either way, so a second message would be new UI for no
  new decision.

---

## 9. What I could not verify

- **Live geocoding behaviour** (candidate ranking, actual Nominatim response shapes for
  `addressdetails`/`accept-language`) — this devcontainer's firewall allows only GitHub, npm, and
  Anthropic (confirmed by the brief and by the ADL-46 Frontend stage's own completion report
  logging repeated `[GEO] Nominatim request failed: fetch failed` in its E2E run). Everything above
  involving geocoder response shape is designed against ADL-46's documented contract, not a live
  call. **UNVERIFIED**, consistent with the brief's own note that this can't be exercised from here
  — recommend confirming candidate labelling/ordering against real Nominatim responses during the
  ADL-46 UAT pass already planned for staging.
- **Whether `GET /api/cities/:id`'s current response already includes everything §7 item 2 needs**
  (I read the route's existence and its deliberate lack of containment, not its full response
  schema in detail) — stated as a probable small addition, not confirmed exhaustively.

---

## 10. Success criteria (for QA / Frontend DoD)

- A city search result for a name matching two regions in the same country shows both, distinguished
  by region label, never indistinguishable.
- Opening "Add new city" never silently commits a country the user hasn't seen; a tier-3 fallback
  guess is visibly marked as a suggestion and remains a normal editable dropdown.
- Creating a `pending` or `unresolvable` city shows the corresponding message from §3.4 before the
  flow closes; creating a `resolved` city shows nothing extra.
- A place whose city is `pending` or `unresolvable` shows the corresponding badge in
  `PlaceSection`; a `resolved` place shows none.
- The "Change city" control is visible and functional on every unlocked place regardless of its
  city's status, and hidden/disabled when the trip is locked, matching the existing Remove-place
  visibility rule.
- The map shows an "N places not yet located" affordance whenever at least one loaded place's city
  is non-`resolved`; expanding it lists every such place with a working link back to it; the
  affordance is entirely absent when the count is zero (not a "0 places" state).
- `/cities/:id` renders its correct name/country/region on a direct link or refresh, with no
  dependency on router state.
- A city name divergent from what the user typed (beyond case/whitespace) shows the one-time
  disclosure from §4.2 exactly once per creation, never on subsequent views.
