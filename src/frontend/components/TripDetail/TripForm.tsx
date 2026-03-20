/**
 * TripForm — modal form for creating or editing a trip.
 *
 * Used by both TripsLayout (New Trip) and TripDetail (Edit Trip).
 * Validates using the shared Zod schema from the backend.
 * On submit: POST /api/trips (create) or PATCH /api/trips/:id (edit).
 */
import React, { useState } from 'react';
import { useCreateTrip, useUpdateTrip, type TripFormData } from '../../hooks/useTrips';
import { useActiveCategories, useActiveCompanions, useActiveActivities } from '../../hooks/useAdmin';
import { ErrorMessage } from '../shared/ErrorMessage';
import type { TripSummary } from '../../types/api';

interface TripFormProps {
  /** When set, the form is in edit mode and pre-populated with this trip's data. */
  existingTrip?: TripSummary;
  /** Called when the modal should close (success or cancel). */
  onClose: () => void;
}

/**
 * Renders a modal form for creating or editing a trip.
 *
 * @param existingTrip - Pre-populates the form if editing an existing trip.
 * @param onClose - Callback invoked after successful submission or cancellation.
 */
export function TripForm({ existingTrip, onClose }: TripFormProps) {
  const isEditing = !!existingTrip;

  const [name, setName] = useState(existingTrip?.name ?? '');
  const [startDate, setStartDate] = useState(existingTrip?.start_date ?? '');
  const [endDate, setEndDate] = useState(existingTrip?.end_date ?? '');
  const [photoRef, setPhotoRef] = useState(existingTrip?.photo_album_ref ?? '');
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>(
    existingTrip?.categories.map((c) => c.id) ?? [],
  );
  const [selectedCompanionIds, setSelectedCompanionIds] = useState<number[]>(
    existingTrip?.companions.map((c) => c.id) ?? [],
  );
  const [selectedActivityIds, setSelectedActivityIds] = useState<number[]>(
    existingTrip?.activities.map((a) => a.id) ?? [],
  );
  const [validationError, setValidationError] = useState('');

  const { data: categories = [] } = useActiveCategories();
  const { data: companions = [] } = useActiveCompanions();
  const { data: activities = [] } = useActiveActivities();

  const createTrip = useCreateTrip();
  const updateTrip = useUpdateTrip();
  const isSubmitting = createTrip.isPending || updateTrip.isPending;
  const mutationError = createTrip.error ?? updateTrip.error;

  /** Toggles an ID in/out of a multi-select array. */
  const toggleId = (ids: number[], setIds: (v: number[]) => void, id: number) => {
    setIds(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError('');

    if (!name.trim()) { setValidationError('Name is required.'); return; }
    if (!startDate) { setValidationError('Start date is required.'); return; }
    if (!endDate) { setValidationError('End date is required.'); return; }
    if (endDate < startDate) { setValidationError('End date must be on or after start date.'); return; }

    const data: TripFormData = {
      name: name.trim(),
      start_date: startDate,
      end_date: endDate,
      photo_album_ref: photoRef.trim() || undefined,
      category_ids: selectedCategoryIds,
      companion_ids: selectedCompanionIds,
      activity_ids: selectedActivityIds,
    };

    try {
      if (isEditing && existingTrip) {
        await updateTrip.mutateAsync({ id: existingTrip.id, data });
      } else {
        await createTrip.mutateAsync(data);
      }
      onClose();
    } catch {
      // mutationError is displayed via ErrorMessage below
    }
  };

  const chipClass = (isSelected: boolean) =>
    isSelected
      ? 'px-2.5 py-1 rounded-full text-xs cursor-pointer border-2 border-teal-600 bg-teal-100 text-teal-800 font-medium'
      : 'px-2.5 py-1 rounded-full text-xs cursor-pointer border border-gray-300 bg-white text-gray-700 hover:border-gray-400';

  return (
    <div
      className="fixed inset-0 bg-black/45 flex items-center justify-center z-[500]"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg p-7 w-[560px] max-w-[95vw] max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="m-0 mb-5 text-lg font-bold text-gray-900">
          {isEditing ? 'Edit Trip' : 'New Trip'}
        </h2>

        <form onSubmit={(e) => { void handleSubmit(e); }}>
          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Name *</label>
            <input
              className="w-full px-2.5 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Start Date *</label>
              <input
                type="date"
                className="w-full px-2.5 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">End Date *</label>
              <input
                type="date"
                className="w-full px-2.5 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Photo Album URL (optional)</label>
            <input
              className="w-full px-2.5 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              value={photoRef}
              onChange={(e) => setPhotoRef(e.target.value)}
              placeholder="https://..."
            />
          </div>

          {/* Multi-select: Categories */}
          {categories.length > 0 && (
            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Categories</label>
              <div className="flex flex-wrap gap-1.5">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => toggleId(selectedCategoryIds, setSelectedCategoryIds, cat.id)}
                    className={chipClass(selectedCategoryIds.includes(cat.id))}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Multi-select: Companions */}
          {companions.length > 0 && (
            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Companions</label>
              <div className="flex flex-wrap gap-1.5">
                {companions.map((comp) => (
                  <button
                    key={comp.id}
                    type="button"
                    onClick={() => toggleId(selectedCompanionIds, setSelectedCompanionIds, comp.id)}
                    className={chipClass(selectedCompanionIds.includes(comp.id))}
                  >
                    {comp.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Multi-select: Activities */}
          {activities.length > 0 && (
            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Activities</label>
              <div className="flex flex-wrap gap-1.5">
                {activities.map((act) => (
                  <button
                    key={act.id}
                    type="button"
                    onClick={() => toggleId(selectedActivityIds, setSelectedActivityIds, act.id)}
                    className={chipClass(selectedActivityIds.includes(act.id))}
                  >
                    {act.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {validationError && <ErrorMessage error={validationError} />}
          {mutationError && <ErrorMessage error={mutationError} />}

          <div className="flex justify-end gap-2.5 mt-5">
            <button
              type="button"
              onClick={onClose}
              className="px-4.5 py-2.5 border border-gray-300 rounded-md bg-white text-sm text-gray-700 hover:bg-gray-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4.5 py-2.5 bg-teal-600 text-white border-none rounded-md text-sm font-semibold hover:bg-teal-700 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
            >
              {isSubmitting ? 'Saving…' : isEditing ? 'Save Changes' : 'Create Trip'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
