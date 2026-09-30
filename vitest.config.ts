import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    maxWorkers: 2,
    minWorkers: 1,
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
