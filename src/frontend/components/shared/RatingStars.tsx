interface RatingStarsProps {
  /** Current rating (1–5), or null if unrated. */
  value: number | null;
  /** Called with the new rating when the user clicks a star. */
  onChange: (rating: number) => void;
  /** When true, stars are display-only and not clickable. */
  readOnly?: boolean;
}

/**
 * Renders five stars. Filled stars are shown for values ≤ the current rating.
 * Clicking a star calls onChange with the star's index (1–5).
 *
 * @param value - Current rating value (1–5) or null for unrated.
 * @param onChange - Callback invoked when a star is clicked.
 * @param readOnly - If true, stars are not interactive.
 */
export function RatingStars({ value, onChange, readOnly = false }: RatingStarsProps) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`Rating: ${value ?? 'unrated'} out of 5`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => !readOnly && onChange(star)}
          disabled={readOnly}
          aria-label={`${star} star${star !== 1 ? 's' : ''}`}
          className={`bg-transparent border-none px-px text-xl leading-none ${
            readOnly ? 'cursor-default' : 'cursor-pointer'
          } ${value !== null && star <= value ? 'text-amber-400' : 'text-gray-300'}`}
        >
          ★
        </button>
      ))}
    </span>
  );
}
