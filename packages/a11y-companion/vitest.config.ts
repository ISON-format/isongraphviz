import { defineConfig } from "vitest/config";

// FAST suite (`npm test`): deterministic and small. Heavy work (the mutation matrix, many property seeds, the closed loop over long transcripts) lives in
// test/slow and runs with `npm run test:slow`.
export default defineConfig({
  test: { include: ["test/*.test.ts"], testTimeout: 30_000 },
});
