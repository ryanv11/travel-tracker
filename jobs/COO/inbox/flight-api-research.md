# Flight Data API Research — Pre-Population Use Case

**Date:** 2026-03-20 (updated 2026-03-21)
**Use case:** Given a flight number (e.g. "EI204") and a date, look up airline name, departure airport, arrival airport, and scheduled departure/arrival times for pre-populating a flight item form. Not real-time tracking.

**Scope note (2026-03-21):** Original research was scoped to flight lookup only. PO direction is to evaluate Amadeus as a broader platform — they also offer hotel and car rental APIs, making a single Amadeus integration the preferred approach over multiple point solutions. The hotel and car rental API coverage below reflects initial assessment; full validation of those endpoints is part of the FL-04/HT/CR Phase 2 brief.

---

## Comparison Table

| Provider | Data Types | Free Tier | Paid Entry Point | HTTPS on Free | Flight-by-Number Endpoint | Personal Use OK | Notes |
|---|---|---|---|---|---|---|---|
| **Google Flights** | Search/pricing | None (deprecated) | Enterprise only | N/A | No public API | No | QPX shutdown in 2018; no replacement |
| **AviationStack** | Real-time, schedules, historical | 100 req/mo | $49.99/mo (10k calls) | No (HTTP only) | Yes (`/flights?flight_iata=`) | Yes | Free tier HTTP-only — browser will block calls from HTTPS page (mixed content). Fine for local dev; blocker for hosted deployment unless on paid plan. Schedule endpoints throttled 1 req/60s. |
| **AeroDataBox** | Real-time, schedules, historical | ~300–600 req/mo via API.Market | $5/mo (3k calls) | Yes | Yes (`/flights/number/{flightNumber}/{date}`) | Yes | Best fit for this use case; affordable; coverage gaps noted |
| **OpenSky Network** | Real-time ADS-B only | Generous (4000 credits/day) | Free (research/non-commercial) | Yes | No (no schedule data) | Yes (non-commercial) | No schedule data; only live ADS-B positions |
| **Amadeus for Developers** | Schedules, real-time, offers | ~2000 req/mo (test env) | Pay-per-use after free quota | Yes | Yes (`/v2/schedule/flights`) | Yes | Solid free quota; test env uses limited real data |
| **FlightAware AeroAPI** | Real-time, historical, schedules | 500 req/mo (personal tier) | $100/mo (standard/commercial) | Yes | Yes (`/flights/{ident}`) | Yes (personal tier) | 500 free calls/mo for personal; commercial requires paid |
| **OAG** | Schedules, historical (authoritative) | 14-day trial, 100 hits only | Custom pricing (enterprise) | Yes | Yes | Not practical | Enterprise-oriented; no self-serve personal plan |
| **Cirium (FlightStats)** | Real-time, schedules, historical | 30-day eval only | Custom contract | Yes | Yes | Not practical | Eval period only; pricing requires sales contact |

---

## Candidate Details

### Google Flights / QPX Express

**Status: No usable public API exists.**

The PO's assumption that Google has a usable public API is incorrect. QPX Express — Google's flight data API inherited from the ITA Software acquisition — was shut down in April 2018 for new customers and fully deprecated thereafter. No replacement has been published.

What does exist from Google:
- **Travel Impact Model API** (developers.google.com/travel/impact-model): Returns estimated CO₂ emissions for flights. Not relevant to scheduling.
- **Google Flights Enterprise**: Exists but requires a direct commercial agreement with Google. Not self-serve, not public, not accessible to individual developers.
- **Third-party scrapers** (SerpApi, SearchAPI.io, Apify): These scrape Google Flights search results and wrap them in a REST interface. They are not official Google APIs, carry ToS risk, and charge per query ($5–$50+/mo for meaningful usage). They return fares and routing, not structured schedule data.

**Verdict:** No viable path for this use case through Google.

---

### AviationStack

**URL:** https://aviationstack.com

1. **Data provided:** Real-time flight tracking (30–60s delay), historical flights, timetables/schedules (`/timetable`), routes. Covers 250+ countries, 13,000+ airlines, 10,000+ airports.

