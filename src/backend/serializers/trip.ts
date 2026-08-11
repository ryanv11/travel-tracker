/**
 * Travel Tracker — Trip serializer (QUAL-49)
 *
 * The single home for the trip response envelope, shared by the trips LIST
 * (`buildTripResponse`) and the trips DETAIL (GET /:id) handlers, which emitted
 * an identical envelope from two hand-written copies. The only difference
 * between list and detail is the shape of the `places` array, which the caller
 * builds (via the place serializers) and passes in — so the envelope itself is
 * written once.
 */

/** The trip_places associations block spread into the envelope. */
export interface TripAssociations {
  categories: Array<{ id: number | null; name: string | null }>;
  companions: Array<{ id: number | null; name: string | null }>;
  activities: Array<{ id: number | null; name: string | null }>;
}

/** The scalar trip columns the envelope surfaces. */
export interface TripRow {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  status: string;
  photoAlbumRef: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * The full trip response: scalar fields + associations + (already-serialized)
 * places + countries. Callers assemble `places` with the place serializers
 * (summary for the list, detail for GET /:id) and pass `associations`/`countries`
 * straight from the repository.
 */
export function serializeTrip(
  trip: TripRow,
  parts: {
    associations: TripAssociations;
    places: unknown[];
    countries: unknown[];
  },
) {
  return {
    id: trip.id,
    name: trip.name,
    start_date: trip.startDate,
    end_date: trip.endDate,
    status: trip.status,
    photo_album_ref: trip.photoAlbumRef,
    created_at: trip.createdAt,
    updated_at: trip.updatedAt,
    ...parts.associations,
    places: parts.places,
    countries: parts.countries,
  };
}
