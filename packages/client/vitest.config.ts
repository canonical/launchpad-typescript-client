import { defineConfig } from "vitest/config";

export default defineConfig({
  root: import.meta.dirname,
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    testTimeout: 30_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/testing/**", // Integration tests, not published runtime code.
        "**/*.test.ts",
        "**/index.ts", // Re-export-only package surface.
        "**/types.ts", // Type declarations only.
      ],
      thresholds: { statements: 95, branches: 95, functions: 95, lines: 95 },
    },
  },
});
