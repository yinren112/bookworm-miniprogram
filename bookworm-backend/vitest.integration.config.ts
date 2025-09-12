// vitest.integration.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/tests/**/*.integration.test.ts'],
    threads: false, // Run integration tests serially to avoid DB conflicts
    setupFiles: ['src/tests/integration-setup.ts'],
  },
});