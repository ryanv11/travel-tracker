/**
 * TypeScript types matching the Travel Tracker API response shapes.
 *
 * These types are defined to match the API contract documented in
 * jobs/backend/tech/20260307-api-reference.md (v1.1).
 *
 * We define frontend-specific API types here (rather than importing Drizzle
 * InferSelectModel directly) to avoid bundling Node/Drizzle dependencies into
 * the frontend build. The shapes mirror the API responses exactly.
 */

// ============================================================
// ENUMS / LITERALS
// ============================================================

export type TripStatus = 'planning' | 'active' | 'review_pending' | 'locked';

export type ItemType = 'restaurant' | 'hotel' | 'flight' | 'car_rental' | 'experience' | 'note';

export type ItemStatus = 'consider' | 'confirmed' | 'completed' | 'cancelled' | 'next_time';

/**
 * BUG-75/UX-12 build (COO-approved type-truth fix): aligned to the backend's
 * actual CHECK constraint (`src/backend/db/schema.ts:144` —
 * `chk_cities_geocode_status`, `IN ('pending', 'resolved', 'unresolvable')`).
 * Previously said `'failed'`, a value the backend never sends — verified with
 * two probes (grep across src/frontend for a `'failed'` literal compared
 * against this type: none outside this declaration and one now-corrected test
 * fixture; read of the backend CHECK constraint itself) that no frontend logic
 * compared against `'failed'`, so the fix is a pure type-truth correction with
 * zero runtime ripple.
 */
export type GeocodeStatus = 'pending' | 'resolved' | 'unresolvable';

export type ShadingStateKey =
  | 'never_visited'
  | 'planned'
  | 'active'
  | 'visited_once'
  | 'visited_once_planning'
  | 'visited_multiple'
  | 'visited_multiple_planning';

// ============================================================
// ADMIN / REFERENCE TYPES
// ============================================================

