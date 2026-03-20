import type { APIRequestContext } from '@playwright/test';

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
