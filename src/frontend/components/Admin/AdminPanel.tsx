/**
 * AdminPanel — tabbed admin interface (AD-01 through AD-07).
 *
 * Tabs:
 *   1. Categories   — manage trip/item categories
 *   2. Activities   — manage city activities
 *   3. Companions   — manage companions
 *   4. Map Shading  — configure country-level shading colours
 *   5. Countries    — toggle region_tier_enabled per country
 */
import { useState } from 'react';
import { ActivityTab } from './ActivityTab';
import { CategoryTab } from './CategoryTab';
import { CompanionTab } from './CompanionTab';
import { CountryTab } from './CountryTab';
import { ShadingTab } from './ShadingTab';

type Tab = 'categories' | 'activities' | 'companions' | 'shading' | 'countries';

const TABS: { id: Tab; label: string }[] = [
  { id: 'categories', label: 'Categories' },
  { id: 'activities', label: 'Activities' },
  { id: 'companions', label: 'Companions' },
  { id: 'shading', label: 'Map Shading' },
  { id: 'countries', label: 'Countries' },
];

/**
 * Renders the full admin panel with a horizontal tab bar and the active tab's content.
 */
export function AdminPanel() {
  const [activeTab, setActiveTab] = useState<Tab>('categories');

  return (
    <div style={{ maxWidth: '860px', margin: '0 auto', padding: '24px 16px' }}>
      <h1 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '20px', color: '#111827' }}>
        Admin
      </h1>

      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          gap: '4px',
          borderBottom: '2px solid #E5E7EB',
          marginBottom: '24px',
          overflowX: 'auto',
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '8px 18px',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid #2563EB' : '2px solid transparent',
              marginBottom: '-2px',
              background: 'none',
              fontWeight: activeTab === tab.id ? 600 : 400,
              color: activeTab === tab.id ? '#2563EB' : '#4B5563',
              cursor: 'pointer',
              fontSize: '14px',
              whiteSpace: 'nowrap',
              borderRadius: '0',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Active tab content */}
      <div>
        {activeTab === 'categories' && <CategoryTab />}
        {activeTab === 'activities' && <ActivityTab />}
        {activeTab === 'companions' && <CompanionTab />}
        {activeTab === 'shading' && <ShadingTab />}
        {activeTab === 'countries' && <CountryTab />}
      </div>
    </div>
  );
}
