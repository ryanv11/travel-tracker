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
    <div className="max-w-[860px] mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-gray-900 mb-5">Admin</h1>

      {/* Tab bar — mirrors the app nav's rounded pill treatment (App.tsx) */}
      <div className="flex items-center gap-1 border-b border-gray-200 mb-6 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={
              activeTab === tab.id
                ? 'px-3.5 py-2 mb-[-1px] rounded-t-md text-sm font-semibold text-teal-700 bg-teal-50 border border-b-0 border-teal-100 whitespace-nowrap transition-colors cursor-pointer'
                : 'px-3.5 py-2 mb-[-1px] rounded-t-md text-sm font-normal text-gray-600 border border-b-0 border-transparent hover:bg-gray-100 whitespace-nowrap transition-colors cursor-pointer'
            }
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
