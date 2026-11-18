import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts", "site/test/**/*.test.ts"],
    environment: "node",
    testTimeout: 20000,
  },
});
