import { useParams } from 'react-router-dom';
import { ReviewPanel } from '../components/PostTripReview/ReviewPanel';
import { ErrorMessage } from '../components/shared/ErrorMessage';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { TripDetail } from '../components/TripDetail/TripDetail';
import { useReviewPanelVisibility } from '../hooks/useReviewPanelVisibility';
import { useTrip } from '../hooks/useTrips';

/**
 * Renders the trip detail or review panel depending on trip status.
 *
 * BUG-58/BUG-86: which surface renders is decided by useReviewPanelVisibility,
 * not by navigating away — see that hook's doc comment for why ReviewPanel's
 * onClose used to deselect the trip on both the Lock (BUG-58) and "Back to
 * Trip" (BUG-86) paths.
 */
export function TripDetailPage() {
  const { id } = useParams<{ id: string }>();
  const tripId = Number(id);

  const { data: trip, isLoading, error } = useTrip(tripId);
  const { showReviewPanel, dismissReview } = useReviewPanelVisibility(trip?.id, trip?.status);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-16">
        <LoadingSpinner message="Loading trip…" />
      </div>
    );
  }

  if (error || !trip) {
    return (
      <div className="p-8">
        <ErrorMessage error={error ?? new Error('Trip not found')} />
      </div>
    );
  }

  if (showReviewPanel) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6">
        <ReviewPanel trip={trip} onClose={dismissReview} />
      </div>
    );
  }

  return <TripDetail trip={trip} />;
}
