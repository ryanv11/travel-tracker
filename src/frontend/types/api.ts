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

export type ItemType =
  | 'restaurant'
  | 'hotel'
  | 'flight'
  | 'car_rental'
  | 'experience'
  | 'note';

export type ItemStatus =
  | 'consider'
  | 'confirmed'
  | 'completed'
  | 'cancelled'
  | 'next_time';

export type GeocodeStatus = 'pending' | 'resolved' | 'failed';

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
  is_active: number; // SQLite boolean: 0 | 1
  created_at: string;
  updated_at: string;
}

export interface Activity {
  id: number;
  name: string;
  is_active: number;
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
  created_at: string;
  updated_at: string;
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
  region_id: number | null;
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
