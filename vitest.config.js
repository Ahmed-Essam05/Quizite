import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.js"],
    setupFiles: ["./tests/setup.js"],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 120000,
  },
});
