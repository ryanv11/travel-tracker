/**
 * GeocodeQueueIndicator — GE-19 / ADL-55 (BUG-85): the interactive geocode
 * status indicator.
 *
 * Replaces the old inline "☁ Geocoding pending (n)" button in App.tsx (which
 * read the retired NR-06 localStorage queue and only offered a blunt
 * retry/dismiss). This component:
 *   - reads its state from `GET /api/geocode-queue` (the source of truth,
 *     `useGeocodeQueue`) — never localStorage;
 *   - splits the queue into two VISUALLY DISTINCT buckets (BRD GE-19 /
 *     criterion 10): actively-*resolving* cities vs *needs-attention* cities
 *     (`needs_attention`/`unresolvable`), the latter never folded into the
 *     resolving count;
 *   - opens a panel listing each queued city with name, country/region and a
 *     plain-language cause label (ADL-55 §4 / criterion 9); and
 *   - wires the two recovery actions for a stuck city by REUSING the existing
 *     surfaces — `ChangeCityModal` (re-point, GE-16) and `useRemovePlace`
 *     (remove the referencing place, OQ-1 — there is no soft-dismiss).
 *
 * How a city (from the queue) reaches its place-level recovery: the queue
 * endpoint returns cities, not places, but re-point and remove are inherently
 * place operations (`{tripId, placeId}`). The city→place join is derived from
 * the trips the app already loads (`useTrips` → `GET /api/trips`, whose places
 * carry `city_id`). This is not a second source of truth — the queue owns
 * "which of my cities are stuck", the trips list owns "which of my places
 * reference that city", and every queue city has ≥1 referencing place by
 * construction (both derive from the same userId-scoped `trip_places → trips`).
 *
 * VISUAL TREATMENT FLAGGED FOR PO UAT: the exact needs-attention styling (amber
 * warning affordance + ⚠, distinct from the muted "resolving" chip) is a
 * sensible default chosen here, not a UX-spec'd mockup — see the GE-19
 * completion report.
 */
import { useMemo, useState } from 'react';
import { useCountries } from '../../hooks/useAdmin';
import { useGeocodeQueue } from '../../hooks/useGeocodeQueue';
import { useRemovePlace } from '../../hooks/usePlaces';
import { useTrips } from '../../hooks/useTrips';
import type { GeocodeQueueEntry, TripStatus, TripSummary } from '../../types/api';
import { formatCitySubtitle } from '../../utils/formatCitySubtitle';
import { geocodeQueueLabel } from '../../utils/geocodeQueueLabels';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { ChangeCityModal } from '../TripDetail/ChangeCityModal';

/** One place that references a stuck city, with the trip it belongs to. */
interface PlaceRef {
  tripId: number;
  placeId: number;
  tripName: string;
  tripStatus: TripStatus;
}

/**
 * Builds a `cityId → PlaceRef[]` index from the user's trips. A city may be
 * referenced by several places across trips, so each reference is listed.
 *
 * @param trips - The user's trips (GET /api/trips); each place carries city_id.
 * @returns Map of city id to the places (with trip context) referencing it.
 */
function buildCityPlaceIndex(trips: TripSummary[]): Map<number, PlaceRef[]> {
  const index = new Map<number, PlaceRef[]>();
  for (const trip of trips) {
    for (const place of trip.places) {
      const refs = index.get(place.city_id) ?? [];
      refs.push({
        tripId: trip.id,
        placeId: place.id,
        tripName: trip.name,
        tripStatus: trip.status,
      });
      index.set(place.city_id, refs);
    }
  }
  return index;
}

