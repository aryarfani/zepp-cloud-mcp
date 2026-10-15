import { defineConfig } from "vitest/config";

// Tests that need real Node APIs (node:sqlite). The default config runs inside workerd, which has no node:sqlite.
export default defineConfig({
  test: { include: ["test/node/**/*.test.ts"], environment: "node", restoreMocks: true }
});