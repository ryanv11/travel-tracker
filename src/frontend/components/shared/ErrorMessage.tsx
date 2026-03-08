/**
 * ErrorMessage — displays an API or validation error in a styled box.
 *
 * Used in every error state across the app. Accepts a string message
 * or an Error object.
 */
import React from 'react';

interface ErrorMessageProps {
  /** Error to display. May be a string or an Error instance. */
  error: string | Error | null | undefined;
}

const boxStyle: React.CSSProperties = {
  padding: '12px 16px',
  backgroundColor: '#FEF2F2',
  border: '1px solid #FECACA',
  borderRadius: '6px',
  color: '#991B1B',
  fontSize: '14px',
  lineHeight: 1.5,
};

/**
 * Renders an error message box. Returns null when error is falsy.
 *
 * @param error - The error to display (string or Error object).
 */
export function ErrorMessage({ error }: ErrorMessageProps) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : error;
  return (
    <div style={boxStyle} role="alert">
      {message}
    </div>
  );
}