2. **Free tier / pricing:**
   - Free: 100 API requests/month, no credit card required
   - Basic: $49.99/mo — 10,000 calls
   - Professional: $149.99/mo — 50,000 calls
   - Business: $499.99/mo — 250,000 calls

3. **API quality:** REST, JSON. Access key via query parameter (`?access_key=`). Simple to integrate. Good documentation.

4. **Commercial licensing:** Personal use permitted on all tiers including free. No special commercial restriction stated for small apps.

5. **Notable limitations:**
   - **Free tier is HTTP only — no HTTPS.** This is a meaningful security concern even for a personal app (API key exposed in plain text).
   - Schedule/timetable endpoints (`/timetable`, `/flightsfuture`) are rate-limited to 1 request per 60 seconds on the free plan (vs 1 per 10s on paid).
   - 100 req/mo is extremely tight for interactive form pre-population.
   - Flights endpoint can be queried by `flight_iata` parameter (e.g. `?flight_iata=EI204`) — returns airline, departure/arrival airports, scheduled times.

**Verdict:** Technically capable for this use case but the HTTP-only free tier is a real problem, and 100 req/mo is inadequate. Paid entry at $49.99/mo is expensive for a personal app.

---

### AeroDataBox (via RapidAPI / API.Market)

**URL:** https://aerodatabox.com | https://rapidapi.com/aedbx-aedbx/api/aerodatabox

1. **Data provided:** Real-time flight status, scheduled and historical flight data, airport departures/arrivals, aircraft data, airport information. Supports lookup by IATA flight number, tail number, ICAO Mode-S address.

2. **Free tier / pricing (via RapidAPI):**
   - Free/trial: ~300–600 calls/mo for $0.99/mo on RapidAPI; free on API.Market
   - Basic: ~$5/mo for 3,000 calls
   - Pro: ~$15/mo for 15,000 calls
   - Ultra: ~$50/mo for 100,000 calls
   - Mega: ~$150/mo for 300,000 calls

3. **API quality:** REST, JSON. Available via RapidAPI (X-RapidAPI-Key header) or direct API key. Well-documented at doc.aerodatabox.com. Endpoints include:
   - `GET /flights/number/{flightNumber}/{date}` — returns scheduled and actual times, departure/arrival airports (IATA codes + names), airline info for a specific flight on a date
   - `GET /flights/number/{flightNumber}/{fromDate}/{toDate}` — range query

4. **Commercial licensing:** Designed for individual developers and small teams. No commercial licensing requirement for personal use.

5. **Notable limitations:**
   - Self-described as "enthusiast-driven" — not enterprise-grade. No SLA currently (SLA tier announced for 2025 but status unclear as of this writing).
   - Live real-time coverage is mostly European airports; static schedule data has broader global reach.
   - Data quality is good but not guaranteed to match airline sources exactly.
   - History/schedule range per request limited by tier (7 days on Basic/Pro, 14 on Ultra, 30 on Mega).

**Verdict:** Best fit for this use case. The endpoint directly addresses the need (flight number + date → airline, airports, scheduled times). Pricing is the most accessible in the market for personal apps. The modest limitations are acceptable for form pre-population.

---

### OpenSky Network

**URL:** https://opensky-network.org

1. **Data provided:** Real-time ADS-B flight tracking only. State vectors (position, altitude, velocity), arrivals/departures by airport within a time window. No airline schedules, no named routes, no carrier names from the API itself.

2. **Free tier / pricing:**
   - Free for research and non-commercial use
   - 4,000 API credits per day (generous for the data it provides)
   - OAuth2 authentication required (client credentials flow)

3. **API quality:** REST, JSON. Well-documented. Querying by flight number is not directly supported — you query by ICAO 24-bit address (aircraft transponder) or by airport + time window.

4. **Commercial licensing:** Explicitly non-commercial only.

5. **Notable limitations:**
   - **Does not provide schedule data.** The API documentation explicitly states: "The API does not provide commercial flight data such as airport schedules, delays or similar information that cannot be derived from ADS-B data contents."
   - Cannot look up a flight by IATA number (e.g. "EI204") and return scheduled times — this is a fundamental capability gap.
   - Data represents actual observed positions, not published schedules.

