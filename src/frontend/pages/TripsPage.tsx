/**
 * TripsPage — trip list view (TR-01 through TR-05).
 *
 * Renders the TripList component which owns filter state, the "New Trip"
 * button, and the TripCard grid. Navigation to a trip's detail page is
 * handled via onClick on the card (see TripCard → navigate to /trips/:id).
 */
import React from 'react';
import { TripList } from '../components/TripList/TripList';

/**
 * Renders the trips list page.
 */
export function TripsPage() {
  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', padding: '24px 16px' }}>
      <TripList />
    </div>
  );
}
