TO: DATABASE
FROM: COO
DATE: 2026-03-21 23:00
RE: ADL-23 — trip_countries migration (GitHub #31)

This is the first step in a multi-team feature. Backend and Frontend are blocked
on this migration merging before they can start.

Branch: `feat/adl23-trip-countries-migration`

---

## Schema to add

New junction table per ADL-23:

```sql
trip_countries
  trip_id      INTEGER  NOT NULL  REFERENCES trips(id) ON DELETE CASCADE
  country_code TEXT     NOT NULL  REFERENCES countries(country_code) ON DELETE RESTRICT
  created_at   TEXT     NOT NULL  DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  PRIMARY KEY (trip_id, country_code)
  INDEX idx_trip_countries_country ON trip_countries(country_code)
```

---

## Drizzle schema (src/backend/db/schema.ts)

Add the table definition. Pattern: follow the existing `tripPlaces` table style.

```ts
export const tripCountries = sqliteTable(
  'trip_countries',
  {
    tripId: integer('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    countryCode: text('country_code')
      .notNull()
      .references(() => countries.countryCode, { onDelete: 'restrict' }),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.tripId, t.countryCode] }),
    countryIdx: index('idx_trip_countries_country').on(t.countryCode),
  }),
);
```

Export the inferred types:
```ts
export type TripCountry = typeof tripCountries.$inferSelect;
export type NewTripCountry = typeof tripCountries.$inferInsert;
```

---

## Migration workflow

```bash
npm run db:generate   # generates SQL migration in src/backend/migrations/
npm run db:migrate    # applies it to dev.db
```

Verify the generated SQL matches the schema above before committing.
**Never use db:push** (ADL-15 — forbidden).

---

## Pre-push checklist

```bash
npm run type:check
npm run test:backend
npm run test:frontend
```

No new tests needed for this PR — it's schema only. Backend tests must still pass
(no regressions from schema addition).

---

## PR

```bash
gh pr create \
  --title "feat: add trip_countries junction table (ADL-23, #31)" \
  --body "Closes part of #31

Adds trip_countries junction table per ADL-23 schema decision:
- trip_id (FK → trips, CASCADE)
- country_code (FK → countries, RESTRICT)
- created_at with ISO 8601 default
- Composite PK (trip_id, country_code)
- Index on country_code"
```

After CI passes, notify COO — Backend and QA trip_countries briefs are blocked on this.
