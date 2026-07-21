# Business Requirements Document
## Travel Tracker Application
**Version:** 3.2
**Date:** July 2026
**Author:** Claude (BSA/COO) / Ryan V (Product Owner)
**Status:** Approved

---

## 1. Problem Statement

Trip planning today is scattered: booked flights, hotels and car hire live in confirmation
emails; ideas for what to do live nowhere; and once a trip is over there is no structured
way to look back on it. This creates three gaps:

- No single place where a trip comes together — booked items entered once, then a space to
  brainstorm and shortlist everything else
- No visual record of countries, regions and cities visited
- No quick way to pull up recommendations when a friend asks ("you've been to Japan —
  where should we go?")

---

## 2. Goals

The product identity, in priority order (PO direction 2026-07-18):

1. **Plan** *(primary)* — the app is where trips get planned: booked items captured early,
   then an idea pool that gets shortlisted and promoted as the trip firms up. Planning is
   eventually collaborative (trip companions co-plan, Phase 3).
2. **Look back** *(major)* — past trips become memories: the shaded map, stats and
   patterns, and shareable recommendations pulled from real trip history.
3. **Catch up** *(supporting)* — historic trips are backfilled as lightweight shell trips
   so the map and stats reflect real travel history. Logging exists to serve looking back,
   not as the app's identity.

---

## 3. Users

**Primary user:** Ryan (personal use — browser app; hosted for own use on the near-term
roadmap, laptop is always available when travelling, phone used as a reference device)
**Near-term users (~6 months):** Trip companions with edit access — co-planning
(contributing to the idea pool) is the target first companion capability
**Future users:** Wider sharing (view links, recommendations) — Phase 3+

---

## 4. Definitions

**Trip:** A discrete travel event with a start and end date, one or more destinations, a category, and at least one companion record (including solo). A trip counts as a visit if the traveller stayed overnight OR spent meaningful time at the destination without an overnight (e.g. a full-day layover where activities were undertaken). This is a judgment call made at entry time.

**Place:** A country and/or city visited within a trip. A place can appear across multiple trips as separate dated entries.

**Item:** Anything logged against a trip or place — a restaurant, hotel, flight, car rental, experience, or note. Items carry a status.

**Item Status:**
- **Consider** — an idea: something being researched or thought about. Any item type
  (including hotels, flights, car rentals) can exist as a Consider item with minimal detail
- **Shortlisted** — promoted from the idea pool: a keeper the traveller intends to do or
  book *(added in v3.0)*
- **Confirmed** — booked or committed to
- **Completed** — actually happened (set during post-trip review)
- **Cancelled** — was confirmed but did not happen
- **Next time** — not done this trip but flagged for a future visit

**Planning stages:** the three pre-trip statuses map to the planning loop — the **idea
pool** (Consider), the **shortlist** (Shortlisted), and **booked** (Confirmed).

**Shell Trip:** a historic trip recorded with minimal detail — name, dates, and places
only, no items required. Shell trips are first-class trips: they count toward map shading
and stats. They exist so travel history can be backfilled quickly *(added in v3.0)*.

**Trip Status:**
- **Planning** — upcoming or in progress
- **Active** — currently on this trip
- **Review pending** — trip end date has passed, awaiting post-trip review
- **Locked** — post-trip review completed, record is finalised

---

## 5. Functional Requirements

### 5.1 Trip Management

| ID | Requirement |
|----|-------------|
| TR-01 | User can create a trip with a name, start date, end date, and one or more destinations |
| TR-02 | User can add trip companions (solo, partner, partner + friends, or custom — managed in admin panel) |
| TR-03 | User can assign one or more categories to a trip (e.g. Ski Trip, Honeymoon, Summer Holiday — managed in admin panel) |
| TR-04 | User can assign one or more activities to a trip or to a specific place within a trip (e.g. Skiing, Dining, Hiking — managed in admin panel) |
| TR-05 | User can edit any trip field at any time before it is locked |
| TR-06 | User can manually mark a trip as Locked after completing post-trip review |
| TR-07 | Locked trips are read-only except for a specific unlock action |
| TR-08 | Multiple trips to the same place are stored as separate dated entries |
| TR-09 | User can view all trips in chronological order |
| TR-10 | Trips are searchable by name and filterable by category, activity, and status. The trip list includes a text search field and status filter controls (All / Planning / Active / Review / Locked) |
| TR-13 | Trip text search matches on trip name and on the names of cities within the trip's places |
| TR-11 | The trips area uses a persistent two-panel layout on desktop — a fixed left panel shows the scrollable trip list with search and filter controls; a right panel shows the selected trip detail. Selecting a trip updates the right panel without navigating away from the trips view |
| TR-12 | The trip detail view includes a persistent status bar showing the current trip status and the primary action to advance it to the next state, always visible regardless of scroll position |

### 5.2 Geographic Hierarchy

| ID | Requirement |
|----|-------------|
| GE-01 | Places are structured at up to three levels: Country → Region → City |
| GE-02 | The middle tier (Region) represents states, provinces, or territories depending on the country (e.g. US states, Australian states, Canadian provinces) |
| GE-03 | The Region tier is optional and configurable per country in the admin panel — countries where regional grouping adds no value go straight from Country to City |
| GE-04 | The app ships with a default configuration for every country defining whether the Region tier is enabled and what the Region tier is called (State, Province, Territory, etc.) |
| GE-05 | These defaults are applied automatically on first launch — the user does not need to configure any country manually to get started |
| GE-06 | Default Region tier behaviour is based on established geographic conventions (e.g. US → States, Australia → States, Canada → Provinces, India → States, most of Europe → disabled) |
| GE-07 | User can override the default Region tier setting per country in the admin panel if the default is not appropriate |
| GE-08 | User can view all trips grouped at Country level, Region level (where enabled), or City level |
| GE-09 | Clicking into any level on the map shows all trips associated with that geographic grouping |
| GE-10 | Country and region boundary polygon data (used for map shading) is bundled with the app — no internet connection is required to render country or region shading |
| GE-11 | City coordinates are resolved via geocoding (OpenStreetMap Nominatim) the first time a new city is logged. Resolved coordinates are stored permanently in the local database and require no further network call |
| GE-12 | If no internet connection is available when a new city is logged, the city record is created immediately and the user can continue working uninterrupted. Geocoding is queued and resolved silently in the background when internet connectivity is next detected |
| GE-13 | Cities with pending geocoding are fully usable for trip and item logging. Map pins for pending cities are not rendered until coordinates are resolved |
| GE-14 | When the user adds a city to a trip, the app first searches the existing city database. If a match is found it is offered for immediate selection without triggering a new geocoding call |
| GE-15 | When a new city is created via geocoding, the country is auto-populated from the geocoding result. The user does not need to select the country separately |

### 5.3 Map View

| ID | Requirement |
|----|-------------|
| MP-01 | The map view shows all visited countries shaded according to their current visit state |
| MP-02 | Zooming in on the map reveals region-level shading (where enabled) and city-level pins |
| MP-03 | Clicking a country, region, or city opens the associated trip entries |
| MP-04 | Map shading states and colours are fully configurable in the admin panel |
| MP-05 | The six map shading states are listed in section 5.4 below |
| MP-06 | The Active state (currently on this trip) overrides all other shading states |

### 5.4 Map Shading States

| State | Description | Configurable |
|-------|-------------|--------------|
| Active | Currently on a trip here — overrides all other states | Yes — colour picker in admin |
| Planned | Trip exists but not yet taken | Yes — colour picker in admin |
| Visited once | One completed trip | Yes — colour picker in admin |
| Visited once + planning | One completed trip and a future trip in planning | Yes — colour picker in admin |
| Visited multiple times | Two or more completed trips | Yes — colour picker in admin |
| Visited multiple times + planning | Two or more completed trips and a future trip in planning | Yes — colour picker in admin |
| Never visited | No trips logged | Default — no shading |

### 5.5 Item Logging

| ID | Requirement |
|----|-------------|
| IT-01 | User can log items against a trip or a specific place within a trip |
| IT-02 | Item types: Restaurant, Hotel, Flight, Car Rental, Experience, Note |
| IT-03 | All items carry a status: Consider, Shortlisted, Confirmed, Completed, Cancelled, Next time *(Shortlisted added in v3.0 — see §5.12)* |
| IT-04 | Notes can be added to all item types |
| IT-05 | Items can be updated at any time during Planning or Active status |
| IT-06 | During post-trip review, user can bulk-update item statuses to reflect what actually happened |
| IT-07 | When creating a new trip to a city where prior Next time items exist, the app automatically prompts the user with those items as carry-forward suggestions. The user can accept or reject each suggestion individually. Accepted items are created as Consider items on the new trip and are permanently flagged as carried forward, with a reference to the source item preserved in the data model |
| IT-08 | Completed restaurants, hotels, and experiences can be sorted and filtered by rating in all item list views |
| IT-09 | Rating sort and filter applies across all trips to the same city, enabling the user to surface best-rated items across multiple visits to a place |
| IT-10 | Each item can optionally store a Google Maps URL. When present, the trip detail view shows a one-click map/directions link using this URL; no separate address or phone fields are required when a URL is set. Success criteria: item create/edit form has an optional URL field; a populated URL surfaces a map-link affordance on the item card; an empty field shows no affordance. Schema change — requires Architect review before Database implementation |

### 5.6 Structured Confirmation Fields

**Flights**

| ID | Requirement |
|----|-------------|
| FL-01 | Each flight is logged as an individual leg |
| FL-02 | Fields: airline, flight number, departure airport, arrival airport, departure date/time, arrival date/time, booking reference, seat, notes |
| FL-03 | Flight status follows the standard item status workflow |
| FL-04 | *(Phase 2)* Given a flight number and date, the app looks up the flight and auto-populates airline, departure airport, arrival airport, and scheduled times |

**Hotels**

| ID | Requirement |
|----|-------------|
| HT-01 | Fields: property name, address, check-in date, check-out date, booking reference, confirmation number, notes |
| HT-02 | Duration is calculated automatically from check-in and check-out dates |
| HT-03 | Hotel status follows the standard item status workflow |
| HT-04 | Completed hotels can have a rating (1–5 stars, integer) and post-visit notes added |

**Car Rentals**

| ID | Requirement |
|----|-------------|
| CR-01 | Fields: provider, pickup location, drop-off location, pickup date/time, drop-off date/time, booking reference, vehicle class, notes |
| CR-02 | Car rental status follows the standard item status workflow |

**Restaurants**

| ID | Requirement |
|----|-------------|
| RS-01 | Fields: name, neighbourhood/area, cuisine type, notes, source (how you heard about it) |
| RS-02 | Restaurant status follows the standard item status workflow |
| RS-03 | Completed restaurants can have a rating (1–5 stars, integer) and post-visit notes added |

**Experiences**

| ID | Requirement |
|----|-------------|
| EX-01 | Completed experiences can have a rating (1–5 stars, integer) and post-visit notes added |

### 5.7 Photos

| ID | Requirement |
|----|-------------|
| PH-01 | User can link a photo album or folder reference to a trip (not to individual items) |
| PH-02 | Photo linking is a reference only — the app does not store or copy photos |
| PH-03 | Photo management for a trip is accessible directly from the trip detail view header |
| PH-04 | *(Phase 2)* User can attach photos directly to trips and items. Photos are stored locally. The existing album reference (PH-01–PH-03) is preserved alongside direct attachment |

### 5.8 Post-Trip Review

| ID | Requirement |
|----|-------------|
| RV-01 | User can initiate a post-trip review at any time after the trip end date |
| RV-02 | Review mode presents all items for the trip and prompts the user to update statuses |
| RV-03 | User can add post-visit notes and ratings to completed items during review |
| RV-04 | User confirms review is complete by marking the trip as Locked |

### 5.9 Trip List and Detail Display

| ID | Requirement |
|----|-------------|
| DP-01 | Each trip card in the trip list shows the trip name, date range, status badge, and the names of places visited on that trip |
| DP-02 | The trip list panel shows a count of trips currently displayed (reflecting any active search or filter) |
| DP-03 | The trip detail header shows the trip name, date range, status badge, assigned categories as chips, and the names of companions on the trip |
| DP-04 | Each place section within the trip detail shows the city name, full country name, and the date range for that place. Date range is derived from hotel check-in/check-out dates if a hotel item exists; otherwise falls back to the trip date range |
| DP-05 | Places within a trip can have optional arrival and departure dates set at create or edit time. When set, place sections in the trip detail are ordered chronologically by arrival date. When not set, the existing insertion order is preserved |
| DP-06 | When the first place is added to a trip, its arrival and departure dates default-populate from the trip's own date range. The user can edit these per-place dates afterward at any time; doing so does not alter the trip's dates. Success criteria: adding the first place to a trip with dates set pre-fills place arrival/departure from trip start/end; subsequent per-place edits persist independently of the trip date range |

### 5.10 Admin and Settings Panel

| ID | Requirement |
|----|-------------|
| AD-01 | Admin panel allows user to manage all structured lists without developer involvement |
| AD-02 | Manageable lists: Trip Categories, Activities, Companions, Map Shading States |
| AD-03 | User can add, edit, rename, or deactivate items in any structured list |
| AD-04 | Map shading colours are configurable per state via colour picker in the admin panel |
| AD-05 | Region tier can be enabled or disabled per country in the admin panel |
| AD-06 | Deactivated list items are hidden from entry forms but preserved on existing records |
| AD-07 | Map shading configuration is per-user. Each user's colour and state settings reflect their own travel history and do not affect other users |
| AD-08 | The companions list is per-user. Each user maintains their own list of travel companions |
| AD-09 | Trip categories and activities are global seeded defaults shared across all users. Any user can add custom entries. Entries cannot be deleted — only deactivated by the app owner |

---

### 5.11 Security and Access Control

| ID | Requirement |
|----|-------------|
| SE-01 | The system must implement a three-role access model: owner (the designated app owner), explicitly-shared (Phase 3+, not yet operative), and authenticated-but-ungranted (valid Clerk token, no explicit grants) |
| SE-02 | All user data (trips, places, items, map shading) must be scoped to the authenticated user — no cross-user data leakage permitted |
| SE-03 | Admin operations (category, activity, companion management; map shading config; city creation) must be restricted to the designated owner. Authenticated-but-ungranted users must receive 403 |
| SE-04 | JWT tokens must be validated for signature, expiry, and issuer against the configured Clerk instance. Tokens issued by a different Clerk instance must be rejected |
| SE-05 | Authentication and authorisation failures must return opaque error responses. Internal error detail, user existence, and ownership must not be leaked to callers |
| SE-06 | Development authentication bypass (BYPASS_AUTH) must be impossible in production environments |
| SE-07 | All user ownership columns (trips, trip_places, items) must enforce NOT NULL at the database level to prevent unowned records |

---

### 5.12 Planning (v3.0 — core loop)

The planning loop is **idea pool → shortlist → booked**, applying to every item type —
a hotel or car rental is an idea until it's booked, exactly like a restaurant or activity.
Day-by-day scheduling is a secondary layer for region-sequential trips (e.g. Japan, where
places can't be revisited after moving on), not a requirement for every trip.

| ID | Requirement | Success criteria |
|----|-------------|------------------|
| PL-01 | Any item type can be created as a quick-capture idea (status Consider) with minimal fields — name and type are sufficient; booking fields are not required until Confirmed | An idea for a restaurant, hotel, or activity can be added to a trip in one short interaction with no booking details |
| PL-02 | Items can be promoted (Consider → Shortlisted → Confirmed) or demoted without re-entering data; existing field values are preserved across transitions | Promoting/demoting an item is a single action from any item list; no data loss on transition |
| PL-03 | Trip detail provides a planning view grouping items by planning stage — idea pool, shortlist, booked — across all item types | For a trip in Planning status, the user can see at a glance what's booked, what's shortlisted, and what's still just an idea |
| PL-04 | The planning view supports brainstorming: adding several ideas in quick succession without leaving the view | Five ideas can be captured in under a minute without navigating away |
| PL-05 | *(Phase 2)* Items and places can optionally be assigned to days — a day-by-day itinerary layer for region-sequential trips. Unassigned items remain in the pool; day assignment is never mandatory | A Japan-style trip can show items per day per region; a weekend trip can ignore the layer entirely |
| PL-06 | *(Phase 3)* Trip companions can contribute to the idea pool and shortlist on shared trips (co-planning — see §9 companion model) | A companion on a shared trip can add and promote ideas under their own identity |

### 5.13 Looking Back (v3.0)

| ID | Requirement | Success criteria |
|----|-------------|------------------|
| LB-01 | User can pull up a recommendations view for any visited destination (country, region, or city): best-rated and Next-time items aggregated across all trips there | The "friend is going to Japan" scenario: one view surfaces recommended restaurants, hotels, experiences and next-times from all Japan trips |
| LB-02 | *(Phase 2)* Stats and patterns view: counts of countries/regions/cities/trips, trips per year, ratings patterns | User can answer "how many countries have I visited?" and "where do I keep going back to?" from one view |
| LB-03 | *(Phase 3)* Recommendations can be shared externally via generated link (place-level, not full trip) — promotes the existing §9 item | A recommendations view can produce a shareable artefact without exposing the rest of the account |

### 5.14 Historic Catch-up (v3.0)

| ID | Requirement | Success criteria |
|----|-------------|------------------|
| CU-01 | A trip is valid with only name, dates, and places — no items, no companions beyond the default, no review required (shell trip) | A shell trip saves without warnings and appears in the trip list, map shading, and stats |
| CU-02 | Shell trips can be created through a fast entry path — single form, no multi-step wizard | Backfilling a historic trip takes well under a minute |
| CU-03 | Shell trips are visually distinguishable in the trip list (e.g. badge) and can be enriched into full trips later with no migration step | User can tell at a glance which trips are shells; adding items to a shell just works |

### 5.15 Mobile Reference Mode (v3.0)

The phone is a **reference device**, not an editing surface: mid-trip, the user checks
booking details and gets directions. The laptop travels on every trip for everything else.

| ID | Requirement | Success criteria |
|----|-------------|------------------|
| MB-01 | Booking details (flights, hotels, car rentals) for a trip are readable on a phone browser — the trip detail read path is usable at mobile viewport widths | Flight number, booking reference, and hotel address are legible and reachable on a phone without horizontal scrolling |
| MB-02 | Places and address-bearing items expose a directions link that opens the device's map application (Google Maps URL scheme) | Tapping a place or hotel on the phone opens directions to it in one tap |

---

## 6. Non-Functional Requirements

> Deployment direction changed in v3.0 (PO direction 2026-07-18): the app will be
> **hosted for personal use on the near-term roadmap** — before multi-user lands. NF-01
> and NF-04 are superseded accordingly; original text retained for history.

| ID | Requirement |
|----|-------------|
| NF-01 | ~~Local Mac desktop app — no internet connection required for core features~~ **SUPERSEDED (2026-07-18) by NF-09** — retained for history |
| NF-02 | Map view requires internet connection to render |
| NF-03 | Data is stored via libSQL (Drizzle). **RESOLVED (2026-07-20) by ADL-32** — hosted deployment uses Turso (hosted libSQL) for the production database and a separate staging Turso database for PR preview environments; local development stays file-based (`SQLITE_PATH=file:...`) |
| NF-04 | ~~Database file can be stored in OneDrive for single-user sync across personal devices~~ **SUPERSEDED (2026-07-18) by NF-09** — hosting replaces file-sync |
| NF-05 | Architecture must support migration to a hosted web app without a data model rebuild — **promoted from future-proofing to near-term requirement in v3.0** |
| NF-06 | Architecture must support future migration to an iOS mobile app without a data model rebuild (iOS remains aspirational — mobile browser reference mode §5.15 is the near-term answer) |
| NF-07 | Architecture must support trip companion access (read-only and edit) — target ~6 months for co-planning (PL-06) |
| NF-08 | Architecture must support future notification engine without structural changes |
| NF-09 | The app is deployed as a hosted web app for personal use, reachable from the user's devices over the internet with real authentication (Clerk). Local development remains fully supported *(added v3.0)* |

> **NF-09 success criteria (added 2026-07-20 per ADL-32):** production URL reachable over
> HTTPS from a phone browser on cellular data; Clerk sign-in works end-to-end against
> production; data persists across a deploy; a PR preview environment deploys
> automatically and is confirmed isolated from the production database; CI green + deploy
> succeeds on merge to `main`. Full hosting architecture (Railway + Turso) in ADL-32.

---

## 7. Out of Scope — MVP

The following are explicitly out of scope for MVP but must not be architecturally blocked by MVP decisions:

- Push notifications and reminders of any kind
- Post-trip review prompts
- Trip companion access (shared or read-only) — *v3.0: now a named ~6-month target (PL-06, NF-07), still out of current scope*
- Recommendation sharing via link — *v3.0: now LB-03 (Phase 3)*
- Import of historical trip data (booking-confirmation parsing etc.) — shell trips (§5.14) are the manual answer
- Offline map rendering
- Native mobile app — *v3.0: mobile browser reference mode (§5.15) is in scope; a native app is not*

---

## 8. MVP+ Features (Phase 2)

| ID | Feature |
|----|---------|
| N-01 | Notification: flight departure reminder with check-in prompt (built from individual flight leg dates) |
| N-02 | Notification: hotel check-in reminder day before arrival |
| N-03 | Notification: hotel check-out reminder morning of departure |
| N-04 | Notification: post-trip review prompt when trip end date passes |
| N-05 | Trip lock-down confirmation flow triggered by review completion |

---

## 9. Future Features (Phase 3+)

> Three items were promoted out of this section in v3.0: pre-trip planning is now the
> core product identity (§5.12), recommendation sharing is LB-03 (§5.13), and hosting is
> NF-09. Retained below with strikethrough for history.

- ~~Recommendation sharing via generated link (place-level, not full trip)~~ **promoted to LB-03 (v3.0)**
- Trip companion access — invite companions to view or edit a shared trip; **co-planning (contributing to the idea pool) is the target first capability, ~6-month horizon (v3.0, PL-06)**
- ~~Pre-trip planning as a first-class mode~~ **promoted to core identity, §5.12 (v3.0)**
- iOS mobile app
- ~~Multi-user hosted web app with real-time sync (replaces OneDrive sync)~~ **personal hosting promoted to NF-09 (v3.0); multi-user remains Phase 3**

- Booking confirmation import — parse flight, hotel, and car rental confirmation emails or PDFs to pre-populate item fields
- Companion endorsements — each place and item shows who added it; other trip companions can endorse it
- Companion invite model — companions can be unlinked placeholders or linked to real user accounts. Owner searches for a user; if not found, an unlinked placeholder is created. An invite activates and links the account when the invitee signs up

---

## 10. Open Questions

| ID | Question | Owner |
|----|----------|-------|
| OQ-01 | ~~Mapping library — Google Maps API vs open-source alternative~~ | **RESOLVED** — MapLibre GL + MapTiler tiles shipped in Phase 3 (see ADL record); bundled boundary polygons per GE-10 |
| OQ-02 | ~~Desktop app framework — Electron, Tauri, or local web server in browser~~ | **RESOLVED (2026-07-18)** — v3.0 direction is a hosted web app accessed via browser (NF-09); packaged .app dropped. Supersedes the earlier packaged-.app direction |
| OQ-03 | Shell trips (§5.14): historic trips may lack exact dates. Do we need approximate/partial dates (year-only, month-only), and how do they interact with map shading and chronological ordering? | PO + Architect — resolve before CU-01 is briefed |
| OQ-04 | ~~Hosting platform and database: where is the app hosted for personal use (NF-09), and does SQLite move to hosted libSQL (Turso) or stay file-based on the host?~~ | **RESOLVED (2026-07-20)** — Railway (compute) + Turso (database), production and a separate staging instance for PR preview environments. See ADL-32 |
| OQ-05 | `trip_places` enforces one row per (trip, city) (`uniq_trip_places_trip_city`). Realistic itineraries revisit the same city more than once within a trip (e.g. Glasgow → day trip to Edinburgh → back to Glasgow), which this constraint currently disallows. Does the model move to one-row-per-visit, and what are the knock-on effects on map shading, chronological ordering (DP-05/DP-06), and item attachment (`trip_place_id`)? | Architect — resolve before any brief touching trip-place identity |

---

## 11. Assumptions

- Ryan will manually enter all historical trip data — no import tooling required; shell
  trips (§5.14) keep the per-trip cost low. The existing seeded/test data is entirely
  synthetic and will be wiped, not migrated
- Primary usage is on the Mac (laptop travels on every trip); the phone is a reference
  device only (§5.15)
- ~~OneDrive sync is acceptable for personal multi-device use~~ **SUPERSEDED (2026-07-18)**
  — hosting (NF-09) replaces file-sync
- Photo albums are managed externally (Apple Photos, Google Photos etc) — the app stores a reference link only
- SQLite/libSQL is the database format; hosted-vs-file deployment is OQ-04

---

## 12. Example Notes by Item Type

The following examples illustrate the intended use of the notes field across item types:

- **Car Rental note:** "Obtain credit card insurance statement to show rental agency on pickup"
- **Restaurant note:** "Link to Google Maps location — https://maps.google.com/..."
- **Hotel note:** "Early check-in requested — call ahead day before"
- **Flight note:** "Check-in opens 24 hours before departure"
- **Experience note:** "Book tickets in advance — sells out weeks ahead"

---

---

## 13. Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 2.1 | March 2026 | Claude (BSA) / Ryan V | Initial approved draft |
| 2.2 | March 2026 | COO / Ryan V (PO) | Added GE-10–GE-13 (geographic data and offline geocoding); added IT-08–IT-09 (rating sort and filter); updated IT-07 (carry-forward behaviour and data model flags); added HT-04 (hotel ratings); updated RS-03 (rating scale explicit: 1–5 stars); updated OQ-02 (PO direction on packaging); document status set to Approved |
| 2.3 | March 2026 | COO / Ryan V (PO) | Added EX-01 (Experience ratings: 1–5 stars); updated IT-08 to include experiences in rating sort/filter |
| 2.4 | March 2026 | COO / Ryan V (PO) | UI direction approved from UX audit + mockup review. Updated TR-10 (search by name + status filter chips); added TR-11 (two-panel layout), TR-12 (persistent status bar), PH-03 (photos from detail header); added section 5.9 Trip List and Detail Display (DP-01–DP-04); renumbered Admin to section 5.10; added F-02/F-03 to future features |
| 2.5 | March 2026 | COO / Ryan V (PO) | Added TR-13 (search includes city names); GE-14/15 (city search-first + country autopopulate); DP-05 (place date ranges, chronological ordering); FL-04 (flight lookup, Phase 2); PH-04 (photos direct attachment, Phase 2); AD-07/08/09 (admin split model — map shading + companions per-user, categories/activities global seeded); added booking import, companion endorsements, companion invite model to §9 Future Features |
| 2.6 | March 2026 | COO / Ryan V (PO) | Removed F-02 (in-panel tab navigation) and F-03 (per-trip scoped map tab) from §9 Future Features — PO direction: not worth implementing without the map tab; scrapped entirely |
| 2.7 | March 2026 | COO | Added §5.11 Security and Access Control (SE-01–SE-07) — formalises the NR-14/OP-06 hardening gate requirements: three-role access model, user data scoping, owner-only admin, JWT issuer validation, opaque error responses, BYPASS_AUTH production block, NOT NULL ownership constraints |
| 3.0 | July 2026 | COO / Ryan V (PO) | **Planning-first identity rewrite** from PO requirements interview 2026-07-18. §1–§3 rewritten around three pillars: Plan (primary), Look back (major), Catch up (supporting). New sections with success criteria: §5.12 Planning PL-01–06 (idea pool → shortlist → booked across all item types; day-itinerary Phase 2; co-planning Phase 3), §5.13 Looking Back LB-01–03 (destination recommendations, stats, shareable highlights), §5.14 Historic Catch-up CU-01–03 (shell trips), §5.15 Mobile Reference MB-01–02 (phone as reference device). New item status Shortlisted (IT-03 amended). NF-09 hosting for personal use added; NF-01/NF-04 superseded (local-only + OneDrive sync dropped). §9 promotions stamped. OQ-01/OQ-02 closed; OQ-03 (approximate dates) and OQ-04 (hosting platform) opened. Trigger for the planning sections: Scotland trip dogfood trial (planned 2026-07 week) |
| 3.1 | July 2026 | COO / Ryan V (PO) | UAT session 2026-07-20 findings. Added DP-06 (first place added to a trip inherits the trip's date range). Added IT-10 (optional Google Maps URL per item — one-click map/directions link; schema change pending Architect review). Added OQ-05 (`trip_places` one-row-per-city constraint vs. realistic same-city revisits within a trip — Architect to resolve). BUG-10 reopened separately in the tracker: prior fix truncated over-limit trip names instead of rejecting them, and the limit itself is corrected to 75 characters (was 200) |
| 3.2 | July 2026 | Architect / Ryan V (PO) | Resolved OQ-04 (ADL-32): hosted deployment is Railway (compute) + Turso (hosted libSQL, production and a separate staging instance for PR preview environments). Updated NF-03 (RESOLVED, points to ADL-32); added success criteria to NF-09 (none existed previously — required before BRD-NF09 can be briefed/closed per the success-criteria gate) |

*Document status: Approved. This document is the authoritative requirements reference for all team members. Changes must be approved by the product owner and recorded in the change log.*
