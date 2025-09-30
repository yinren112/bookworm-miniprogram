// vitest.database-integration.config.ts
// Configuration for tests that require actual database connections
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: ['src/tests/*.integration.test.ts'],
    globalSetup: [path.resolve(__dirname, 'src/tests/globalSetup.ts')],
    teardownTimeout: 60000, // 60 seconds for container cleanup
    env: {
      NODE_ENV: 'test'
    }
  },
});