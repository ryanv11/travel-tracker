/**
 * RatingStars — clickable 1–5 star rating component.
 *
 * Used in ItemForm and ReviewItemRow for restaurant, hotel, and experience items.
 * When value is null, all stars render as empty (unrated state).
 */
import React from 'react';

interface RatingStarsProps {
  /** Current rating (1–5), or null if unrated. */
  value: number | null;
  /** Called with the new rating when the user clicks a star. */
  onChange: (rating: number) => void;
  /** When true, stars are display-only and not clickable. */
  readOnly?: boolean;
}

const containerStyle: React.CSSProperties = {
  display: 'inline-flex',
  gap: '2px',
};

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
    <span style={containerStyle} aria-label={`Rating: ${value ?? 'unrated'} out of 5`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => !readOnly && onChange(star)}
          disabled={readOnly}
          aria-label={`${star} star${star !== 1 ? 's' : ''}`}
          style={{
            background: 'none',
            border: 'none',
            padding: '0 1px',
            cursor: readOnly ? 'default' : 'pointer',
            fontSize: '20px',
            lineHeight: 1,
            color: value !== null && star <= value ? '#F59E0B' : '#D1D5DB',
          }}
        >
          ★
        </button>
      ))}
    </span>
  );
}
