import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    // Integration suites share one live database and clean up their own data;
    // parallel files would race each other's cleanup, so run files sequentially.
    fileParallelism: false,
  },
});
