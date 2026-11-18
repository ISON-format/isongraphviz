// demo/build-demo.mjs - bundles demo/page.mjs (DOM adapter, display-list, renderer-core, scene-core) into demo/out/demo.js (IIFE, browser). NON-NORMATIVE.
// Needs `npm run build` first (the page imports dist/ and the display-list dist). The output directory demo/out is git-ignored.
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const HERE = dirname(fileURLToPath(import.meta.url));
mkdirSync(join(HERE, "out"), { recursive: true });
const r = await build({ entryPoints: [join(HERE, "page.mjs")], bundle: true, format: "iife", platform: "browser", outfile: join(HERE, "out", "demo.js"), logLevel: "error", target: "es2022", metafile: true });
const bytes = Object.values(r.metafile.outputs)[0].bytes;
console.log(`wrote demo/out/demo.js (${bytes} bytes)`);
