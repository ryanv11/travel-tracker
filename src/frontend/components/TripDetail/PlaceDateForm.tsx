/**
 * PlaceDateForm — modal for setting/editing arrived_on and departed_on on a place (UX-02).
 *
 * Calls PATCH /api/trips/:tripId/places/:placeId with { arrived_on, departed_on }.
 * Displays backend warnings (e.g. out-of-range) as an inline callout.
 *
 * Both date fields are optional. Client validates arrived_on <= departed_on when both set.
 */
import type React from 'react';
import { useState } from 'react';
import { useUpdatePlaceDates } from '../../hooks/usePlaces';
import { ErrorMessage } from '../shared/ErrorMessage';

interface PlaceDateFormProps {
  tripId: number;
  placeId: number;
  cityName: string;
  currentArrivedOn: string | null;
  currentDepartedOn: string | null;
  onClose: () => void;
}

/**
 * Renders a modal for editing arrival and departure dates on a trip place.
 *
 * @param tripId - Parent trip ID.
 * @param placeId - Place ID to patch.
 * @param cityName - City name — shown in the modal title.
 * @param currentArrivedOn - Existing arrived_on value (null if not set).
 * @param currentDepartedOn - Existing departed_on value (null if not set).
 * @param onClose - Called when the modal should close.
 */
export function PlaceDateForm({
  tripId,
  placeId,
  cityName,
  currentArrivedOn,
  currentDepartedOn,
  onClose,
}: PlaceDateFormProps) {
  const [arrivedOn, setArrivedOn] = useState(currentArrivedOn ?? '');
  const [departedOn, setDepartedOn] = useState(currentDepartedOn ?? '');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const updateDates = useUpdatePlaceDates();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    setWarnings([]);

    // Client-side validation: arrived_on must not be after departed_on
    if (arrivedOn && departedOn && arrivedOn > departedOn) {
      setValidationError('Arrival date cannot be after departure date.');
      return;
    }

    try {
      const result = await updateDates.mutateAsync({
        tripId,
        placeId,
        arrivedOn: arrivedOn || null,
        departedOn: departedOn || null,
      });

      // Display any backend warnings (e.g. dates outside trip range)
      if (result.warnings && result.warnings.length > 0) {
        setWarnings(result.warnings);
        // Don't close — let user see warnings and decide
        return;
      }

      onClose();
    } catch {
      // Error shown via updateDates.error below
    }
  };

  const handleDismissWarningsAndClose = () => {
    onClose();
  };

  const inputClass =
    'w-full px-2.5 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 box-border';
  const labelClass = 'block text-xs font-semibold text-gray-700 mb-1';

  return (
    <div
      className="fixed inset-0 bg-black/45 flex items-center justify-center z-[700]"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg p-6 w-[400px] max-w-[95vw] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="m-0 mb-4 text-lg font-bold text-gray-900">Dates — {cityName}</h2>

        {/* Backend warnings callout */}
        {warnings.length > 0 && (
          <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-300 rounded-md text-amber-800 text-sm">
            <p className="font-semibold mb-1">Warning</p>
            <ul className="list-disc list-inside space-y-0.5">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
            <button
              type="button"
              onClick={handleDismissWarningsAndClose}
              className="mt-3 px-3 py-1.5 bg-amber-600 text-white text-xs font-semibold rounded-md hover:bg-amber-700 cursor-pointer"
            >
              OK, close
            </button>
          </div>
        )}

        {warnings.length === 0 && (
          <form
            onSubmit={(e) => {
              void handleSubmit(e);
            }}
          >
            <div className="mb-3.5">
              <label className={labelClass}>
                Arrival date <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <input
                type="date"
                className={inputClass}
                value={arrivedOn}
                onChange={(e) => setArrivedOn(e.target.value)}
              />
            </div>

            <div className="mb-4">
              <label className={labelClass}>
                Departure date <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <input
                type="date"
                className={inputClass}
                value={departedOn}
                onChange={(e) => setDepartedOn(e.target.value)}
              />
            </div>

            {validationError && (
              <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-md text-red-800 text-sm">
                {validationError}
              </div>
            )}

            {updateDates.error && <ErrorMessage error={updateDates.error} />}

            <div className="flex gap-2.5 mt-1">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 border border-gray-300 rounded-md bg-white text-sm text-gray-700 hover:bg-gray-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={updateDates.isPending}
                className="px-4 py-2 bg-teal-600 text-white border-none rounded-md text-sm font-semibold hover:bg-teal-700 disabled:opacity-60 cursor-pointer"
              >
                {updateDates.isPending ? 'Saving…' : 'Save dates'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
