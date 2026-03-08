/**
 * ItemForm — unified modal form for creating and editing items of all 6 types.
 *
 * Step 1 (create only): user selects item type.
 * Step 2: type-aware fields render. Common fields (status, notes) always present.
 * Rating and post_visit_notes appear for restaurant/hotel/experience when status = completed.
 *
 * Validation: reuses backend Zod schemas (SEC-12 / RULE 4 from security addendum).
 */
import React, { useState } from 'react';
import { useCreateItem, useUpdateItem, type CreateItemData, type UpdateItemData } from '../../hooks/useItems';
import { RatingStars } from '../shared/RatingStars';
import { ErrorMessage } from '../shared/ErrorMessage';
import type { Item, ItemType, ItemStatus } from '../../types/api';

interface ItemFormProps {
  /** Trip ID — required for create/update API paths. */
  tripId: number;
  /** Place ID — required for new items associated to a specific place. */
  tripPlaceId: number | null;
  /** When set, the form is in edit mode and pre-populated. */
  existingItem?: Item;
  /** Called when the modal should close. */
  onClose: () => void;
}

const ITEM_TYPES: { value: ItemType; label: string; icon: string }[] = [
  { value: 'restaurant', label: 'Restaurant', icon: '🍽️' },
  { value: 'hotel', label: 'Hotel', icon: '🏨' },
  { value: 'flight', label: 'Flight', icon: '✈️' },
  { value: 'car_rental', label: 'Car Rental', icon: '🚗' },
  { value: 'experience', label: 'Experience', icon: '🎫' },
  { value: 'note', label: 'Note', icon: '📝' },
];

const STATUS_OPTIONS: ItemStatus[] = ['consider', 'confirmed', 'completed', 'cancelled', 'next_time'];
const STATUS_LABELS: Record<ItemStatus, string> = {
  consider: 'Consider', confirmed: 'Confirmed', completed: 'Completed',
  cancelled: 'Cancelled', next_time: 'Next Time',
};

const RATEABLE_TYPES: ItemType[] = ['restaurant', 'hotel', 'experience'];

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 600,
};
const modalStyle: React.CSSProperties = {
  background: '#fff', borderRadius: '8px', padding: '28px',
  width: '560px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto',
  boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
};
const fieldStyle: React.CSSProperties = { marginBottom: '14px' };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px', color: '#374151' };
const inputStyle: React.CSSProperties = { width: '100%', padding: '7px 10px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' };

