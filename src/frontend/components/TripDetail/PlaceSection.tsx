/**
 * PlaceSection — displays one city/place within a TripDetail.
 *
 * Shows city name, country, activity tags, and a list of ItemCards.
 * Contains the "Add Item" button (hidden when trip is locked).
 * Triggers city search and carry-forward flow when adding a new place.
 */
import React, { useState } from 'react';
import { ItemCard } from './ItemCard';
import { ItemForm } from './ItemForm';
import type { TripPlace, Item } from '../../types/api';

interface PlaceSectionProps {
  /** The place (city + items) to render. */
  place: TripPlace;
  /** Parent trip ID. */
  tripId: number;
  /** When true, all edit/delete controls are hidden. */
  isLocked: boolean;
}

const sectionStyle: React.CSSProperties = {
  border: '1px solid #E5E7EB',
  borderRadius: '8px',
  overflow: 'hidden',
  marginBottom: '16px',
};

const headerStyle: React.CSSProperties = {
  background: '#F9FAFB',
  padding: '12px 16px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  borderBottom: '1px solid #E5E7EB',
};

const tagStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '2px 8px',
  borderRadius: '4px',
  fontSize: '11px',
  background: '#EDE9FE',
  color: '#5B21B6',
  marginRight: '4px',
};

/**
 * Renders a collapsible section for one trip place, including all its items.
 *
 * @param place - The trip place including city details and items.
 * @param tripId - Parent trip ID for item mutations.
 * @param isLocked - When true, hides all write controls.
 */
export function PlaceSection({ place, tripId, isLocked }: PlaceSectionProps) {
  const [showAddItem, setShowAddItem] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);

  const handleEditItem = (item: Item) => setEditingItem(item);
  const handleCloseForm = () => {
    setShowAddItem(false);
    setEditingItem(null);
  };

  return (
    <div style={sectionStyle}>
      <div style={headerStyle}>
        <div>
          <span style={{ fontWeight: 600, fontSize: '15px' }}>{place.city.name}</span>
          <span style={{ marginLeft: '8px', color: '#6B7280', fontSize: '13px' }}>
            {place.city.country_code}
          </span>
          {place.activities.length > 0 && (
            <div style={{ marginTop: '4px' }}>
              {place.activities.map((a) => (
                <span key={a.id} style={tagStyle}>{a.name}</span>
              ))}
            </div>
          )}
        </div>

        {!isLocked && (
          <button
            type="button"
            onClick={() => setShowAddItem(true)}
            style={{
              padding: '6px 14px',
              background: '#2563EB',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            + Add Item
          </button>
        )}
      </div>

      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {place.items.length === 0 && (
          <p style={{ margin: 0, color: '#9CA3AF', fontSize: '13px' }}>
            No items yet. {!isLocked && 'Add one with "+ Add Item".'}
          </p>
        )}
        {place.items.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            tripId={tripId}
            isLocked={isLocked}
            onEdit={handleEditItem}
          />
        ))}
      </div>

      {/* Add item modal */}
      {showAddItem && (
        <ItemForm
          tripId={tripId}
          tripPlaceId={place.id}
          onClose={handleCloseForm}
        />
      )}

      {/* Edit item modal */}
      {editingItem && (
        <ItemForm
          tripId={tripId}
          tripPlaceId={place.id}
          existingItem={editingItem}
          onClose={handleCloseForm}
        />
      )}
    </div>
  );
}
