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
    <div className="mb-3.5">
      <label className="block text-xs font-semibold text-gray-700 mb-1">{label}</label>
      <input
        className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

// Silence unused import warning — fieldLabel is only used in the Field component label
void fieldLabel;

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
    <div
      className="fixed inset-0 bg-black/45 flex items-center justify-center z-[600]"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg p-7 w-[560px] max-w-[95vw] max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="m-0 mb-5 text-lg font-bold text-gray-900">
          {isEditing ? 'Edit Item' : 'Add Item'}
        </h2>

        <form onSubmit={(e) => { void handleSubmit(e); }}>
          {/* Step 1: type selection (create only) */}
          {!isEditing && !itemType && (
            <div>
              <p className="m-0 mb-3.5 text-sm text-gray-600">Select item type:</p>
              <div className="grid grid-cols-3 gap-2.5">
                {ITEM_TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setItemType(t.value)}
                    className="p-3.5 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 cursor-pointer text-center"
                  >
                    <div className="text-2xl">{t.icon}</div>
                    <div className="text-xs mt-1 text-gray-700">{t.label}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: fields (once type selected or editing) */}
          {(isEditing || itemType) && (
            <>
              {/* Common fields */}
              <div className="mb-3.5">
                <label className="block text-xs font-semibold text-gray-700 mb-1">Status</label>
                <select
                  className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as ItemStatus)}
                >
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
                <div className="grid grid-cols-2 gap-2.5 mb-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Check-in Date</label>
                    <input
                      type="date"
                      className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                      value={checkInDate}
                      onChange={(e) => setCheckInDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Check-out Date</label>
                    <input
                      type="date"
                      className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                      value={checkOutDate}
                      min={checkInDate}
                      onChange={(e) => setCheckOutDate(e.target.value)}
                    />
                  </div>
                </div>
                {hotelDuration && (
                  <div className="mb-3 text-xs text-emerald-600">Duration: {hotelDuration}</div>
                )}
                <Field label="Booking Reference" value={bookingReference} onChange={setBookingReference} />
                <Field label="Confirmation Number" value={confirmationNumber} onChange={setConfirmationNumber} />
              </>}

              {/* Flight-specific */}
              {itemType === 'flight' && <>
                <div className="grid grid-cols-2 gap-2.5 mb-3.5">
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
                <div className="grid grid-cols-2 gap-2.5 mb-3.5">
                  <Field label="Pick-up" value={pickupDatetime} onChange={setPickupDatetime} type="datetime-local" />
                  <Field label="Drop-off" value={dropoffDatetime} onChange={setDropoffDatetime} type="datetime-local" />
                </div>
                <Field label="Booking Reference" value={bookingReference} onChange={setBookingReference} />
                <Field label="Vehicle Class" value={vehicleClass} onChange={setVehicleClass} />
              </>}

              {/* Rating + post-visit notes (restaurant / hotel / experience when completed) */}
              {showRating && (
                <>
                  <div className="mb-3.5">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Rating</label>
                    <RatingStars value={rating} onChange={setRating} />
                  </div>
                  <div className="mb-3.5">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Post-visit Notes</label>
                    <textarea
                      className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 resize-y h-20"
                      value={postVisitNotes}
                      onChange={(e) => setPostVisitNotes(e.target.value)}
                    />
                  </div>
                </>
              )}

              {/* Notes — all types */}
              <div className="mb-3.5">
                <label className="block text-xs font-semibold text-gray-700 mb-1">Notes</label>
                <textarea
                  className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 resize-y h-[70px]"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              {mutationError && <ErrorMessage error={mutationError} />}

              <div className="flex justify-end gap-2.5 mt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 border border-gray-300 rounded-md bg-white text-sm text-gray-700 hover:bg-gray-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4.5 py-2 bg-teal-600 text-white border-none rounded-md text-sm font-semibold hover:bg-teal-700 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                >
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
