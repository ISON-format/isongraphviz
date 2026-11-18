import { defineConfig } from "vitest/config";
// FAST suite (`npm test`): deterministic and small; nothing here builds a large model or runs a conformance pass.
// The slow tests (200,000-node models, whole conformance passes, the mutation matrix) live in test/slow and run with
// `npm run test:slow` (vitest.slow.config.ts): one worker, explicit timeouts. `npm run check` runs both.
export default defineConfig({ test: { include: ["test/*.test.ts"], testTimeout: 30_000 } });
