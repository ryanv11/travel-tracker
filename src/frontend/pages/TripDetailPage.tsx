/**
 * TripDetailPage — renders a single trip inside the TripsLayout right panel.
 *
 * Route: /trips/:id (nested child of TripsLayout via TR-11)
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

  if (trip.status === 'review_pending') {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6">
        <ReviewPanel trip={trip} onClose={() => navigate('/trips')} />
      </div>
    );
  }

  return <TripDetail trip={trip} />;
}
