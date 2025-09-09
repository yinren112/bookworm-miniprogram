// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Your test configuration goes here
    globals: true,
    environment: 'node',
    setupFiles: ['./src/tests/setup.ts'], // A setup file for mocking
  },
});