export interface Category {
  id: number;
  name: string;
  // ADL-46: serializeCategory (src/backend/routes/categories.ts) coerces the
  // SQLite 0|1 column to a real boolean before it ever reaches the wire —
  // this type had said `number` since before the route moved and never
  // matched the actual JSON. Fixed as part of the ADL-46 frontend stage
  // (issue #340) per its instruction to verify shapes rather than assume.
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Activity {
  id: number;
  name: string;
  is_active: boolean; // see Category.is_active — same pre-existing fix
  created_at: string;
  updated_at: string;
}

export interface Companion {
  id: number;
  name: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface Country {
  country_code: string;
  name: string;
  region_tier_enabled: boolean;
  region_tier_label: string | null;
}

export interface Region {
  id: number;
  country_code: string;
  name: string;
  iso_3166_2: string;
  created_at: string;
  updated_at: string;
}

/**
 * A single candidate from GET /api/geocode's `candidates` array (ADL-46 D7/D14).
 * See src/backend/routes/geocode.ts for the serialization.
 */
export interface GeocodeCandidate {
  name: string;
  display_name: string;
  country_code: string | null;
  region_iso: string | null;
  latitude: number;
  longitude: number;
  /**
   * BUG-75/UX-12 (v3 §B1/§2.1) — the OSM reference this candidate carries.
   * Typed optional (not required) for the same reason `GeocodeResult.truncated`
   * is optional: existing hand-written fixtures that predate this field
   * (AddPlaceFlow.test.tsx's ADL-46 F1/F2 parity fixtures, bug71/bug78-79
   * fixtures) construct candidates without it and must keep type-checking.
   * When both are present, a distinct (osm_type, osm_id) pair is positive
   * evidence of a distinct real place — see AddPlaceFlow.tsx's place-level
   * ambiguity check, which only fires on that positive evidence rather than
   * inferring distinctness from region_iso/display_name alone.
   */
  osm_type?: 'node' | 'way' | 'relation';
  osm_id?: number;
  /**
   * BUG-81 — structured NAMES (not codes) for a clean "City, State, Country"
   * picker row, distinct from `country_code`/`region_iso` above. `county` is
   * a disambiguation aid only (add to the label to distinguish two
   * same-state candidates), not identity. Typed optional for the same
   * reason `osm_type`/`osm_id` are: existing hand-written fixtures that
   * predate this field must keep type-checking. Presentation (label
   * composition, collision-county rule, scroll cap) is a FRONTEND
   * follow-up, not defined by this type.
   */
  state?: string | null;
  country?: string | null;
  county?: string | null;
}

/** Response shape of GET /api/geocode (ADL-46 D7/D14, GE-15). */
export interface GeocodeResult {
  candidates: GeocodeCandidate[];
  country_code: string | null;
  region_iso: string | null;
  /**
   * BUG-79: true when the backend's raw Nominatim response was at least as
   * large as the limit it requested — there may be more matches upstream
   * than `candidates` shows. Always sent by the backend (see geocode.ts), but
   * typed optional here so existing hand-written test fixtures that predate
   * this field (useCities.geocode.test.tsx and friends) aren't forced to add
   * it where the truncation behaviour isn't what they're testing.
   */
  truncated?: boolean;
  /**
   * BUG-74 (ADL-51 §6) — mirrors the backend's internal `NominatimSearchResult`
   * union (`src/backend/routes/geocode.ts`). Distinguishes "our backend
   * answered, but the upstream geocoder failed or is disabled" (`'error'` /
   * `'disabled'`) from a genuine no-match (`'ok'` with empty `candidates`) —
   * previously both collapsed to an indistinguishable `candidates: []` at
   * HTTP 200, which is exactly why BUG-76 was invisible to the user. Always
   * HTTP 200 regardless of `status` (see the backend route doc comment for
   * why a non-2xx was rejected). Typed optional for the same reason
   * `truncated` is: existing hand-written fixtures that predate this field
   * must keep type-checking; the real backend always sends it.
   */
  status?: 'ok' | 'error' | 'disabled';
}

// Minimal association shapes used inside trip responses
export interface AssocCategory {
  id: number;
  name: string;
}

export interface AssocActivity {
  id: number;
  name: string;
}

export interface AssocCompanion {
  id: number;
  name: string;
}

// ============================================================
// CITIES
// ============================================================

export interface City {
  id: number;
  name: string;
  country_code: string;
  /** Full country name — present in trip detail responses (DP-04). Null for list/map endpoints. */
  country_name: string | null;
  region_id: number | null;
  region_iso: string | null;
  /**
   * Human-readable region name (e.g. "Illinois"). Optional (not just
   * nullable): present on GET /api/cities search results (BUG-72, PR #353's
   * LEFT JOIN onto `regions`), and — as of BUG-80 — also on the city objects
   * nested in trip list/detail responses (GET /api/trips, GET /api/trips/:id)
   * and on GET /api/cities/:id, all via the same LEFT JOIN pattern. Still
   * genuinely absent from POST /api/cities and PATCH /api/cities/:id
   * (serializeCity, cities.ts) — audited for BUG-80 and left unjoined because
   * nothing renders those responses' region fields (see BUG-80 park doc).
   * Null means "joined, but this city has no region_id"; undefined means
   * "this response never joined `regions` at all" — callers must not conflate
   * the two into "no region" (see formatCitySubtitle, utils/formatCitySubtitle.ts).
   */
  region_name?: string | null;
  latitude: number | null;
  longitude: number | null;
  geocode_status: GeocodeStatus;
}

// ============================================================
// ITEMS (flat response — all extension fields present, null if N/A)
// ============================================================

export interface Item {
  id: number;
  item_type: ItemType;
  status: ItemStatus;
  notes: string | null;
  /** Optional map/directions link (IT-10, ADL-45). https:// only, null if unset. */
  map_url: string | null;
  is_carried_forward: boolean;
  carried_from_item_id: number | null;
  created_at: string;
  updated_at: string;
  trip_place_id: number | null;

  // Restaurant fields
  name: string | null;
  neighbourhood_area: string | null;
  cuisine_type: string | null;
  source: string | null;
  rating: number | null;
  post_visit_notes: string | null;

  // Flight fields
  airline: string | null;
  flight_number: string | null;
  departure_airport: string | null;
  arrival_airport: string | null;
  departure_datetime: string | null;
  arrival_datetime: string | null;
  booking_reference: string | null;
  seat: string | null;

