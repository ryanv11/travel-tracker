/**
 * AdminPanel — tabbed admin interface (AD-01 through AD-09).
 *
 * Tabs:
 *   1. Categories   — manage trip/item categories (owner-only, AD-09)
 *   2. Activities   — manage city activities (owner-only, AD-09)
 *   3. Companions   — manage companions (any authenticated user, AD-08)
 *   4. Map Shading  — configure country-level shading colours (any authenticated user, AD-07)
 *   5. Countries    — toggle region_tier_enabled per country (owner-only)
 *
 * BUG-62 / AD-08: gating moved here from page-level `RequireOwner` in App.tsx.
 * AD-08 made companions (and, per ADL-28, map shading config) per-user rather
 * than owner-only, so any authenticated user must be able to reach those two
 * tabs. Categories, Activities, and Countries remain owner-only (AD-09 /
 * ADL-28 Question 5 — unaffected by the AD-07/AD-08 split) — the backend
 * still enforces this via `requireOwner` on `adminRouter`
 * (src/backend/routes/admin.ts), so hiding the tab here is presentation-layer
 * only, same relationship RequireOwner had with the backend before this
 * change (see the removed comment in App.tsx's git history).
 *
 * Fail-closed while identity is loading: `isPending` is treated as
 * non-owner, same principle the old page-level RequireOwner used (no flash
 * of owner-only tabs before we know who's asking).
 */
import { useEffect, useState } from 'react';
import { useMe } from '../../hooks/useMe';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { ActivityTab } from './ActivityTab';
import { CategoryTab } from './CategoryTab';
import { CompanionTab } from './CompanionTab';
import { CountryTab } from './CountryTab';
import { ShadingTab } from './ShadingTab';

type Tab = 'categories' | 'activities' | 'companions' | 'shading' | 'countries';

const TABS: { id: Tab; label: string; ownerOnly: boolean }[] = [
  { id: 'categories', label: 'Categories', ownerOnly: true },
  { id: 'activities', label: 'Activities', ownerOnly: true },
  { id: 'companions', label: 'Companions', ownerOnly: false },
  { id: 'shading', label: 'Map Shading', ownerOnly: false },
  { id: 'countries', label: 'Countries', ownerOnly: true },
];

/**
 * Renders the full admin panel with a horizontal tab bar and the active tab's content.
 * Owner-only tabs are omitted from the tab bar entirely for non-owners, and their
 * content is guarded a second time on render (defence-in-depth against a stale
 * `activeTab` value surviving an identity change).
 */
export function AdminPanel() {
  const { data: me, isPending } = useMe();
  const isOwner = !isPending && !!me?.isOwner;
  const visibleTabs = TABS.filter((tab) => !tab.ownerOnly || isOwner);

  // Null until identity resolves — avoids defaulting to 'categories' (owner-only)
  // and then jumping to 'companions' once we learn the user isn't the owner.
  const [activeTab, setActiveTab] = useState<Tab | null>(null);

  useEffect(() => {
    if (!isPending && activeTab === null) {
      setActiveTab(isOwner ? 'categories' : 'companions');
    }
  }, [isPending, isOwner, activeTab]);

  if (isPending || activeTab === null) {
    return <LoadingSpinner message="Loading admin panel…" />;
  }

  // Defence-in-depth: if activeTab is somehow an owner-only tab a non-owner
  // can no longer see (shouldn't happen via the UI, since only visible tabs
  // are clickable), fall back to the first tab this user can actually see.
  const currentTab = visibleTabs.some((tab) => tab.id === activeTab)
    ? activeTab
    : visibleTabs[0].id;

  return (
    <div className="max-w-[860px] mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-gray-900 mb-5">Admin</h1>

      {/* Tab bar — mirrors the app nav's rounded pill treatment (App.tsx) */}
      <div className="flex items-center gap-1 border-b border-gray-200 mb-6 overflow-x-auto">
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={
              currentTab === tab.id
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
        {currentTab === 'categories' && isOwner && <CategoryTab />}
        {currentTab === 'activities' && isOwner && <ActivityTab />}
        {currentTab === 'companions' && <CompanionTab />}
        {currentTab === 'shading' && <ShadingTab />}
        {currentTab === 'countries' && isOwner && <CountryTab />}
      </div>
    </div>
  );
}
