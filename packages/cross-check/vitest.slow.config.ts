import { defineConfig } from "vitest/config";
import { alias } from "./vitest.config.js";

// SLOW suite: one forked worker, files one after another, so that memory and time do not add up and a loaded machine changes only the duration, not the verdict.
export default defineConfig({
  resolve: { alias },
  test: { include: ["test/slow/**/*.test.ts"], pool: "forks", maxWorkers: 1, fileParallelism: false, testTimeout: 600_000, hookTimeout: 600_000 },
});