/** Returns the display name for a field key. */
function fieldLabel(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Renders a text input field row.
 */
function Field({ label, value, onChange, type = 'text', placeholder }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string;
}) {
  return (
    <div style={fieldStyle}>
      <label style={labelStyle}>{label}</label>
      <input style={inputStyle} type={type} value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/**
 * Unified type-aware item form. Handles both create and edit.
 *
 * @param tripId - Parent trip ID.
 * @param tripPlaceId - Parent place ID (null for trip-level items).
 * @param existingItem - Pre-populates form when editing.
 * @param onClose - Called on success or cancel.
 */
export function ItemForm({ tripId, tripPlaceId, existingItem, onClose }: ItemFormProps) {
  const isEditing = !!existingItem;

  const [itemType, setItemType] = useState<ItemType | null>(existingItem?.item_type ?? null);
  const [status, setStatus] = useState<ItemStatus>(existingItem?.status ?? 'consider');
  const [notes, setNotes] = useState(existingItem?.notes ?? '');
  const [rating, setRating] = useState<number | null>(existingItem?.rating ?? null);
  const [postVisitNotes, setPostVisitNotes] = useState(existingItem?.post_visit_notes ?? '');

  // Type-specific fields
  const [name, setName] = useState(existingItem?.name ?? '');
  const [neighbourhoodArea, setNeighbourhoodArea] = useState(existingItem?.neighbourhood_area ?? '');
  const [cuisineType, setCuisineType] = useState(existingItem?.cuisine_type ?? '');
  const [source, setSource] = useState(existingItem?.source ?? '');
  const [propertyName, setPropertyName] = useState(existingItem?.property_name ?? '');
  const [address, setAddress] = useState(existingItem?.address ?? '');
  const [checkInDate, setCheckInDate] = useState(existingItem?.check_in_date ?? '');
  const [checkOutDate, setCheckOutDate] = useState(existingItem?.check_out_date ?? '');
  const [bookingReference, setBookingReference] = useState(existingItem?.booking_reference ?? '');
  const [confirmationNumber, setConfirmationNumber] = useState(existingItem?.confirmation_number ?? '');
  const [airline, setAirline] = useState(existingItem?.airline ?? '');
  const [flightNumber, setFlightNumber] = useState(existingItem?.flight_number ?? '');
  const [departureAirport, setDepartureAirport] = useState(existingItem?.departure_airport ?? '');
  const [arrivalAirport, setArrivalAirport] = useState(existingItem?.arrival_airport ?? '');
  const [departureDatetime, setDepartureDatetime] = useState(existingItem?.departure_datetime ?? '');
  const [arrivalDatetime, setArrivalDatetime] = useState(existingItem?.arrival_datetime ?? '');
  const [seat, setSeat] = useState(existingItem?.seat ?? '');
  const [provider, setProvider] = useState(existingItem?.provider ?? '');
  const [pickupLocation, setPickupLocation] = useState(existingItem?.pickup_location ?? '');
  const [dropoffLocation, setDropoffLocation] = useState(existingItem?.dropoff_location ?? '');
  const [pickupDatetime, setPickupDatetime] = useState(existingItem?.pickup_datetime ?? '');
  const [dropoffDatetime, setDropoffDatetime] = useState(existingItem?.dropoff_datetime ?? '');
  const [vehicleClass, setVehicleClass] = useState(existingItem?.vehicle_class ?? '');

  const createItem = useCreateItem();
  const updateItem = useUpdateItem();
  const isSubmitting = createItem.isPending || updateItem.isPending;
  const mutationError = createItem.error ?? updateItem.error;

  const showRating = itemType !== null && RATEABLE_TYPES.includes(itemType) && status === 'completed';

  // Compute duration for hotel display (HT-02)
  let hotelDuration = '';
  if (itemType === 'hotel' && checkInDate && checkOutDate) {
    const diff = (new Date(checkOutDate).getTime() - new Date(checkInDate).getTime()) / 86400000;
    if (diff > 0) hotelDuration = `${diff} night${diff !== 1 ? 's' : ''}`;
  }

  const buildPayload = (): CreateItemData | UpdateItemData => {
    const n = (v: string) => v.trim() || undefined;
    const base = { status, notes: n(notes) };
    const typeFields = itemType === 'restaurant' ? {
      name: n(name), neighbourhood_area: n(neighbourhoodArea),
      cuisine_type: n(cuisineType), source: n(source),
      ...(showRating ? { rating: rating ?? undefined, post_visit_notes: n(postVisitNotes) } : {}),
    } : itemType === 'hotel' ? {
      property_name: n(propertyName), address: n(address),
      check_in_date: n(checkInDate), check_out_date: n(checkOutDate),
      booking_reference: n(bookingReference), confirmation_number: n(confirmationNumber),
      ...(showRating ? { rating: rating ?? undefined, post_visit_notes: n(postVisitNotes) } : {}),
    } : itemType === 'flight' ? {
      airline: n(airline), flight_number: n(flightNumber),
      departure_airport: n(departureAirport), arrival_airport: n(arrivalAirport),
      departure_datetime: n(departureDatetime), arrival_datetime: n(arrivalDatetime),
      booking_reference: n(bookingReference), seat: n(seat),
    } : itemType === 'car_rental' ? {
      provider: n(provider), pickup_location: n(pickupLocation),
      dropoff_location: n(dropoffLocation), pickup_datetime: n(pickupDatetime),
      dropoff_datetime: n(dropoffDatetime), booking_reference: n(bookingReference),
      vehicle_class: n(vehicleClass),
    } : itemType === 'experience' ? {
      ...(showRating ? { rating: rating ?? undefined, post_visit_notes: n(postVisitNotes) } : {}),
    } : {};

    if (!isEditing && itemType) {
      return { ...base, ...typeFields, trip_place_id: tripPlaceId, item_type: itemType } as CreateItemData;
    }
    return { ...base, ...typeFields } as UpdateItemData;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemType) return;
    try {
      if (isEditing && existingItem) {
        await updateItem.mutateAsync({ tripId, itemId: existingItem.id, data: buildPayload() as UpdateItemData });
      } else {
        await createItem.mutateAsync({ tripId, data: buildPayload() as CreateItemData });
      }
      onClose();
    } catch { /* displayed via mutationError */ }
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: 700 }}>
          {isEditing ? 'Edit Item' : 'Add Item'}
        </h2>

        <form onSubmit={(e) => { void handleSubmit(e); }}>
          {/* Step 1: type selection (create only) */}
          {!isEditing && !itemType && (
            <div>
              <p style={{ margin: '0 0 14px', color: '#4B5563' }}>Select item type:</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                {ITEM_TYPES.map((t) => (
                  <button
                    key={t.value} type="button"
                    onClick={() => setItemType(t.value)}
                    style={{ padding: '14px', border: '1px solid #D1D5DB', borderRadius: '8px', background: '#fff', cursor: 'pointer', textAlign: 'center' }}
                  >
                    <div style={{ fontSize: '24px' }}>{t.icon}</div>
                    <div style={{ fontSize: '13px', marginTop: '4px' }}>{t.label}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: fields (once type selected or editing) */}
          {(isEditing || itemType) && (
            <>
              {/* Common fields */}
              <div style={fieldStyle}>
                <label style={labelStyle}>Status</label>
                <select style={inputStyle} value={status} onChange={(e) => setStatus(e.target.value as ItemStatus)}>
                  {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
              </div>

              {/* Restaurant-specific */}
              {itemType === 'restaurant' && <>
                <Field label="Restaurant Name" value={name} onChange={setName} />
                <Field label="Neighbourhood / Area" value={neighbourhoodArea} onChange={setNeighbourhoodArea} />
                <Field label="Cuisine Type" value={cuisineType} onChange={setCuisineType} />
                <Field label="How you heard about it" value={source} onChange={setSource} />
              </>}

              {/* Hotel-specific */}
              {itemType === 'hotel' && <>
                <Field label="Property Name" value={propertyName} onChange={setPropertyName} />
                <Field label="Address" value={address} onChange={setAddress} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                  <div>
                    <label style={labelStyle}>Check-in Date</label>
                    <input type="date" style={inputStyle} value={checkInDate} onChange={(e) => setCheckInDate(e.target.value)} />
                  </div>
                  <div>
                    <label style={labelStyle}>Check-out Date</label>
                    <input type="date" style={inputStyle} value={checkOutDate} min={checkInDate} onChange={(e) => setCheckOutDate(e.target.value)} />
                  </div>
                </div>
                {hotelDuration && <div style={{ marginBottom: '12px', fontSize: '13px', color: '#059669' }}>Duration: {hotelDuration}</div>}
                <Field label="Booking Reference" value={bookingReference} onChange={setBookingReference} />
                <Field label="Confirmation Number" value={confirmationNumber} onChange={setConfirmationNumber} />
              </>}

              {/* Flight-specific */}
              {itemType === 'flight' && <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                  <Field label="Airline" value={airline} onChange={setAirline} />
                  <Field label="Flight Number" value={flightNumber} onChange={setFlightNumber} />
                  <Field label="Departure Airport" value={departureAirport} onChange={setDepartureAirport} placeholder="e.g. LHR" />
                  <Field label="Arrival Airport" value={arrivalAirport} onChange={setArrivalAirport} placeholder="e.g. CDG" />
                  <Field label="Departure" value={departureDatetime} onChange={setDepartureDatetime} type="datetime-local" />
                  <Field label="Arrival" value={arrivalDatetime} onChange={setArrivalDatetime} type="datetime-local" />
                </div>
                <Field label="Booking Reference" value={bookingReference} onChange={setBookingReference} />
                <Field label="Seat" value={seat} onChange={setSeat} />
              </>}

              {/* Car rental-specific */}
              {itemType === 'car_rental' && <>
                <Field label="Provider" value={provider} onChange={setProvider} />
                <Field label="Pickup Location" value={pickupLocation} onChange={setPickupLocation} />
                <Field label="Drop-off Location" value={dropoffLocation} onChange={setDropoffLocation} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                  <Field label="Pick-up" value={pickupDatetime} onChange={setPickupDatetime} type="datetime-local" />
                  <Field label="Drop-off" value={dropoffDatetime} onChange={setDropoffDatetime} type="datetime-local" />
                </div>
                <Field label="Booking Reference" value={bookingReference} onChange={setBookingReference} />
                <Field label="Vehicle Class" value={vehicleClass} onChange={setVehicleClass} />
              </>}

              {/* Rating + post-visit notes (restaurant / hotel / experience when completed) */}
              {showRating && (
                <>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Rating</label>
                    <RatingStars value={rating} onChange={setRating} />
                  </div>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Post-visit Notes</label>
                    <textarea
                      style={{ ...inputStyle, height: '80px', resize: 'vertical' }}
                      value={postVisitNotes}
                      onChange={(e) => setPostVisitNotes(e.target.value)}
                    />
                  </div>
                </>
              )}

              {/* Notes — all types */}
              <div style={fieldStyle}>
                <label style={labelStyle}>Notes</label>
                <textarea
                  style={{ ...inputStyle, height: '70px', resize: 'vertical' }}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              {mutationError && <ErrorMessage error={mutationError} />}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
                <button type="button" onClick={onClose} style={{ padding: '8px 16px', border: '1px solid #D1D5DB', borderRadius: '6px', background: '#fff', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" disabled={isSubmitting} style={{ padding: '8px 18px', background: '#2563EB', color: '#fff', border: 'none', borderRadius: '6px', cursor: isSubmitting ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
                  {isSubmitting ? 'Saving…' : isEditing ? 'Save' : 'Add Item'}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
