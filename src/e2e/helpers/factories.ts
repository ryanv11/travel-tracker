import type { APIRequestContext } from '@playwright/test';

// ─── Trips ───────────────────────────────────────────────────────────────────

export interface TripFormData {
  name: string;
  start_date: string;
  end_date: string;
}

export interface TripSummary {
  id: number;
  name: string;
  status: string;
  start_date: string;
  end_date: string;
}

export async function createTrip(
  request: APIRequestContext,
  overrides: Partial<TripFormData> = {},
): Promise<TripSummary> {
  const data: TripFormData = {
    name: overrides.name ?? 'Test Trip',
    start_date: overrides.start_date ?? '2026-06-01',
    end_date: overrides.end_date ?? '2026-06-10',
  };
  const res = await request.post('http://localhost:3001/api/trips', { data });
  if (!res.ok()) throw new Error(`createTrip failed: ${res.status()} ${await res.text()}`);
  return res.json() as Promise<TripSummary>;
}

export async function deleteAllTrips(request: APIRequestContext): Promise<void> {
  const res = await request.get('http://localhost:3001/api/trips');
  if (!res.ok()) return;
  const trips = (await res.json()) as TripSummary[];
  for (const trip of trips) {
    await request.delete(`http://localhost:3001/api/trips/${trip.id}`);
  }
}

export async function transitionTripStatus(
  request: APIRequestContext,
  tripId: number,
  status: string,
): Promise<void> {
  const res = await request.patch(`http://localhost:3001/api/trips/${tripId}/status`, {
    data: { status },
  });
  if (!res.ok())
    throw new Error(`transitionTripStatus failed: ${res.status()} ${await res.text()}`);
}

// ─── Cities ──────────────────────────────────────────────────────────────────

export interface CityData {
  id: number;
  name: string;
  country_code: string;
  geocode_status: string;
}

export async function createCity(
  request: APIRequestContext,
  overrides: { name?: string; country_code?: string } = {},
): Promise<CityData> {
  const data = {
    name: overrides.name ?? 'Test City',
    country_code: overrides.country_code ?? 'FR',
  };
  const res = await request.post('http://localhost:3001/api/cities', { data });
  if (!res.ok()) throw new Error(`createCity failed: ${res.status()} ${await res.text()}`);
  return res.json() as Promise<CityData>;
}

/**
 * Returns an existing city matching name+country_code, or creates one.
 * Use this in place/item test setup — cities persist across test runs.
 */
export async function getOrCreateCity(
  request: APIRequestContext,
  name: string,
  countryCode: string = 'FR',
): Promise<CityData> {
  const searchRes = await request.get(
    `http://localhost:3001/api/cities?q=${encodeURIComponent(name)}`,
  );
  if (searchRes.ok()) {
    const cities = (await searchRes.json()) as CityData[];
    const existing = cities.find((c) => c.name === name && c.country_code === countryCode);
    if (existing) return existing;
  }
  return createCity(request, { name, country_code: countryCode });
}

// ─── Places ──────────────────────────────────────────────────────────────────

export interface PlaceData {
  id: number;
  trip_id: number;
  city_id: number;
}

export async function createPlace(
  request: APIRequestContext,
  tripId: number,
  cityId: number,
): Promise<PlaceData> {
  const res = await request.post(`http://localhost:3001/api/trips/${tripId}/places`, {
    data: { city_id: cityId },
  });
  if (!res.ok()) throw new Error(`createPlace failed: ${res.status()} ${await res.text()}`);
  return res.json() as Promise<PlaceData>;
}

// ─── Items ───────────────────────────────────────────────────────────────────

export interface ItemData {
  id: number;
  trip_id: number;
  item_type: string;
  status: string;
  notes?: string;
}

export async function createItem(
  request: APIRequestContext,
  tripId: number,
  overrides: {
    item_type?: string;
    status?: string;
    trip_place_id?: number | null;
    notes?: string;
  } = {},
): Promise<ItemData> {
  const data = {
    item_type: overrides.item_type ?? 'note',
    status: overrides.status ?? 'consider',
    trip_place_id: overrides.trip_place_id ?? null,
    notes: overrides.notes ?? 'Test note',
  };
  const res = await request.post(`http://localhost:3001/api/trips/${tripId}/items`, { data });
  if (!res.ok()) throw new Error(`createItem failed: ${res.status()} ${await res.text()}`);
  return res.json() as Promise<ItemData>;
}
