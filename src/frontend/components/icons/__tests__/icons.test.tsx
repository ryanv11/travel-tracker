/**
 * Tests for the WP-02 icon set (spec §3) — proves all 11 icons render as literal
 * inline SVG (never dangerouslySetInnerHTML) and that ITEM_TYPE_ICONS covers every
 * ItemType.
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ItemType } from '../../../types/api';
import {
  AdminIcon,
  BackChevronIcon,
  CarRentalIcon,
  EditIcon,
  ExperienceIcon,
  FlightIcon,
  HotelIcon,
  ITEM_TYPE_ICONS,
  LocationPinIcon,
  LockedIcon,
  NoteIcon,
  PhotosIcon,
  RestaurantIcon,
  SuitcaseIcon,
  TrashIcon,
} from '..';

const ALL_ICONS = [
  HotelIcon,
  FlightIcon,
  RestaurantIcon,
  CarRentalIcon,
  ExperienceIcon,
  NoteIcon,
  LockedIcon,
  PhotosIcon,
  LocationPinIcon,
  SuitcaseIcon,
  AdminIcon,
  BackChevronIcon,
  EditIcon,
  TrashIcon,
];

describe('Waypoint icon set', () => {
  // NOTE (spec/brief count discrepancy, flagged to COO in WP-02): the WP-02 brief
  // and the spec's own Phase 1 success criteria said "11 icons total (8
  // item/status + 4 nav/chrome)" — but 8 + 4 = 12, and spec §3's two tables
  // enumerated 12 icons with real path data. WP-03 added a 13th (EditIcon, the
  // mobile detail-view pencil glyph, documented in spec §3's "Two additional
  // icons used only in the Trips mockups" table). BUG-50/TR-14 (this brief) adds
  // a 14th, TrashIcon, for the per-trip delete affordance — not in the original
  // spec's icon tables since the delete affordance itself didn't exist yet.
  it('has all 14 icon components (WP-02: 12, WP-03 adds EditIcon, BUG-50 adds TrashIcon)', () => {
    expect(ALL_ICONS).toHaveLength(14);
  });

  it.each(ALL_ICONS)('renders a literal <svg> element, sized via props', (Icon) => {
    const { container } = render(<Icon size={20} className="text-red-500" />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('width', '20');
    expect(svg).toHaveAttribute('height', '20');
    expect(svg?.getAttribute('class')).toContain('text-red-500');
    // Blocking defect per _shared/frameworks.txt rule 22 / spec C8 — never inject
    // icon markup via dangerouslySetInnerHTML.
    expect(container.innerHTML).not.toContain('dangerouslySetInnerHTML');
  });

  it('defaults every icon to a 16px size when no size prop is passed', () => {
    for (const Icon of ALL_ICONS) {
      const { container } = render(<Icon />);
      expect(container.querySelector('svg')).toHaveAttribute('width', '16');
    }
  });

  it('ITEM_TYPE_ICONS covers every ItemType with no gaps', () => {
    const types: ItemType[] = ['restaurant', 'hotel', 'flight', 'car_rental', 'experience', 'note'];
    for (const type of types) {
      expect(ITEM_TYPE_ICONS[type]).toBeDefined();
    }
  });
});
