import type { ItemType } from '../../types/api';
import { CarRentalIcon } from './CarRentalIcon';
import { ExperienceIcon } from './ExperienceIcon';
import { FlightIcon } from './FlightIcon';
import { HotelIcon } from './HotelIcon';
import type { IconProps } from './IconProps';
import { NoteIcon } from './NoteIcon';
import { RestaurantIcon } from './RestaurantIcon';

/**
 * Maps `item_type` to its Waypoint icon component (WP-02 spec §3). Single source
 * of truth so ItemCard, ReviewItemRow, CarryForwardModal, and ItemForm's type
 * picker all render the same glyph for the same type instead of each keeping its
 * own emoji-keyed lookup (the pre-WP-02 pattern this replaces).
 */
export const ITEM_TYPE_ICONS: Record<ItemType, (props: IconProps) => React.JSX.Element> = {
  restaurant: RestaurantIcon,
  hotel: HotelIcon,
  flight: FlightIcon,
  car_rental: CarRentalIcon,
  experience: ExperienceIcon,
  note: NoteIcon,
};
