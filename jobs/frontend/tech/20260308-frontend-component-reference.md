# Frontend Component Reference
Date: 2026-03-08

## Architecture Overview

```
src/frontend/
├── main.tsx                    ← React entry, QueryClient, BrowserRouter
├── App.tsx                     ← NavBar + Routes
├── vite-env.d.ts               ← Vite import.meta.env types
├── types/
│   └── api.ts                  ← All API response TypeScript interfaces
├── utils/
│   ├── apiClient.ts            ← Typed fetch (apiGet, apiPost, apiPatch, apiDelete)
│   └── urlSanitiser.ts         ← SEC-12: https:// guard for external URLs
├── hooks/                      ← TanStack Query v5 hooks
│   ├── useTrips.ts
│   ├── usePlaces.ts
│   ├── useItems.ts
│   ├── useCities.ts
│   ├── useMapShading.ts
│   └── useAdmin.ts
├── pages/
│   ├── MapPage.tsx             ← /map
│   ├── TripsPage.tsx           ← /trips
│   ├── TripDetailPage.tsx      ← /trips/:id (shows ReviewPanel if review_pending)
│   └── AdminPage.tsx           ← /admin
└── components/
    ├── shared/
    │   ├── StatusBadge.tsx     ← Coloured pill for trip/item status
    │   ├── RatingStars.tsx     ← 5-star clickable/readonly widget
    │   ├── ConfirmDialog.tsx   ← Modal confirm overlay
    │   ├── LoadingSpinner.tsx  ← CSS spin, role="status"
    │   └── ErrorMessage.tsx    ← Red error box, role="alert"
    ├── Map/
    │   ├── MapView.tsx         ← Full-page MapLibre map, integrates all map layers
    │   ├── CountryLayer.tsx    ← GeoJSON country fills + feature-state shading
    │   ├── RegionLayer.tsx     ← GeoJSON region fills (lazy, zoom >= 4)
    │   └── CityMarkers.tsx     ← GeoJSON symbol layer for city pins
    ├── TripList/
    │   ├── TripList.tsx        ← Filter bar + card grid + TripForm modal trigger
    │   └── TripCard.tsx        ← Individual trip card with photo link
    ├── TripDetail/
    │   ├── TripDetail.tsx      ← Header, status transitions, PlaceSections
    │   ├── TripForm.tsx        ← Create/edit trip modal
    │   ├── PlaceSection.tsx    ← Items grouped by city/place
    │   ├── ItemCard.tsx        ← Single item display + edit/delete
    │   ├── ItemForm.tsx        ← Two-step add/edit form (6 item types)
    │   └── AddPlaceFlow.tsx    ← City search → add place → carry-forward check
    ├── CarryForward/
    │   └── CarryForwardModal.tsx  ← next_time candidate selection + POST
    ├── PostTripReview/
    │   ├── ReviewPanel.tsx     ← Full review UI: per-item PATCH, lock
    │   └── ReviewItemRow.tsx   ← Single item row: status select, rating, notes
    └── Admin/
        ├── AdminPanel.tsx      ← Tabbed container (5 tabs)
        ├── CategoryTab.tsx     ← CRUD categories
        ├── ActivityTab.tsx     ← CRUD activities
        ├── CompanionTab.tsx    ← CRUD companions
        ├── ShadingTab.tsx      ← 6 shading state colour pickers
        └── CountryTab.tsx      ← 250-country region_tier toggle
```

## Hook Reference

| Hook | Query/Mutation | Cache Key | API |
|------|---------------|-----------|-----|
| useTrips(filters?) | Query | ['trips'] | GET /api/trips |
| useTrip(id) | Query | ['trips', id] | GET /api/trips/:id |
| useCreateTrip() | Mutation | invalidates ['trips'] | POST /api/trips |
| useUpdateTrip() | Mutation | invalidates ['trips', id] | PATCH /api/trips/:id |
| useUpdateTripStatus() | Mutation | invalidates ['trips', id] | PATCH /api/trips/:id (status only) |
| useLockTrip() | Mutation | invalidates ['trips', id] | POST /api/trips/:id/lock |
| useUnlockTrip() | Mutation | invalidates ['trips', id] | POST /api/trips/:id/unlock |
| useAddPlace() | Mutation | invalidates ['trips', tripId] | POST /api/trips/:id/places |
| useRemovePlace() | Mutation | invalidates ['trips', tripId] | DELETE /api/trips/:id/places/:placeId |
| useCarryForward() | Mutation | invalidates ['trips', tripId] | POST /api/trips/:id/places/:placeId/carry-forward |
| useCreateItem() | Mutation | invalidates ['trips', tripId] | POST /api/trips/:id/items |
| useUpdateItem() | Mutation | invalidates ['trips', tripId] | PATCH /api/trips/:id/items/:itemId |
| useDeleteItem() | Mutation | invalidates ['trips', tripId] | DELETE /api/trips/:id/items/:itemId |
| useCitySearch(q) | Query (min 2 chars) | ['cities', 'search', q] | GET /api/cities?q= |
| useCarryForwardCandidates(cityId) | Query | ['cities', cityId, 'carry-forward'] | GET /api/cities/:id/carry-forward |
| useCreateCity() | Mutation | — | POST /api/cities |
| useMapShading() | Query (5min stale) | ['map', 'shading'] | GET /api/map/shading |
| useRegionShading(countryCode?) | Query | ['map', 'regions', countryCode] | GET /api/map/shading/regions/:code |
| useShadingConfig() | Query | ['map', 'shading-config'] | GET /api/admin/shading-config |
| useUpdateShadingColor() | Mutation | invalidates ['map'] | PATCH /api/admin/shading-config/:key |
| useCategories() | Query | ['admin', 'categories'] | GET /api/admin/categories |
| useActivities() | Query | ['admin', 'activities'] | GET /api/admin/activities |
| useCompanions() | Query | ['admin', 'companions'] | GET /api/admin/companions |
| useCountries() | Query | ['admin', 'countries'] | GET /api/admin/countries |
| useUpdateCountry() | Mutation | invalidates ['admin', 'countries'] | PATCH /api/admin/countries/:code |

## Security Notes

- **SEC-12**: `urlSanitiser.ts` returns null for non-https URLs; rendered as `<a>` only when non-null.
- **SEC-12**: City names on the map are rendered via MapLibre `text-field: ['get', 'name']` — not `innerHTML`.
- No `dangerouslySetInnerHTML` usage anywhere in the codebase.
- All user input goes through controlled React state → backend API (server-side Zod validation).

## Item Status Values (from Zod schema)
`consider` | `confirmed` | `completed` | `cancelled` | `next_time`

> **Note**: The API reference doc (jobs/backend/tech/20260307-api-reference.md) uses
> "booked" and "skipped" — this is inconsistent with the Zod schema. Frontend follows
> the schema. See FLAG-F1 in the completion report.

## Trip Status Transitions
```
planning → active
active → review_pending
review_pending → locked
locked → active  (unlock)
```
