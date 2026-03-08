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

const wrapperStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '16px',
  color: '#6B7280',
  fontSize: '14px',
};

const spinnerStyle: React.CSSProperties = {
  width: '20px',
  height: '20px',
  border: '2px solid #E5E7EB',
  borderTopColor: '#3B82F6',
  borderRadius: '50%',
  animation: 'spin 0.7s linear infinite',
  flexShrink: 0,
};

/**
 * Renders a CSS-animated spinner with an optional message.
 *
 * @param message - Text shown next to the spinner (e.g. "Loading trips…").
 */
export function LoadingSpinner({ message = 'Loading…' }: LoadingSpinnerProps) {
  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={wrapperStyle} role="status" aria-label={message}>
        <div style={spinnerStyle} />
        <span>{message}</span>
      </div>
    </>
  );
}
