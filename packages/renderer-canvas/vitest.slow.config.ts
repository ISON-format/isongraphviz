import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// SLOW suite: one forked worker, files one after another, so that memory and time do not add up and a loaded machine changes only the duration,
// not the verdict. Same display-list source alias as the fast suite.
const src = (p: string): string => fileURLToPath(new URL(p, import.meta.url)).replace(/^[a-z]:/, (d) => d.toUpperCase());
export default defineConfig({
  resolve: {
    alias: [
      { find: /^isongraph-visualize-display-list\/canvas2d$/, replacement: src("../display-list/src/canvas2d/index.ts") },
      { find: /^isongraph-visualize-display-list$/, replacement: src("../display-list/src/index.ts") },
    ],
  },
  test: { include: ["test/slow/**/*.test.ts"], pool: "forks", maxWorkers: 1, fileParallelism: false, testTimeout: 600_000, hookTimeout: 600_000 },
});