**Verdict:** Unsuitable for this use case. OpenSky is a real-time tracking tool built on crowd-sourced ADS-B data; it does not serve the schedule pre-population use case at all.

---

### Amadeus for Developers

**URL:** https://developers.amadeus.com

1. **Data provided:** Comprehensive flight offerings (search, pricing, booking), on-demand flight status (live and schedule), airport/airline reference data. The **On-Demand Flight Status API** directly provides: scheduled departure/arrival times, actual times, terminal/gate info, delay status, airline name, departure/arrival airport — queried by IATA carrier code + flight number + date.

2. **Free tier / pricing:**
   - Test environment: free with a limited data set (real data subset). Free quota varies per API — Flight Offers Search gets ~2,000 free/mo; On-Demand Flight Status quota not publicly specified but consistent with the self-service model.
   - Production: monthly free quota retained; overages billed at ~€0.001–€0.025 per call depending on the API.
   - No stated minimum spend for self-service production access.

3. **API quality:** REST, JSON. OAuth2 (client credentials). Excellent documentation, SDKs for Node.js, Python, Java, etc. Rate limits: 10 TPS (transactions per second) on free/test; higher on production.

4. **Commercial licensing:** Self-service tier has no commercial licensing barrier. Suitable for personal and commercial use.

5. **Notable limitations:**
   - Test environment uses a curated (limited) data set — not all flights/dates are queryable in test mode. Production access is required for full coverage.
   - Requires OAuth2 token exchange before each session (access token expires in 30 minutes) — slightly more integration overhead than API key-based services.
   - Amadeus is primarily a GDS travel commerce platform; the self-service APIs are a secondary product. Support quality for personal developers reflects this.

**Verdict:** Strong technical option. The On-Demand Flight Status API is a precise match for the use case. Free quota is usable for a personal app's volume. The main friction is OAuth2 setup and the gap between test and production data coverage.

---

### FlightAware AeroAPI

**URL:** https://www.flightaware.com/commercial/aeroapi

1. **Data provided:** Real-time flight tracking, historical flight data (actual times), future schedules, airport arrivals/departures, aircraft data. AeroAPI returns the complete flight object including scheduled gate/runway departure and arrival times, actual times, airline, origin/destination airports.

2. **Free tier / pricing:**
   - Personal tier: 500 API calls/month free. License restricts to personal/academic use only.
   - Standard: $100/mo — commercial B2C use
   - Premium: $1,000/mo — commercial B2B, includes Aireon space-based ADS-B

3. **API quality:** REST, JSON. API key authentication (header). 60+ endpoints, excellent documentation, interactive developer portal. 5 queries per minute on free tier.

4. **Commercial licensing:** Personal tier explicitly restricts to personal/academic purposes. A small personal travel tracker qualifies. If the app ever becomes a product, a paid commercial tier is required.

5. **Notable limitations:**
   - 500 free calls/mo is workable but tight if the user pre-populates frequently.
   - Future schedule data availability beyond 2 days has been noted as limited in community discussions — primarily strong on current/historical data.
   - The 5 QPM rate limit on the free tier is restrictive if multiple lookups happen in quick succession.
   - FlightAware is a Collins Aerospace subsidiary — strong data quality and SLA, but commercial escalation is expensive.

**Verdict:** Technically excellent and free for personal use. 500 req/mo is adequate for an individual travel tracker (assuming 1–2 lookups per flight added). Commercial path is expensive, so this only works long-term if the app stays personal.

---

### OAG

**URL:** https://developers.oag.com | https://www.oag.com/flight-info-api

1. **Data provided:** OAG is the industry-standard source for airline schedules. Their data underpins many downstream providers. The Flight Info API provides: scheduled flight times, codeshares, equipment type, on-time statistics, departure/arrival airports. Authoritative and comprehensive global coverage.

2. **Free tier / pricing:**
   - Trial: 14 days, maximum 100 API hits. No ongoing free tier.
   - Paid: Fixed fee based on usage tier, with per-hit overage charges. Specific prices not publicly listed — contact sales required.
   - Based on industry context and third-party reviews, OAG pricing is enterprise-grade (typically hundreds to thousands of dollars/month).

3. **API quality:** REST, JSON. API key authentication. Good documentation via developer portal. Subscription management is self-serve via developer portal after signup.

