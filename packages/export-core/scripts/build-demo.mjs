// scripts/build-demo.mjs - bundles demo/page.mjs (renderer-canvas ./dom, renderer-svg ./dom and its core entry, interaction-core ./dom, a11y-companion ./dom and this package) with esbuild into
// demo/out/demo.js and writes demo/out/data.js (the example scene and layout of the oracle corpus). It also bundles demo/playground.mjs into demo/out/playground.js
// and writes demo/out/playground-data.js from demo/playground-sample.ison (the playground page, demo/playground.html). NON-NORMATIVE. Needs `npm run build` first.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { writePlaygroundData } from "./playground-data.mjs";

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ORACLES = join(PKG, "..", "..", "fixtures", "oracles-ia");
const out = join(PKG, "demo", "out");
mkdirSync(out, { recursive: true });
const b64 = (rel) => readFileSync(join(ORACLES, rel)).toString("base64");
writeFileSync(join(out, "data.js"), `window.__IA_DEMO__ = ${JSON.stringify({ name: "G9", size: { width: 900, height: 600 }, sceneB64: b64("scenes/G9.scene.json"), layoutB64: b64("layouts/G9.layout.json") })};\n`);
const r = await build({ entryPoints: [join(PKG, "demo", "page.mjs")], bundle: true, format: "iife", platform: "browser", outfile: join(out, "demo.js"), logLevel: "error", target: "es2022", metafile: true });
console.log(`wrote demo/out/demo.js (${Object.values(r.metafile.outputs)[0].bytes} bytes) and demo/out/data.js`);
const pg = await build({ entryPoints: [join(PKG, "demo", "playground.mjs")], bundle: true, format: "iife", platform: "browser", outfile: join(out, "playground.js"), logLevel: "error", target: "es2022", metafile: true });
await writePlaygroundData(join(PKG, "demo", "playground-sample.ison"), join(out, "playground-data.js"), "playground-sample");
console.log(`wrote demo/out/playground.js (${Object.values(pg.metafile.outputs)[0].bytes} bytes) and demo/out/playground-data.js`);
