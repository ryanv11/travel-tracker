# Business Requirements Document
## Travel Tracker Application
**Version:** 2.3
**Date:** March 2026
**Author:** Claude (BSA) / Ryan V (Product Owner)
**Status:** Approved

---

## 1. Problem Statement

There is currently no system for tracking travel history, planning future trips, or referencing past experiences. This creates three gaps:

- No visual record of countries, states and cities visited
- No structured reference when planning a return visit
- No quick way to pull up recommendations when a friend asks

---

## 2. Goals

1. Provide a visual, at-a-glance map of everywhere visited with meaningful geographic hierarchy
2. Create a living record of each trip that serves both as a retrospective log and a planning tool for future visits
3. Become the single point of reference for all trip information — from initial research through to post-trip review

---

## 3. Users

**Primary user:** Ryan (solo, personal use — Mac desktop app, local)
**Future users:** Trip companions (read-only or edit access — out of scope for MVP)

---

## 4. Definitions

**Trip:** A discrete travel event with a start and end date, one or more destinations, a category, and at least one companion record (including solo). A trip counts as a visit if the traveller stayed overnight OR spent meaningful time at the destination without an overnight (e.g. a full-day layover where activities were undertaken). This is a judgment call made at entry time.

**Place:** A country and/or city visited within a trip. A place can appear across multiple trips as separate dated entries.

**Item:** Anything logged against a trip or place — a restaurant, hotel, flight, car rental, experience, or note. Items carry a status.

**Item Status:**
- **Consider** — something being researched or thought about
- **Confirmed** — booked or committed to
- **Completed** — actually happened (set during post-trip review)
- **Cancelled** — was confirmed but did not happen
- **Next time** — not done this trip but flagged for a future visit

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
| TR-10 | Trips are searchable and filterable by category and activity |

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
| IT-03 | All items carry a status: Consider, Confirmed, Completed, Cancelled, Next time |
| IT-04 | Notes can be added to all item types |
| IT-05 | Items can be updated at any time during Planning or Active status |
| IT-06 | During post-trip review, user can bulk-update item statuses to reflect what actually happened |
| IT-07 | When creating a new trip to a city where prior Next time items exist, the app automatically prompts the user with those items as carry-forward suggestions. The user can accept or reject each suggestion individually. Accepted items are created as Consider items on the new trip and are permanently flagged as carried forward, with a reference to the source item preserved in the data model |
| IT-08 | Completed restaurants, hotels, and experiences can be sorted and filtered by rating in all item list views |
| IT-09 | Rating sort and filter applies across all trips to the same city, enabling the user to surface best-rated items across multiple visits to a place |

### 5.6 Structured Confirmation Fields

**Flights**

| ID | Requirement |
|----|-------------|
| FL-01 | Each flight is logged as an individual leg |
| FL-02 | Fields: airline, flight number, departure airport, arrival airport, departure date/time, arrival date/time, booking reference, seat, notes |
| FL-03 | Flight status follows the standard item status workflow |

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

### 5.8 Post-Trip Review

| ID | Requirement |
|----|-------------|
| RV-01 | User can initiate a post-trip review at any time after the trip end date |
| RV-02 | Review mode presents all items for the trip and prompts the user to update statuses |
| RV-03 | User can add post-visit notes and ratings to completed items during review |
| RV-04 | User confirms review is complete by marking the trip as Locked |

### 5.9 Admin and Settings Panel

| ID | Requirement |
|----|-------------|
| AD-01 | Admin panel allows user to manage all structured lists without developer involvement |
| AD-02 | Manageable lists: Trip Categories, Activities, Companions, Map Shading States |
| AD-03 | User can add, edit, rename, or deactivate items in any structured list |
| AD-04 | Map shading colours are configurable per state via colour picker in the admin panel |
| AD-05 | Region tier can be enabled or disabled per country in the admin panel |
| AD-06 | Deactivated list items are hidden from entry forms but preserved on existing records |

---

## 6. Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NF-01 | Local Mac desktop app — no internet connection required for core features |
| NF-02 | Map view requires internet connection to render |
| NF-03 | Data is stored locally on the user's machine as a file-based database (SQLite) |
| NF-04 | Database file can be stored in OneDrive for single-user sync across personal devices |
| NF-05 | Architecture must support future migration to a hosted web app without a data model rebuild |
| NF-06 | Architecture must support future migration to an iOS mobile app without a data model rebuild |
| NF-07 | Architecture must support future addition of trip companion access (read-only and edit) |
| NF-08 | Architecture must support future notification engine without structural changes |

---

## 7. Out of Scope — MVP

The following are explicitly out of scope for MVP but must not be architecturally blocked by MVP decisions:

- Push notifications and reminders of any kind
- Post-trip review prompts
- Trip companion access (shared or read-only)
- Recommendation sharing via link
- Import of historical trip data
- Offline map rendering
- Mobile app

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

- Recommendation sharing via generated link (place-level, not full trip)
- Trip companion access — invite companions to view or edit a shared trip
- Pre-trip planning as a first-class mode
- iOS mobile app
- Multi-user hosted web app with real-time sync (replaces OneDrive sync)

---

## 10. Open Questions

| ID | Question | Owner |
|----|----------|-------|
| OQ-01 | Mapping library — Google Maps API (requires API key, cost implications at scale) vs open-source alternative like Leaflet.js with OpenStreetMap | Deferred to Architect — recommendation required in technical blueprint |
| OQ-02 | Desktop app framework — Electron, Tauri, or local web server in browser | PO direction: target is a packaged .app (Electron or Tauri preferred); localhost-in-browser is acceptable for beta phase. Final technology selection deferred to Architect |

---

## 11. Assumptions

- Ryan will manually enter all historical trip data — no import tooling required
- The app will primarily be used on a single Mac
- OneDrive sync is acceptable for personal multi-device use — simultaneous multi-user editing is not a requirement for MVP
- Photo albums are managed externally (Apple Photos, Google Photos etc) — the app stores a reference link only
- SQLite is the assumed local database format pending Architect confirmation

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

*Document status: Approved. This document is the authoritative requirements reference for all team members. Changes must be approved by the product owner and recorded in the change log.*
