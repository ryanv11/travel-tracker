/**
 * Waypoint icon set (WP-02/WP-03, spec §3) — barrel export.
 *
 * 8 item/status icons + 6 nav/chrome icons (the WP-03 addition was EditIcon, the
 * mobile detail-view compact Edit/Photos icon pair's Edit glyph; BUG-50/TR-14 adds
 * TrashIcon for the per-trip delete affordance) = 14 total, all literal inline
 * `<svg>` JSX components (never `dangerouslySetInnerHTML` — frameworks.txt rule 22 / C8).
 *
 * NOTE (carried from WP-02): the WP-02 brief and the spec's own Phase 1 success
 * criteria said "11 icons total" but enumerated 8 + 4 = 12 — a count error in the
 * spec text itself, not in this implementation; flagged to COO then, still
 * unresolved as a doc nit, not re-flagged here. WP-03 adds one more (EditIcon).
 */

export { AdminIcon } from './AdminIcon';
export { BackChevronIcon } from './BackChevronIcon';
export { CarRentalIcon } from './CarRentalIcon';
export { EditIcon } from './EditIcon';
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
export { TrashIcon } from './TrashIcon';
