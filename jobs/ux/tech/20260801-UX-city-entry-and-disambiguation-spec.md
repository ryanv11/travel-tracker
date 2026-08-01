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

**Addendum (2026-08-01, same day, two follow-up COO messages):** §§1–10 above are the original
spec and stand unchanged except where explicitly marked. Two sections were added after review:
**§11** answers "how does a user actually resolve an unlocated place" — a single recommended
design (not a menu), with four worked flows using named examples, per explicit PO instruction.
**§12** scopes an MVP against the PO's revised framing that this is likely edge-case territory
until real usage data exists, and states plainly what is and isn't safe to cut. §11 is the design
of record for when the fuller version is picked up; §12 is what I'd actually ship first. §5's
badge design is superseded/extended by §11 — see the note there.

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
  design reason for the two flows to look different. **§12.1 verifies the exact extraction target
  and the schema this rides on** — the `city_id` field on `UpdatePlaceDatesSchema` is real and
  already implemented, but I looked further and concluded it shouldn't be reached by extending the
  existing `PlaceDateForm.tsx`; see there for why and for what the minimal version actually is.
- **A location-status badge**, shown only when non-`resolved` (silence is the `resolved` state, per
  §3.4's reasoning): reuses the existing `StatusBadge`/`BADGE_HUE_CLASSES` mechanism
  (`design/badges.ts`) rather than inventing a new badge component.

  > **Superseded/extended (2026-08-01) by §11 and §12 — retained for history, do not build from
  > this bullet directly.** The two-state version below (a plain `pending` vs. `unresolvable`
  > split) was my first pass. §11 refines it into a three-bucket model that distinguishes *why* a
  > place is unresolved down to the point where the remedy actually differs, driven by a
  > follow-up COO/PO conversation that specifically asked for a single, worked resolution design
  > rather than a badge taxonomy alone. §12 then scopes an MVP that ships something **smaller**
  > than even this original two-state version — one undifferentiated badge, zero new hues. The
  > `unlocated` hue named below survives into §11's fuller design (Bucket C) unchanged; it is
  > **not** part of §12's MVP.

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

**Added 2026-08-01, from §11's fuller design — deferred per §12, not required for MVP, named here so
they aren't lost:**

8. **A persisted candidate-region list on an ambiguous city row** (§11.4) — e.g.
   `cities.ambiguous_region_isos`, nullable JSON array of ISO 3166-2 codes, written when
   `classifyCandidates` returns `multi-region`, cleared on resolution. Needed only for §11's Bucket
   B one-tap picker; not needed for §12's MVP badge, which reads only the already-planned
   `geocode_status`/`geocode_attempts` fields.
9. **A place-level "location gap dismissed" marker** (§11.7's Dismiss) — a nullable flag/timestamp
   on `trip_places`, scoped to the place (not the city, since dismissal is "I don't need a pin for
   *this* visit," not a statement about the shared catalogue row). Deferred with the map counter per
   §12.3 — no shipping surface needs it yet.
10. **`GET /api/cities/:id` (and the trip/place responses that embed city data) would need to
    return item 8's field** once Bucket B ships, so the picker can render without an extra round
    trip. Not required for MVP.

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

**Added 2026-08-01, from the follow-up conversation:**

- **A user-authored, catalogue-private pin ("drop your own pin").** §11.3: agreed with the COO's
  rejection on my own reasoning, not just deference — it's the same catalogue-drift mistake as the
  alias-name rejection above, dressed as geography instead of spelling, and it doesn't fit the
  three-remedy taxonomy as a fourth path without duplicating what re-pointing already provides.
  Named the one place the COO's argument is weaker than stated (effort-comparison, for the
  terminal case specifically) so the record shows a considered agreement, not a rubber stamp.

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
- **How often any of this actually happens in production — UNVERIFIED, and it's the reason §12
  exists.** `geocode_status` has no production data yet (it ships on migration `0015`, integration
  branch only, not deployed — confirmed via the F1/F2 ruling doc, not re-derived independently here
  since it's the same fact the COO's relay stated and I have no separate way to check a column that
  doesn't exist on a deployed database). Separately, the F1/F2 ruling establishes that a real share
  of today's *shipped* ambiguity is itself a bug (multiple same-region Nominatim hits at different
  granularities, not genuine ambiguity) that's being fixed on the integration branch — so even the
  *pre-fix* rate would have overstated the true one. Both facts point the same direction: **treat
  this whole feature's urgency as unmeasured, not as "probably small" or "probably large."** §12
  scopes accordingly rather than guessing.

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

> **Scope note added 2026-08-01:** the badge criterion above and the map-counter criterion are
> **full-design** criteria — see §12.5 for the smaller set that actually gates MVP shipping. Every
> other criterion in this list (search labelling, the country-suggestion rule, creation-time
> messaging, the standing Change City control, `/cities/:id`'s refresh fix, canonicalisation
> disclosure) is unaffected by the MVP scoping and holds as written.

---

## 11. Resolving an unlocated place — the recommended design

This section answers a question §5 didn't: once a badge tells a user something is unresolved, how
do they actually fix it, differently, depending on *why*? Written after a follow-up conversation
that specifically asked for one recommended design, shown as worked flows with named examples, not
a list of options. **This is the design of record for the fuller version of this feature** —
§12 scopes what of it ships first.

### 11.1 The structural question: must the cause be visible?

**Confirmed, with one refinement: cause must be visible only down to the point where the remedy
changes — no finer.** Three remedies exist, not one generic "fix this":

1. **Wait — nothing to do.** The lookup hasn't produced a usable answer yet, for a reason with no
   user-facing action (not yet attempted, the service was unreachable, or the user's own selected
   region genuinely can't be confirmed by the candidates found). Retrying is the only thing that
   helps, and the backend already does that on its own schedule.
2. **Pick — a one-tap answer already exists.** The lookup found more than one real candidate and
   didn't guess. The alternatives are already known; the user just has to choose.
3. **Re-point or let go — retrying will never help.** The geocoder has definitively answered "no
   match," or the row has been asking the same unanswerable question for so long that continuing
   to call it "still confirming" would be dishonest.

I looked at the backend's actual disposition space (`jobs/architect/tech/20260801-ADL46-F1-F2-
ruling.md`, R2) to check this against real granularity, not just my own taxonomy. The backend
distinguishes **four** internal outcomes at classification time — `unresolved` (zero candidates),
`ambiguous`/`multi-region` (no region chosen, several found), `ambiguous`/`region-unconfirmed` (the
user's chosen region didn't match), and `ok` — plus, orthogonally, whether an attempt was ever
network-successful at all. **That's more distinctions than the three remedies need.**
`region-unconfirmed` sits in remedy bucket 1, not 2: the user already gave the only input they have
to give (their region choice), there is no second candidate to offer them instead, and GE-16
forbids overriding what they picked anyway — so despite being technically "ambiguous," it has
nothing in common with the case where a genuine pick is available. Collapsing it into "wait" isn't
a simplification for its own sake; showing a picker with no real alternative in it would be a
control that does nothing, which is worse than not showing one. This is the same principle §4.3
already applied to the user/geocoder disagreement case — a distinction that doesn't change the
available action doesn't earn separate UI.

**Concretely, three user-facing buckets, mapped from backend state:**

| Bucket | Backend state | Badge label | Available action |
|---|---|---|---|
| **A — Still confirming** | `pending`, not ambiguous (unattempted, network failure so far, or `region-unconfirmed`) | `Confirming location` | None required. Standing Change City always available. |
| **B — Choose to confirm** | `pending`, ambiguous with `reason: 'multi-region'` and a persisted candidate list (§11.4) | `Which one? — N matches` | One-tap pick from the persisted candidates. |
| **C — Can't confirm** | `unresolvable` (terminal), **or** `pending`/multi-region past the retry cap (§11.3) | `Location not found` | Re-point (ideally to a nearby catalogued city) or dismiss. |

### 11.2 A promotion rule the backend ruling makes necessary: exhausted retries read as Bucket C

The backend ruling is explicit that an ambiguous row is **never** marked `unresolvable` — it stays
`pending` forever once its retry budget (`geocode_attempts`, capped at 5, ADL-46 F1/F2 ruling §2.5)
is spent, because "no match" and "nobody ever answered the region question" are genuinely different
facts and only the first is permanent. That's the right backend rule. **It is the wrong UI rule
applied unmodified**: a row stuck at `attempts = 5` is, to the user looking at it, indistinguishable
from one that will keep trying — except that it never will again. Telling them "still confirming"
at that point is not hedging, it's inaccurate. **The frontend must treat `pending` +
`attempts >= CAP` the same as Bucket C**, purely as a display rule — no backend or schema change,
since both fields already exist (or will, once the F1/F2 ruling's fields land). This is the one
place in this design where I'm asserting a UI rule stricter than the backend's own state model, and
I'm stating why rather than leaving it implicit.

### 11.3 The dropped-pin idea: I agree with the COO's rejection, with one nuance

Asked explicitly whether I'd overturn it. I don't, and I want to give the reasoning rather than
just concur:

- **The BRD-carve-out cost and the catalogue-drift cost both stand on their own** — either alone is
  enough. Catalogue drift in particular is the same shape of argument I already used to reject a
  canonical-name-plus-aliases model in §4.2: a private, per-user workaround that never contributes
  to the shared catalogue means every other user hits the same dead end, forever. A user-dropped
  pin is the geographic version of the same mistake.
- **The "more effort than one tap" argument is weaker than stated, but only for Bucket C.** A
  one-tap picker (Bucket B) is genuinely less effort than dropping a pin — no argument there. But
  Bucket C's actual alternative isn't "one tap," it's "point at the nearest catalogued city," which
  is not obviously less effort than dropping a pin accurately. I'd rest the Bucket C case on the
  first two arguments (BRD scope, catalogue drift), not this one.
- **It doesn't fit the taxonomy as a fourth remedy anyway.** Every bucket above already has a
  remedy that keeps the user inside the shared catalogue's convergence property. A private pin adds
  a fourth path that produces a result nothing else in this design produces: correct for exactly
  one person, forever invisible to everyone else's identical problem. I'd want a much stronger
  reason than "the village is small" to introduce that.

**Net: agree with the rejection, unforced.** Named the one place the reasoning is thinner so the
COO isn't relying on it more than it can bear.

### 11.4 What Bucket B actually needs, and the data-model implication that follows

The candidates that made a lookup ambiguous are known **once**, at the moment `classifyCandidates`
runs — and the F1/F2 ruling is explicit that the resulting `reason` is "not persisted; drives
logging." For a one-tap picker to exist later without a fresh (rate-limited) lookup, **something
has to survive that isn't currently kept.**

**Implication for the Architect:** a nullable, small persisted field on the ambiguous city row —
e.g. `cities.ambiguous_region_isos` (JSON array of ISO 3166-2 codes) — written whenever
`classifyCandidates` returns `multi-region`, ignored/cleared once `resolved`. Not needed for
`region-unconfirmed` (Bucket A absorbs it, §11.1) or `unresolved` (nothing to persist). Render-time
name resolution reuses the lookup `AddPlaceFlow` already does for `autoRegionIso`
(`countryRegions.find(r => r.iso_3166_2 === iso)`) — **and must handle a miss**, per the standing
constraint that region reference data is hand-seeded and incomplete: if a candidate's ISO code has
no matching seeded region, show the raw code (e.g. `US-MO`) rather than silently dropping that
option from the picker. `GET /api/cities/:id` needs to return this field.

**Selecting a candidate in the picker submits a normal `POST /api/cities` resubmission** (same
name, same country, the chosen region) — this is not a new endpoint, it is exactly the
`findOrUpgradeCity` path the F1/F2 ruling already specifies (§3.3), which upgrades the existing
pending row in place and, per the ruling's own rule 3, resets the retry budget and re-fires
resolution. **This is a different action from "Change city"** — it doesn't change which city row
the place points at, it supplies the missing detail on the *same* row. Both should be reachable
from the same place, but a Frontend brief should not merge them into one control: Change City opens
the full search-and-create flow; the Bucket B picker is a small, anchored popover offering only the
already-known candidates.

### 11.5 Worked flow — Case 1: "Springfield," no state chosen

Priya is planning **"US Road Trip 2026"** and has already set the trip's Countries field
(§1) to United States.

1. She adds a place, types **"Springfield."** No catalogue match exists yet. She taps
   **"+ Add new: 'Springfield'."**
2. The new-city form opens. Country is **pre-selected to "United States"** outright — the trip has
   exactly one associated country (§3.2) — she doesn't touch it.
3. The lookup fires on name-commit, constrained to the US (D12). It returns candidates across three
   distinct regions: **Illinois, Missouri, Massachusetts.** Per §3.3, the Region dropdown opens
   already populated with exactly these three, placeholder reading **"Multiple matches — choose
   one."**
4. Priya doesn't know which stop yet — she taps **"Add City & Place"** without choosing. GE-16
   explicitly permits this.
5. Confirmation reads: *"Added — multiple matches found for Springfield. It's saved to your trip;
   you can confirm which one whenever you're ready."*
6. Back on the trip page, the place shows a badge: **"Which one? — 3 matches ▾"** (Bucket B).
7. She taps it later, once she's picked her actual route. A small popover anchored to the badge
   lists **Illinois / Missouri / Massachusetts** — the exact candidates from step 3, no retyping, no
   new lookup.
8. She taps **"Missouri."** The popover shows a brief "Confirming…" state and closes; the badge
   changes to **"Confirming location"** (Bucket A) while the backend's re-fired resolution runs.
9. On her next visit (or the next background poll), the badge is gone. The place reads like any
   other resolved place, and the map shows a pin at Springfield, Missouri's actual coordinates.

### 11.6 Worked flow — Case 2: added while the geocoder is unreachable

Tomás is adding places to a France trip. He adds **"Lyon"** while the app's geocoding proxy can't
reach the mapping service (a transient outage, not his connection). Nothing about "Lyon" is
ambiguous — the question was simply never successfully asked.

1. City creation succeeds immediately (GE-16: creation never depends on the geocoder being
   reachable). Confirmation reads: *"Added — still confirming this location. It's saved to your
   trip and only visible to you until then."* (§3.4, unchanged.)
2. The place shows **"Confirming location"** (Bucket A) — identical treatment to a not-yet-attempted
   or region-unconfirmed row, because the remedy is identical: wait.
3. The backend's background queue retries on its normal schedule once the service is reachable
   again. No user action ever appears — there is nothing to choose and nothing wrong to report.
4. Once resolved, the badge disappears on Tomás's next view. He never had to do anything, and the
   UI never implied he did.

### 11.7 Worked flow — Case 3: a village the geocoder has no record of

Tomás detours to a hamlet he's calling **"Nether Wallow"** — genuinely too small for the mapping
service's data. This is terminal: GE-16 says `unresolvable` is never retried, so whatever exists
here is the only path that will ever exist for this row.

1. The lookup returns zero candidates. Per §3.4: *"Added — we couldn't find this location. It's
   saved and only visible to you; you can point it at a different city any time from the place."*
2. The place shows **"Location not found"** (Bucket C, the `unlocated` hue) — immediately, not after
   a delay, since `unresolvable` is known at creation time, not discovered later.
3. Tomás taps **Change City**. Because this place is flagged Bucket C, the modal shows a contextual
   hint above the search box: *"Can't find 'Nether Wallow' in the map data? Try pointing this place
   at the nearest larger town instead — you'll keep everything you've added here."*
4. He searches **"Salisbury"** (a real, catalogued town nearby), finds it, selects it. The place now
   points at Salisbury's city row — pin appears, all of Nether Wallow's items/notes/activities carry
   over untouched (GE-16's explicit guarantee).
5. **Alternative ending:** Tomás doesn't want to substitute a nearby town — he'd rather the place
   just have no pin. He taps **Dismiss** instead of Change City. The badge disappears; the place no
   longer contributes to any unlocated-places count (§12.3 on whether that count ships); Change City
   remains available if he changes his mind later.

### 11.8 Worked flow — Case 4: "Rome" on a US trip, meant Rome, Georgia

This case never enters a non-`resolved` state at all — the risk is a **confident wrong answer**, not
a missing one, so nothing in §11.1–11.4 applies. Two layers, in order:

1. **Prevention, already in §3.2.** Because the trip's Countries field includes United States, the
   country dropdown is pre-selected to United States, not silently guessed as Italy from an
   unconstrained "Rome" lookup. The geocode call is constrained to the US from the start and finds
   Rome, Georgia (or asks, if more than one US Rome-like candidate survives — Bucket B, same as
   Springfield). **This is the primary defence, and it's already specified — nothing new here.**
2. **Residual, if prevention doesn't fire** (e.g. the trip had no declared countries and Priya
   accepted an unconstrained single-guess suggestion without checking it). The row resolves,
   silently, to the wrong Rome. **No badge appears — `resolved` is deliberately silent (§3.4).**
   The only defence left is the one GE-16 already guarantees and this spec already builds: the
   **standing Change City control**, always visible regardless of status, so that whenever Priya
   notices the pin is in the wrong US state, she can re-point it in the same two taps as any other
   correction — no special "wrong result" UI, because ADL-46 itself declines to add a fourth
   "verified" status for exactly this case (§4.3.1), and I'm not reopening that here.

**No new mechanism for Case 4.** It's the clearest evidence in this whole design that the standing
correction control isn't just for the pending/unresolvable buckets — it's the backstop for the one
failure mode that never shows up as a badge at all.

### 11.9 A bug found while verifying the retry mechanics (flagged, not fixed here)

While confirming how an already-shipped mechanism (`src/frontend/services/geocodeRetryQueue.ts`)
would interact with this design, I found it only removes a queue entry on
`geocode_status === 'resolved'` (`attemptRetry`, `geocodeRetryQueue.ts`) — it has no branch for
`unresolvable`. A city that resolves to `unresolvable` stays in this client-side queue and gets
polled indefinitely on its 10-minute floor, even though the backend has permanently stopped trying.
**MINOR** (wasted client polling, no data-correctness or security impact) — flagged in the park doc
for a small Frontend fix (add an `unresolvable` branch to `attemptRetry` that removes the entry, the
same as the existing 404 branch does), not something this spec needs to design further.

---

## 12. MVP scope — what ships now, what's deferred, and what would leave users stuck if cut

Written after the PO's revised framing: this is probably edge-case territory until real usage data
says otherwise, for two verified reasons — the F1/F2 ruling fixes a shipped regression that was
inflating how often "ambiguous" fires on the ordinary happy path, and `geocode_status` itself has no
production data yet (it arrives on migration `0015`, which is only on the integration branch).
**Assume §11's fuller design is parked. This section is what I'd actually ship.**

### 12.1 Verified: the correction surface, and why it isn't `PlaceDateForm`

I verified both claims directly rather than taking them from the relay:

- `UpdatePlaceDatesSchema` on `release/adl46-access-model`
  (`src/backend/validation/places.schemas.ts:30–41`) already has `city_id: z.number().int()
  .positive().optional()`, with an inline comment citing ADL-46 D11 §4.4.2 verbatim as "the
  correction path for a mistyped/wrong city." The route (`places.ts:141`) already destructures and
  uses it. **Confirmed independently in two places (schema file + route handler), not assumed.**
- `PlaceDateForm.tsx` (`main`, unchanged on the release branch) is a small, single-purpose modal —
  two date inputs, a warnings callout, Cancel/Save — driven by `useUpdatePlaceDates()`
  (`usePlaces.ts:101–123`), whose mutation function signature only accepts
  `{ tripId, placeId, arrivedOn, departedOn }`. **No city field exists anywhere in it today.**

**My conclusion: don't extend `PlaceDateForm`.** Its name, its modal title (`Dates — {cityName}`),
and its scope are all specifically about *when*, not *where*. Retrofitting a city search into a
"Dates" modal is exactly the kind of scope creep into an existing small component my role exists to
catch — it would produce a form that does two unrelated things behind one label, which fights the
hierarchy principle rather than serving it. **The smaller and more correct answer is a second,
separate, equally small modal** — "Change City" — reusing only the *search step* of `AddPlaceFlow`
(city search + the new-city name/country/region form), extracted into a shared component with no
date fields at all, submitting via the same PATCH endpoint with `city_id` instead of dates. This is
not bigger than retrofitting `PlaceDateForm` — it's the same amount of new code, cleanly separated
by concern instead of merged into an existing single-purpose form.

**Why this can't be smaller still (e.g. a bare city-name text field with no search):** GE-16 states
the correction "runs the normal find-or-create and resolution path" — the user doesn't know city
IDs, and a free-text field with no search-and-match step would either duplicate cities or require
the user to somehow already know whether their spelling matches the catalogue. The search step is
inherent to the requirement, not an enhancement.

### 12.2 The MVP itself

1. **The standing "Change City" control** (§5, unchanged) — pencil icon, always visible on every
   unlocked place regardless of status, opening the extracted search-step modal from §12.1. This
   alone discharges GE-16's correction right for all four worked cases in §11: Springfield
   (re-search and pick Missouri manually, same as adding fresh), offline Lyon (nothing to fix, but
   available if impatient), Nether Wallow (search "Salisbury" instead), and wrong-Rome (re-search
   and correct).
2. **One undifferentiated badge, zero new hues.** Whenever `geocode_status !== 'resolved'`, show
   `Location not confirmed` using the existing `locked` hue (grey, hue 80) — no split between
   `pending` and `unresolvable`, no Bucket A/B/C. Copy chosen to be **honestly true regardless of
   which backend state actually applies**: it doesn't promise automatic resolution (true for a
   stuck ambiguous row and for `unresolvable`) and it doesn't demand action (true for a row that
   genuinely will resolve on its own). This is smaller than even my original §5 draft, which already
   proposed a second hue — that hue is deferred to §11/Bucket C, not part of MVP.
3. **§3.2's country-suggestion rule (never silently auto-commit a country) stays in, not deferred.**
   It's a frontend sequencing/labelling change with no new component and no backend dependency —
   cheap on its own terms — and it prevents Case 4's confidently-wrong-result class before it can
   happen, which the PO named as worse than a missing pin. Deferring it would save little cost while
   leaving a known, avoidable defect live, so it isn't part of the correction-mechanism cost this
   section is trying to shrink.
4. **§3.4's creation-time messaging stays in, not deferred.** It's conditional text in a
   confirmation flow that already exists — cheaper to keep than to special-case out, and it's the
   only place a user learns *why* to expect the badge at all.

**Everything else in §11 is deferred**: the three-bucket split, the persisted candidate list and
one-tap picker, the exhausted-retries promotion rule, and the map's "N places not yet located"
affordance (§4.1/§8) and Dismiss (§11.7/raw material). None of them are required to discharge GE-16;
all of them make the fuller experience better once there's evidence the gap the badge already
surfaces is actually common enough to be worth the extra build.

### 12.3 Is the map counter part of MVP? No — and here's the reasoning, not just the answer

**Deferred.** The per-place badge already satisfies the principle the counter exists for — a user
cannot act on an absence they can't see — at the point a user is actually looking: their own trip
detail page. The counter's *incremental* value is surfacing the same fact at the map level, for a
user who wants an at-a-glance view across many trips without opening each one. That's a genuine but
smaller need, and it's the one piece of §11 that requires new UI surface (an expandable list next to
`MapLegend`) rather than reusing something already on screen — it's the most expensive item to
defer and the easiest to justify deferring.

**Trigger to revisit (concrete, not "later"):** either (a) a UAT session or user report describing
the specific discoverability failure the counter exists to prevent — "I didn't know a place had no
pin until much later" — or (b) once `geocode_status` has real production data (post the F1/F2
ruling's deploy), a plain count showing more than roughly 5% of a user's active places sitting
non-`resolved` at once. (a) is the stronger signal and should win if both are available at different
times, since it's evidence of the actual failure rather than a proxy for it.

**Dismiss is deferred with it, for the same reason.** Its stated purpose (raw material: "without
it, the counter nags permanently") is a counter's problem. A single quiet line of text next to one
place a user is already looking at isn't the kind of persistent nag Dismiss exists to relieve —
reintroduce it alongside the counter, not before.

### 12.4 What is not safe to cut, stated plainly because the PO asked for it directly

Two things, and I'd push back on cutting either even under "make it very small":

1. **The standing Change City control itself.** Without it, a wrong or missing city is permanently
   unfixable short of deleting and recreating the place — which loses items, notes, and activity
   tags, the exact loss GE-16 exists to prevent. There is no smaller version of "the user can correct
   this" that doesn't include a working control to do it with.
2. **Some passive signal that a place's location isn't confirmed, even in its smallest form.**
   Without any indication at all, the Change City control has zero discoverability — nobody clicks
   an edit-city affordance on a place that shows no sign anything is wrong. This is, verbatim, the
   original brief's own framing: a correction mechanism that exists but is undiscoverable is not a
   correction mechanism a user can use. One line of neutral text is enough; zero lines is not.

Everything else in §11 — the bucket split, the one-tap picker, the counter, Dismiss — is a genuine
refinement I'd want eventually, but none of them are load-bearing for "a user is not stuck." Those
two are.

### 12.5 Revised success criteria for MVP (supersedes the two flagged in §10)

- Every unlocked place whose city is not `resolved` shows the single `Location not confirmed` badge
  (no state-specific label) and the standing Change City control; a `resolved` place shows neither
  the badge nor any other indication of location status.
- Change City opens a modal containing only city search + new-city name/country/region fields (no
  date fields); selecting or creating a city calls `PATCH .../places/:placeId` with `city_id` and
  leaves the place's items, notes, and activity tags unchanged.
- Change City is available and correctly hidden/disabled under the same `isLocked` rule as the
  existing Remove-place control, on every place regardless of its city's `geocode_status`.
- No map-level "N places not yet located" affordance ships in this pass; its absence is a scoping
  decision, not a defect, until §12.3's trigger fires.