  // Hotel fields
  property_name: string | null;
  address: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
  confirmation_number: string | null;

  // Car rental fields
  provider: string | null;
  pickup_location: string | null;
  dropoff_location: string | null;
  pickup_datetime: string | null;
  dropoff_datetime: string | null;
  vehicle_class: string | null;
}

// ============================================================
// PLACES
// ============================================================

export interface TripPlace {
  id: number;
  city_id: number;
  /** Explicit place arrival date (YYYY-MM-DD). Absent or null means not set. */
  arrived_on?: string | null;
  /** Explicit place departure date (YYYY-MM-DD). Absent or null means not set. */
  departed_on?: string | null;
  created_at: string;
  city: City;
  activities: AssocActivity[];
  items: Item[];
}

// Place shape without items (used in standalone place list)
export interface TripPlaceNoItems extends Omit<TripPlace, 'items'> {}

// ============================================================
// TRIPS
// ============================================================

/** Minimal place shape included in TripSummary for map city-pin rendering (BC-01). */
export interface TripSummaryPlace {
  id: number;
  city_id: number;
  city: City;
}

export interface TripSummary {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  status: TripStatus;
  photo_album_ref: string | null;
  created_at: string;
  updated_at: string;
  categories: AssocCategory[];
  companions: AssocCompanion[];
  activities: AssocActivity[];
  countries: { country_code: string; name: string }[];
  /** Minimal places data for city-pin rendering on MapPage (BC-01). */
  places: TripSummaryPlace[];
}

export interface TripDetail extends TripSummary {
  places: TripPlace[];
}

// ============================================================
// MAP SHADING
// ============================================================

export interface CountryShading {
  country_code: string;
  state_key: ShadingStateKey;
  color_hex: string | null;
  display_name: string;
}

export interface RegionShading {
  region_id: number;
  iso_3166_2: string;
  region_name: string;
  state_key: ShadingStateKey;
  color_hex: string | null;
  display_name: string;
}

export interface ShadingConfig {
  state_key: ShadingStateKey;
  display_name: string;
  color_hex: string;
  updated_at: string;
}

// ============================================================
// CARRY-FORWARD
// ============================================================

export interface CarryForwardCandidate {
  id: number;
  item_type: ItemType;
  status: 'next_time';
  notes: string | null;
  source_trip_name: string;
  source_trip_end_date: string;
  restaurant_name: string | null;
  hotel_property_name: string | null;
}

export interface CarryForwardResult {
  created_item_ids: number[];
  count: number;
}

// ============================================================
// CITY ITEMS (GET /api/cities/:id/items)
// ============================================================

export interface CityItem {
  id: number;
  item_type: ItemType;
  status: 'completed';
  notes: string | null;
  trip_name: string;
  trip_start_date: string;
  restaurant_name: string | null;
  restaurant_rating: number | null;
  restaurant_post_visit_notes: string | null;
  hotel_property_name: string | null;
  hotel_rating: number | null;
  hotel_post_visit_notes: string | null;
  experience_rating: number | null;
  experience_post_visit_notes: string | null;
}

// ============================================================
// ME (GET /api/me) — BUG-26 / SE-02
// ============================================================

/** Identity of the authenticated caller, used for owner-only UI gating. */
export interface Me {
  id: string;
  email: string;
  /** ADL-27 owner flag: 1 = owner, 0 = non-owner. */
  isOwner: number;
}

// ============================================================
// HEALTH (GET /health) — QUAL-26
// ============================================================

/**
 * Liveness plus the identity of the build serving this response.
 *
 * Unauthenticated and NOT under /api — it is the deployment's own liveness endpoint. The
 * only reason the frontend reads it is to answer "which build am I looking at?" without
 * leaving the app, which is what QUAL-26 exists for.
 */
export interface Health {
  status: 'ok';
  /** Short (7-char) commit SHA, or the literal `'unknown'` when no SHA could be resolved. */
  commit: string;
  /** Full 40-char commit SHA, or null when unknown. */
  commitFull: string | null;
  /** ISO-8601 build timestamp, or null when the build did not record one. */
  builtAt: string | null;
}
