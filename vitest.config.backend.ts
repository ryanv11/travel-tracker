import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'backend',
    include: ['src/backend/**/__tests__/**/*.test.ts'],
    environment: 'node',
    globals: true,
    fileParallelism: true,
  },
});
