/**
 * LoadingSpinner — inline or full-area loading indicator.
 *
 * Used in every data-loading state across the app. Accepts an optional
 * message to display alongside the spinner.
 */
import React from 'react';

interface LoadingSpinnerProps {
  /** Optional label shown next to the spinner. */
  message?: string;
}

/**
 * Renders a CSS-animated spinner with an optional message.
 * The spin animation is defined in index.css via @keyframes spin.
 *
 * @param message - Text shown next to the spinner (e.g. "Loading trips…").
 */
export function LoadingSpinner({ message = 'Loading…' }: LoadingSpinnerProps) {
  return (
    <div className="flex items-center gap-2.5 p-4 text-gray-500 text-sm" role="status" aria-label={message}>
      <div
        className="w-5 h-5 rounded-full border-2 border-gray-200 border-t-blue-500 flex-shrink-0"
        style={{ animation: 'spin 0.7s linear infinite' }}
      />
      <span>{message}</span>
    </div>
  );
}
