// vitest.study-kpi.config.ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["src/tests/**/*.integration.test.ts", "tests/**/*.test.ts"],
    setupFiles: [path.resolve(__dirname, "src/tests/integrationSetup.ts")],
    maxConcurrency: 1,
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    globalSetup: [path.resolve(__dirname, "src/tests/globalSetup.ts")],
    teardownTimeout: 60000,
    env: {
      NODE_ENV: "test",
    },
    coverage: {
      provider: "v8",
      include: [
        "src/services/study/activityService.ts",
        "src/services/study/cardScheduler.ts",
        "src/services/study/courseService.ts",
        "src/services/study/dashboardService.ts",
        "src/services/study/quizService.ts",
        "src/services/study/starService.ts",
        "src/services/study/streakService.ts",
      ],
      exclude: [
        "**/*.d.ts",
        "**/*.test.ts",
        "**/*.integration.test.ts",
      ],
      thresholds: {
        lines: 70,
        branches: 50,
        functions: 50,
        statements: 70,
      },
    },
  },
});
