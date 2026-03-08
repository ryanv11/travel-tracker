/**
 * TripDetailPage — renders a single trip (TD-01 through TD-08, PT-01 through PT-04).
 *
 * Route: /trips/:id
 *
 * - If the trip status is 'review_pending', renders the ReviewPanel.
 * - Otherwise renders the TripDetail component.
 */
import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTrip } from '../hooks/useTrips';
import { TripDetail } from '../components/TripDetail/TripDetail';
import { ReviewPanel } from '../components/PostTripReview/ReviewPanel';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { ErrorMessage } from '../components/shared/ErrorMessage';

/**
 * Renders the trip detail or review panel depending on trip status.
 */
export function TripDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const tripId = Number(id);

  const { data: trip, isLoading, error } = useTrip(tripId);

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px' }}>
        <LoadingSpinner message="Loading trip…" />
      </div>
    );
  }

  if (error || !trip) {
    return (
      <div style={{ padding: '32px' }}>
        <ErrorMessage error={error ?? new Error('Trip not found')} />
      </div>
    );
  }

  if (trip.status === 'review_pending') {
    return (
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px 16px' }}>
        <ReviewPanel trip={trip} onClose={() => navigate('/trips')} />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px 16px' }}>
      <TripDetail trip={trip} />
    </div>
  );
}
