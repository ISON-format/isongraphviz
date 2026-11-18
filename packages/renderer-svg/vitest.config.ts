import { defineConfig } from "vitest/config";
// FAST suite (`npm test`): deterministic and small. Heavy work (the kit run over the whole IGR/1 corpus, 4 MB id strings, the K table
// mutation matrix) lives in test/slow and runs with `npm run test:slow`.
export default defineConfig({ test: { include: ["test/*.test.ts"], testTimeout: 30_000 } });
