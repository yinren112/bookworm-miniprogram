// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Your test configuration goes here
    globals: true,
    environment: 'node',
    setupFiles: ['./src/tests/setup.ts'], // A setup file for mocking
    include: ['src/**/*.test.ts'], // Only include our test files
    exclude: ['**/*.integration.test.ts', 'node_modules/**'], // Exclude integration tests and node_modules
  },
});