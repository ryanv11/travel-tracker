/**
 * Waypoint icon set (WP-02, spec §3) — barrel export.
 *
 * 8 item/status icons + 4 nav/chrome icons = 12 total, all literal inline `<svg>`
 * JSX components (never `dangerouslySetInnerHTML` — frameworks.txt rule 22 / C8).
 *
 * NOTE: the WP-02 brief and the spec's own Phase 1 success criteria say "11
 * icons total" but enumerate 8 + 4 = 12 — a count error in the spec text itself,
 * not in this implementation. All 12 icons documented with real path data in
 * spec §3 are implemented here; flagged to COO (see icons/__tests__/icons.test.tsx).
 */

export { AdminIcon } from './AdminIcon';
export { BackChevronIcon } from './BackChevronIcon';
export { CarRentalIcon } from './CarRentalIcon';
export { ExperienceIcon } from './ExperienceIcon';
export { FlightIcon } from './FlightIcon';
// Item-type icons
export { HotelIcon } from './HotelIcon';
export type { IconProps } from './IconProps';
export { ITEM_TYPE_ICONS } from './itemTypeIcons';
export type { LocationPinIconProps } from './LocationPinIcon';

// Nav/chrome icons
export { LocationPinIcon } from './LocationPinIcon';
// Status icons (not item types)
export { LockedIcon } from './LockedIcon';
export { NoteIcon } from './NoteIcon';
export { PhotosIcon } from './PhotosIcon';
export { RestaurantIcon } from './RestaurantIcon';
export { SuitcaseIcon } from './SuitcaseIcon';
