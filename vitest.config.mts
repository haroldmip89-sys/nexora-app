import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    hookTimeout: 30_000,
    maxWorkers: 4,
    coverage: {
      provider: "v8",
      include: ["src/modules/**", "src/lib/**", "src/app/api/**"],
      exclude: [
        "src/components/ui/**",
        "**/*.test.*",
        "**/*.types.ts",
        "**/*.table.ts",
        "src/lib/db/test-db.ts",
      ],
      reporter: ["text", "html", "lcov"],
      // Baseline measured in spec 016 (lines 75.14, statements 75.9,
      // branches 61.76, functions 64.02) minus 2 points, rounded down.
      thresholds: {
        lines: 73,
        statements: 73,
        branches: 59,
        functions: 62,
      },
    },
  },
});
