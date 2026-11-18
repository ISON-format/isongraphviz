import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// FAST suite (`npm test`): deterministic and small. Heavy work (the kit run over the whole IGR/1 corpus, scale checks, the K table mutation matrix)
// lives in test/slow and runs with `npm run test:slow`. The tests exercise the display-list SOURCE (the alias below), so a change there is tested
// at once; `npm run build` of display-list is still needed for the typecheck and the build of this package (they read its dist).
const src = (p: string): string => fileURLToPath(new URL(p, import.meta.url)).replace(/^[a-z]:/, (d) => d.toUpperCase());
export default defineConfig({
  resolve: {
    alias: [
      { find: /^isongraph-visualize-display-list\/canvas2d$/, replacement: src("../display-list/src/canvas2d/index.ts") },
      { find: /^isongraph-visualize-display-list$/, replacement: src("../display-list/src/index.ts") },
    ],
  },
  test: { include: ["test/*.test.ts"], testTimeout: 30_000 },
});
