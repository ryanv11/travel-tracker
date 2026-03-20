/**
 * TripsPage — legacy wrapper (superseded by TripsLayout two-panel shell, TR-11).
 *
 * The /trips route now mounts TripsLayout directly from App.tsx.
 * This file is retained for reference but no longer mounted in the route tree.
 */
import React from 'react';
import { TripsLayout } from '../components/TripList/TripsLayout';

/**
 * Renders the trips list page (legacy — see TripsLayout for current implementation).
 */
export function TripsPage() {
  return <TripsLayout />;
}