4. **Commercial licensing:** All usage beyond trial requires a paid subscription. No personal-use free tier.

5. **Notable limitations:**
   - No free ongoing access.
   - Pricing is not published — must engage sales for any paid plan, suggesting it is not designed for individual developers.
   - Overkill for a personal travel tracker; the data quality premium is not worth the cost at this scale.

**Verdict:** Authoritative but not viable for a personal app. The 14-day/100-hit trial is useful for evaluation only. Pricing will be prohibitive.

---

### Cirium (FlightStats)

**URL:** https://developer.cirium.com | https://developer.flightstats.com

1. **Data provided:** Real-time flight status, historical data, schedules, delay statistics, weather correlations, airport reference data. Flex APIs cover: flight status by flight number, airport arrivals/departures, schedules, ratings, delay index. Returns scheduled and actual departure/arrival times, terminal/gate, airline, airports.

2. **Free tier / pricing:**
   - Evaluation plan: 30-day trial, limited API transactions (exact number not specified publicly).
   - Commercial plan: Pay-per-use after eval; pricing requires contacting Cirium sales. No self-serve pricing published.
   - Premium APIs (e.g. Flight Status Feed): Contract plan only.

3. **API quality:** REST, JSON. Well-documented developer portal. Supports lookup by flight number and date (e.g. `GET /flex/flightstatus/rest/v2/json/flight/status/{carrier}/{flightNumber}/arr/{year}/{month}/{day}`).

4. **Commercial licensing:** All post-trial usage requires a commercial agreement. No personal-use exception stated.

5. **Notable limitations:**
   - Like OAG, pricing is not self-serve or transparent — unsuitable for a personal developer who doesn't want to negotiate contracts.
   - 30-day eval is better than OAG's 14 days but still temporary.
   - Cirium is an LexisNexis/RELX Group property — enterprise positioning throughout.

**Verdict:** Technically capable and well-documented, but not viable for a personal app. No path to sustainable low-cost access after the evaluation period.

---

## Recommendation

### Selected platform: Amadeus for Developers

**PO direction (2026-03-21):** Amadeus is the preferred platform. The decision is driven by breadth — Amadeus covers flights, hotels, and car rentals under a single integration, a single set of credentials, and a single OAuth2 client. Building one integration instead of three point solutions is the right call.

**Why Amadeus works for this use case:**
- On-Demand Flight Status API: exact match for FL-04 (flight number + date → airline, airports, scheduled times)
- Hotel Search / Hotel Offers API: hotel lookup for HT pre-population
- Car rental APIs: available via Amadeus travel content (needs endpoint validation in Phase 2 brief)
- Two environments: test (free, limited data) and production (free quota + pay-per-use overages at ~€0.001–€0.025/call)
- No minimum spend, no sales engagement required for self-serve access
- GDS-quality data — most authoritative source in the comparison
- SDKs available for Node.js (fits the Express backend)

**Known friction:**
- OAuth2 client credentials flow adds implementation overhead vs. API key approaches. Backend must exchange credentials for an access token (30 min TTL) before calling APIs. Token caching recommended.
- Test environment uses a curated data subset — not all flights/dates are available. Production access needed for full validation.

**Next step:** Phase 2 brief should include validation of Amadeus hotel and car rental endpoint coverage before committing to the full integration.

---

### Candidates not selected

| Provider | Reason |
|---|---|
| AeroDataBox | Flight-only; would still need separate hotel/car rental integrations |
| FlightAware AeroAPI | Flight-only; personal tier free but no hotel/car rental coverage |
| Google Flights | No public API exists |
| OpenSky Network | No schedule data — real-time ADS-B only |
| AviationStack | HTTP-only free tier (mixed content blocker for hosted deployment); flight-only |
| OAG / Cirium | Enterprise pricing only; no self-serve personal tier |

---

## Implementation note (not code)

Whichever API is chosen, the integration pattern is: user enters flight number + date in the form → client calls backend → backend calls flight API with credentials stored server-side → pre-populate form fields. The API key must never be exposed to the browser. AeroDataBox's RapidAPI key and Amadeus's OAuth2 client secret both fit this pattern naturally.
