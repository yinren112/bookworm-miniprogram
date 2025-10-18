// vitest.integration.config.ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: ['src/tests/**/*.integration.test.ts', 'tests/**/*.test.ts'],
    setupFiles: [path.resolve(__dirname, 'src/tests/integrationSetup.ts')],
    threads: false, // Run integration tests serially to avoid DB conflicts
    maxConcurrency: 1, // Only run one test at a time
    pool: 'forks', // Use forks instead of threads
    poolOptions: {
      forks: {
        singleFork: true, // Use a single worker process
      },
    },
    globalSetup: [path.resolve(__dirname, 'src/tests/globalSetup.ts')],
    teardownTimeout: 60000, // 60 seconds for container cleanup
    env: {
      NODE_ENV: 'test'
    }
  },
});
