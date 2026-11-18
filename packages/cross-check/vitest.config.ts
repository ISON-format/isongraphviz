import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// FAST suite (`npm test`): deterministic and small. The slow suite (many generated models) is test/slow. The tests exercise the SOURCE of the four packages (the
// aliases below), so a change in any of them is tested at once; `npm run build` of each is still needed for the scripts and the smoke (they read the dist).
const src = (p: string): string => fileURLToPath(new URL(p, import.meta.url)).replace(/^[a-z]:/, (d) => d.toUpperCase());
export const alias = [
  { find: /^isongraph-visualize-display-list\/canvas2d$/, replacement: src("../display-list/src/canvas2d/index.ts") },
  { find: /^isongraph-visualize-display-list$/, replacement: src("../display-list/src/index.ts") },
  { find: /^isongraph-visualize-renderer-svg$/, replacement: src("../renderer-svg/src/index.ts") },
  { find: /^isongraph-visualize-renderer-canvas$/, replacement: src("../renderer-canvas/src/index.ts") },
  { find: /^isongraph-visualize-renderer-webgl$/, replacement: src("../renderer-webgl/src/index.ts") },
];
export default defineConfig({
  resolve: { alias },
  test: { include: ["test/*.test.ts"], testTimeout: 30_000 },
});
