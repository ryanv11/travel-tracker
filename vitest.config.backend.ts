import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'backend',
    include: ['src/backend/**/__tests__/**/*.test.ts'],
    environment: 'node',
    globals: true,
    fileParallelism: true,
    // Match CI (ci.yml GEOCODING_ENABLED=false) and the ADL-46 acceptance suite's
    // stated assumption: no live Nominatim egress in unit tests. Every geocode
    // path (resolveCity, resolveCityName, the proxy) degrades deterministically —
    // resolve-then-create falls to a 'pending' row from the user's text, and the
    // find-or-create logic under test runs without a network dependency.
    env: {
      GEOCODING_ENABLED: 'false',
    },
  },
});
