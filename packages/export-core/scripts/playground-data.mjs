// scripts/playground-data.mjs - the data of demo/playground.html (NON-NORMATIVE). Compiles an ISON source (ison-v1), lays it out with the FORCE policy of the
// other demos (900 x 600, 170 iterations, margin 60; seed 164 was picked from seeds 0..599 for few edge crossings, no node on another edge and no crowded pair) and returns the page data `window.__PLAYGROUND__`. Used by `scripts/ia-demo.mjs --page`
// and by `scripts/build-demo.mjs`. The layout bytes it returns are the ORIGINAL layout; the page never changes them (a drag builds a new FIXED layout beside them).
import { readFileSync, writeFileSync } from "node:fs";
import { compileScene } from "isongraph-visualize-scene-core";
import { computeForceLayout } from "isongraph-visualize-layout-core";

const b64 = (bytes) => Buffer.from(bytes).toString("base64");

/** { name, source, size, sceneB64, layoutB64 } for the ISON file at `path`. */
export async function playgroundData(path, name = "playground") {
  const sceneBytes = (await compileScene(new Uint8Array(readFileSync(path)), "ison-v1")).sceneBytes;
  const layoutBytes = (await computeForceLayout(sceneBytes, { width: 900, height: 600, iterations: 170, margin: 60, seed: 164 })).layoutBytes;
  return { name, size: { width: 900, height: 600 }, sceneB64: b64(sceneBytes), layoutB64: b64(layoutBytes) };
}

/** Writes `window.__PLAYGROUND__ = {...};` to `outFile`. */
export async function writePlaygroundData(path, outFile, name) {
  const data = await playgroundData(path, name);
  writeFileSync(outFile, `window.__PLAYGROUND__ = ${JSON.stringify(data)};\n`);
  return data;
}