export function GeocodeQueueIndicator() {
  const { resolving, needsAttention, resolvingCount, needsAttentionCount } = useGeocodeQueue();
  const { data: trips = [], isLoading: tripsLoading } = useTrips();
  const { data: countries = [] } = useCountries();
  const removePlace = useRemovePlace();

  const [open, setOpen] = useState(false);
  const [changeTarget, setChangeTarget] = useState<PlaceRef | null>(null);
  const [removeTarget, setRemoveTarget] = useState<(PlaceRef & { cityName: string }) | null>(null);

  const refIndex = useMemo(() => buildCityPlaceIndex(trips), [trips]);

  const total = resolvingCount + needsAttentionCount;

  // No pending or stuck cities → no indicator at all (matches the old badge's
  // "only show when there's something" behaviour).
  if (total === 0) return null;

  const closePanel = () => setOpen(false);

  const handleConfirmRemove = () => {
    if (!removeTarget) return;
    removePlace.mutate(
      { tripId: removeTarget.tripId, placeId: removeTarget.placeId },
      { onSuccess: () => setRemoveTarget(null) },
    );
  };

  return (
    <div className="relative">
      {/* Badge — two structurally-separate counts so a needs-attention city is
          never silently added to the resolving number (criterion 10). */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Geocoding: ${needsAttentionCount} need attention, ${resolvingCount} resolving. Open queue.`}
        className="flex items-center gap-1.5"
        data-testid="geocode-indicator"
      >
        {needsAttentionCount > 0 && (
          <span
            data-testid="geocode-needs-attention-badge"
            className="flex items-center gap-1 px-2.5 py-1 border border-amber-500 rounded-md bg-amber-50 text-amber-800 text-xs font-semibold cursor-pointer"
          >
            <span aria-hidden="true">⚠</span>
            {needsAttentionCount} need attention
          </span>
        )}
        {resolvingCount > 0 && (
          <span
            data-testid="geocode-resolving-badge"
            className="flex items-center gap-1 px-2.5 py-1 border border-wp-border rounded-md bg-wp-bg-subtle text-wp-ink-muted text-xs font-medium cursor-pointer"
          >
            <span aria-hidden="true">☁</span>
            {resolvingCount} resolving
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Click-away backdrop — sits under the panel, over the page. */}
          <div className="fixed inset-0 z-[105]" onClick={closePanel} aria-hidden="true" />
          <div
            role="dialog"
            aria-label="Geocoding queue"
            data-testid="geocode-panel"
            className="absolute right-0 top-full mt-2 w-[360px] max-w-[95vw] max-h-[70vh] overflow-y-auto bg-white border border-wp-border rounded-lg shadow-xl z-[110] p-3"
          >
            <div className="flex items-center justify-between mb-2">
              <h2 className="m-0 text-sm font-semibold text-gray-900">Geocoding queue</h2>
              <button
                type="button"
                onClick={closePanel}
                aria-label="Close"
                className="text-gray-400 hover:text-gray-600 text-sm cursor-pointer px-1"
              >
                ✕
              </button>
            </div>

            {/* Needs-attention section — the actionable, distinct bucket. */}
            {needsAttention.length > 0 && (
              <section className="mb-3">
                <h3 className="m-0 mb-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-700">
                  Needs attention ({needsAttention.length})
                </h3>
                <ul className="list-none m-0 p-0 flex flex-col gap-2">
                  {needsAttention.map((entry) => (
                    <NeedsAttentionRow
                      key={entry.id}
                      entry={entry}
                      subtitle={formatCitySubtitle(entry, countries)}
                      label={geocodeQueueLabel(entry.geocode_status, entry.geocode_cause)}
                      refs={refIndex.get(entry.id) ?? []}
                      tripsLoading={tripsLoading}
                      onChangeCity={(ref) => setChangeTarget(ref)}
                      onRemove={(ref) => setRemoveTarget({ ...ref, cityName: entry.name })}
                    />
                  ))}
                </ul>
              </section>
            )}

            {/* Resolving section — informational; the server is still working. */}
            {resolving.length > 0 && (
              <section>
                <h3 className="m-0 mb-1.5 text-[11px] font-bold uppercase tracking-wide text-wp-ink-muted">
                  Resolving ({resolving.length})
                </h3>
                <ul className="list-none m-0 p-0 flex flex-col gap-2">
                  {resolving.map((entry) => (
                    <li
                      key={entry.id}
                      data-testid="geocode-resolving-row"
                      className="px-2.5 py-2 border border-wp-border rounded-md bg-wp-bg-subtle"
                    >
                      <div className="text-sm font-medium text-gray-900">
                        {entry.name}
                        <span className="font-normal text-gray-500">
                          {' '}
                          — {formatCitySubtitle(entry, countries)}
                        </span>
                      </div>
                      <div className="text-xs text-wp-ink-muted mt-0.5">
                        <span aria-hidden="true">⟳ </span>
                        <span data-testid="geocode-cause-label">
                          {geocodeQueueLabel(entry.geocode_status, entry.geocode_cause)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </>
      )}

      {/* Recovery: re-point via the existing ChangeCityModal (GE-16). */}
      {changeTarget && (
        <ChangeCityModal
          tripId={changeTarget.tripId}
          placeId={changeTarget.placeId}
          onClose={() => setChangeTarget(null)}
        />
      )}

      {/* Recovery: remove = delete the referencing place (OQ-1, no soft-dismiss). */}
      <ConfirmDialog
        isOpen={removeTarget !== null}
        title={removeTarget ? `Remove ${removeTarget.cityName}?` : ''}
        message={
          removeTarget
            ? `This removes the place referencing ${removeTarget.cityName} from "${removeTarget.tripName}", ` +
              `along with anything logged under it. This cannot be undone. The city then leaves your geocoding queue.`
            : ''
        }
        confirmLabel="Remove"
        onConfirm={handleConfirmRemove}
        onCancel={() => {
          removePlace.reset();
          setRemoveTarget(null);
        }}
        error={removePlace.error}
        isConfirming={removePlace.isPending}
      />
    </div>
  );
}

/** Props for one needs-attention city row. */
interface NeedsAttentionRowProps {
  entry: GeocodeQueueEntry;
  subtitle: string;
  label: string;
  refs: PlaceRef[];
  tripsLoading: boolean;
  onChangeCity: (ref: PlaceRef) => void;
  onRemove: (ref: PlaceRef) => void;
}

/**
 * Renders one stuck city: name, country/region, its plain-language cause, and
 * per referencing place a Change-city / Remove pair (disabled inside a locked
 * trip, where the underlying place is read-only).
 */
function NeedsAttentionRow({
  entry,
  subtitle,
  label,
  refs,
  tripsLoading,
  onChangeCity,
  onRemove,
}: NeedsAttentionRowProps) {
  return (
    <li
      data-testid="geocode-needs-attention-row"
      className="px-2.5 py-2 border border-amber-300 rounded-md bg-amber-50"
    >
      <div className="text-sm font-semibold text-gray-900">
        {entry.name}
        <span className="font-normal text-gray-500"> — {subtitle}</span>
      </div>
      <div className="text-xs text-amber-800 mt-0.5 flex items-center gap-1">
        <span aria-hidden="true">⚠</span>
        <span data-testid="geocode-cause-label">{label}</span>
      </div>

      {refs.length === 0 ? (
        <div className="text-[11px] text-gray-400 mt-1.5">
          {tripsLoading ? 'Finding the place that uses this city…' : null}
        </div>
      ) : (
        <div className="mt-1.5 flex flex-col gap-1.5">
          {refs.map((ref) => {
            const locked = ref.tripStatus === 'locked';
            return (
              <div key={ref.placeId} className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-gray-500 truncate" title={ref.tripName}>
                  in {ref.tripName}
                </span>
                <span className="flex items-center gap-1.5 flex-shrink-0">
                  {locked ? (
                    <span className="text-[11px] text-gray-400 italic">locked — unlock to fix</span>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => onChangeCity(ref)}
                        className="px-2 py-1 border border-teal-600 rounded bg-white text-teal-700 text-[11px] font-semibold hover:bg-teal-50 cursor-pointer"
                      >
                        Change city
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemove(ref)}
                        className="px-2 py-1 border border-wp-btn-destructive-border rounded bg-wp-btn-destructive-bg text-wp-btn-destructive-text text-[11px] font-semibold hover:brightness-95 cursor-pointer"
                      >
                        Remove
                      </button>
                    </>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </li>
  );
}
