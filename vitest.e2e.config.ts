import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node", include: ["e2e/**/*.e2e.ts"], testTimeout: 90 * 60_000, hookTimeout: 60_000 } });
