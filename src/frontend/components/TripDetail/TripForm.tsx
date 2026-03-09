/**
 * TripForm — modal form for creating or editing a trip.
 *
 * Used by both TripList (New Trip) and TripDetail (Edit Trip).
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

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0,
  backgroundColor: 'rgba(0,0,0,0.45)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 500,
};

const modalStyle: React.CSSProperties = {
  background: '#fff', borderRadius: '8px', padding: '28px',
  width: '560px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto',
  boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
};

const fieldStyle: React.CSSProperties = { marginBottom: '16px' };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '5px', color: '#374151' };
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' };

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

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: 700 }}>
          {isEditing ? 'Edit Trip' : 'New Trip'}
        </h2>

        <form onSubmit={(e) => { void handleSubmit(e); }}>
          <div style={fieldStyle}>
            <label style={labelStyle}>Name *</label>
            <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} required />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            <div>
              <label style={labelStyle}>Start Date *</label>
              <input type="date" style={inputStyle} value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
            </div>
            <div>
              <label style={labelStyle}>End Date *</label>
              <input type="date" style={inputStyle} value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} required />
            </div>
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>Photo Album URL (optional)</label>
            <input style={inputStyle} value={photoRef} onChange={(e) => setPhotoRef(e.target.value)} placeholder="https://..." />
          </div>

          {/* Multi-select: Categories */}
          {categories.length > 0 && (
            <div style={fieldStyle}>
              <label style={labelStyle}>Categories</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {categories.map((cat) => (
                  <button
                    key={cat.id} type="button"
                    onClick={() => toggleId(selectedCategoryIds, setSelectedCategoryIds, cat.id)}
                    style={{
                      padding: '4px 10px', borderRadius: '20px', fontSize: '13px', cursor: 'pointer',
                      border: selectedCategoryIds.includes(cat.id) ? '2px solid #2563EB' : '1px solid #D1D5DB',
                      background: selectedCategoryIds.includes(cat.id) ? '#DBEAFE' : '#fff',
                      color: selectedCategoryIds.includes(cat.id) ? '#1E40AF' : '#374151',
                    }}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Multi-select: Companions */}
          {companions.length > 0 && (
            <div style={fieldStyle}>
              <label style={labelStyle}>Companions</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {companions.map((comp) => (
                  <button
                    key={comp.id} type="button"
                    onClick={() => toggleId(selectedCompanionIds, setSelectedCompanionIds, comp.id)}
                    style={{
                      padding: '4px 10px', borderRadius: '20px', fontSize: '13px', cursor: 'pointer',
                      border: selectedCompanionIds.includes(comp.id) ? '2px solid #2563EB' : '1px solid #D1D5DB',
                      background: selectedCompanionIds.includes(comp.id) ? '#DBEAFE' : '#fff',
                      color: selectedCompanionIds.includes(comp.id) ? '#1E40AF' : '#374151',
                    }}
                  >
                    {comp.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Multi-select: Activities */}
          {activities.length > 0 && (
            <div style={fieldStyle}>
              <label style={labelStyle}>Activities</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {activities.map((act) => (
                  <button
                    key={act.id} type="button"
                    onClick={() => toggleId(selectedActivityIds, setSelectedActivityIds, act.id)}
                    style={{
                      padding: '4px 10px', borderRadius: '20px', fontSize: '13px', cursor: 'pointer',
                      border: selectedActivityIds.includes(act.id) ? '2px solid #2563EB' : '1px solid #D1D5DB',
                      background: selectedActivityIds.includes(act.id) ? '#DBEAFE' : '#fff',
                      color: selectedActivityIds.includes(act.id) ? '#1E40AF' : '#374151',
                    }}
                  >
                    {act.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {validationError && <ErrorMessage error={validationError} />}
          {mutationError && <ErrorMessage error={mutationError} />}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
            <button type="button" onClick={onClose} style={{ padding: '9px 18px', border: '1px solid #D1D5DB', borderRadius: '6px', background: '#fff', cursor: 'pointer' }}>
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting} style={{ padding: '9px 18px', background: '#2563EB', color: '#fff', border: 'none', borderRadius: '6px', cursor: isSubmitting ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
              {isSubmitting ? 'Saving…' : isEditing ? 'Save Changes' : 'Create Trip'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
