import { defineConfig } from "vitest/config";
// The fast suite (`npm test`): generators, statistics, report writer and the S-size smoke. The benchmark itself is `npm run bench` and asserts nothing.
export default defineConfig({ test: { include: ["test/*.test.ts"], testTimeout: 120_000 } });
