/**
 * Shared trip-date defaulting logic — BUG-57/BRD IT-11 and BRD-DP06.
 *
 * IT-11 ("adding an item to a trip whose range does not include today opens
 * the date picker on the trip's start date") and DP-06 ("the first place
 * added to a trip inherits the trip's date range") are the same underlying
 * rule: read the trip's start/end date and use it as a starting value the
 * user can freely override. One function, so the two call sites (ItemForm,
 * AddPlaceFlow) cannot drift out of sync the way two independently-written
 * defaulting mechanisms would (see B6 brief / GitHub issue #300).
 *
 * `trips.start_date`/`trips.end_date` are NOT NULL at the schema level
 * (src/backend/db/schema.ts) — every trip always has a date range today, so
 * the "no date range set" branch below is currently unreachable in practice.
 * It is implemented anyway because IT-11's stated success criteria requires
 * it and this stays correct if that constraint is ever relaxed.
 */

/** Returns today's date as YYYY-MM-DD (local calendar day, not UTC). */
export function todayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Resolves a default date (YYYY-MM-DD) from one end of a trip's date range.
 *
 * @param tripDate - The trip's start_date or end_date, or falsy if unset.
 * @param fallbackToToday - IT-11: item date fields fall back to today when
 *   the trip has no range set. DP-06 passes `false` — a place with no trip
 *   range to inherit simply has no default (existing blank-field behaviour),
 *   it never falls back to today.
 * @returns A YYYY-MM-DD date string, or `''` when there is nothing to default to.
 */
export function resolveDefaultDate(
  tripDate: string | null | undefined,
  fallbackToToday: boolean,
): string {
  if (tripDate) return tripDate;
  return fallbackToToday ? todayIso() : '';
}

/**
 * Resolves a default `datetime-local` input value (YYYY-MM-DDTHH:mm) from a
 * trip date. `<input type="datetime-local">` requires the full format to
 * register a value at all — a bare YYYY-MM-DD is silently ignored by the
 * browser — so item date/time fields (flight departure, car rental pickup)
 * anchor to midnight on the resolved day; this is enough to satisfy IT-11's
 * "opens the date picker on the trip's start date" (the calendar view lands
 * on the right day), even though the time itself is a placeholder the user
 * is expected to fill in precisely.
 */
export function resolveDefaultDateTime(
  tripDate: string | null | undefined,
  fallbackToToday: boolean,
): string {
  const date = resolveDefaultDate(tripDate, fallbackToToday);
  return date ? `${date}T00:00` : '';
}
