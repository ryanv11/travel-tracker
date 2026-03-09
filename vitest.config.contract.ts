import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'contract',
    include: ['tests/contract/**/*.contract.test.ts'],
    environment: 'node',
    globals: true,
    // Contract tests run against a live server — give them generous timeouts
    testTimeout: 15_000,
    hookTimeout: 15_000,
    // Run suites sequentially — they share a live database
    fileParallelism: false,
  },
});
