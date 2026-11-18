import { defineConfig } from "vitest/config";
// SLOW suite: one forked worker, files one after another, so that memory and time do not add up and a loaded machine
// changes only the duration, not the verdict. The timeouts are generous on purpose: a conformance pass takes seconds,
// the 200,000-node models take about ten seconds each and the oracle mutation matrix runs 66 passes.
export default defineConfig({
  test: { include: ["test/slow/**/*.test.ts"], pool: "forks", maxWorkers: 1, fileParallelism: false, testTimeout: 180_000, hookTimeout: 180_000 },
});
