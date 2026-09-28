import { defineConfig } from "vitest/config";

// Reference checkouts have their own dependencies and test runners.
export default defineConfig({ test: { include: ["tests/**/*.test.ts"] } });
