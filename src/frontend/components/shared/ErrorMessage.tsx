interface ErrorMessageProps {
  /** Error to display. May be a string or an Error instance. */
  error: string | Error | null | undefined;
}

/**
 * Renders an error message box. Returns null when error is falsy.
 *
 * @param error - The error to display (string or Error object).
 */
export function ErrorMessage({ error }: ErrorMessageProps) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : error;
  return (
    <div
      className="px-4 py-3 bg-red-50 border border-red-200 rounded-md text-red-800 text-sm leading-relaxed"
      role="alert"
    >
      {message}
    </div>
  );
}
