// demo/render-ison.mjs - NON-NORMATIVE demo (design 17.1). ISON text -> IGS/1 scene (scene-core) -> IGL/1 layout (layout-core) -> render model
// (renderer-core) -> SVG (this package). Needs the built package (`npm run build`).
//
//   node demo/render-ison.mjs <file.ison> [--out file.svg] [--size WxH] [--layout fixed|force] [--demo]
//
// --layout fixed (default) places the nodes on a deterministic integer grid with layout-core's FIXED family (computeFixedLayout);
// --layout force runs layout-core's FORCE family with the igl:F01 policy of the oracle corpus (this is what demo-check compares with row O05).
// --demo additionally writes demo/out/data.js (source, scene and layout bytes, base64) for demo/index.html, which loads the DOM adapter.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compileScene, verifyScene } from "isongraph-visualize-scene-core";
import { computeFixedLayout, computeForceLayout } from "isongraph-visualize-layout-core";
import { buildRenderModel, initialState } from "isongraph-visualize-renderer-core";
import { renderSvg } from "../dist/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));

/** The whole pipeline; returns every intermediate so that callers (demo-check) can reuse them. */
export async function pipeline(sourceBytes, { size = { width: 900, height: 600 }, layout = "fixed" } = {}) {
  const compiled = await compileScene(sourceBytes, "ison-v1");
  const sceneBytes = compiled.sceneBytes;
  let layoutBytes;
  if (layout === "force") {
    layoutBytes = (await computeForceLayout(sceneBytes, { width: 900, height: 600, iterations: 170, margin: 60, seed: 42 })).layoutBytes;
  } else {
    const { scene } = await verifyScene(sceneBytes);
    const cols = Math.max(1, Math.ceil(Math.sqrt(scene.nodes.length)));
    const positions = scene.nodes.map((n, i) => ({ ref: n.ref, x: 80 + (i % cols) * 140, y: 80 + Math.floor(i / cols) * 120 })); // integers only
    layoutBytes = (await computeFixedLayout(sceneBytes, positions)).layoutBytes;
  }
  const model = await buildRenderModel(sceneBytes, layoutBytes);
  const state = initialState(model, size);
  const svg = renderSvg(model, state, { xmlDeclaration: true });
  return { sceneBytes, layoutBytes, model, state, svg, compiled };
}

function parseArgs(argv) {
  const a = { file: undefined, out: undefined, size: { width: 900, height: 600 }, layout: "fixed", demo: false };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--out") a.out = argv[++i];
    else if (t === "--size") { const m = /^(\d+)x(\d+)$/.exec(argv[++i] ?? ""); if (!m) throw new Error("--size expects WxH"); a.size = { width: Number(m[1]), height: Number(m[2]) }; }
    else if (t === "--layout") { a.layout = argv[++i]; if (a.layout !== "fixed" && a.layout !== "force") throw new Error("--layout expects fixed or force"); }
    else if (t === "--demo") a.demo = true;
    else if (t.startsWith("--")) throw new Error(`unknown option ${t}`);
    else if (a.file === undefined) a.file = t;
    else throw new Error("one input file only");
  }
  if (a.file === undefined) throw new Error("usage: node demo/render-ison.mjs <file.ison> [--out file.svg] [--size WxH] [--layout fixed|force] [--demo]");
  return a;
}

const b64 = (bytes) => Buffer.from(bytes).toString("base64");

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const sourceBytes = new Uint8Array(readFileSync(a.file));
  const r = await pipeline(sourceBytes, { size: a.size, layout: a.layout });
  const outDir = join(HERE, "out");
  mkdirSync(outDir, { recursive: true });
  const name = basename(a.file, extname(a.file));
  const out = a.out ? resolve(a.out) : join(outDir, `${name}.svg`);
  mkdirSync(dirname(out), { recursive: true });
  const bytes = new TextEncoder().encode(r.svg); // UTF-8, no BOM
  writeFileSync(out, bytes);
  console.log(`artifact ${r.model.artifactSha256}`);
  console.log(`scene    ${r.model.sceneSha256}`);
  console.log(`layout   ${r.model.layoutSha256}`);
  console.log(`wrote ${out} (${bytes.length} bytes, ${r.model.nodes.length} nodes, ${r.model.edges.length} edges, layout ${a.layout})`);
  if (a.demo) {
    const data = { name, size: a.size, layout: a.layout, source: new TextDecoder().decode(sourceBytes), sourceB64: b64(sourceBytes), sceneB64: b64(r.sceneBytes), layoutB64: b64(r.layoutBytes) };
    writeFileSync(join(outDir, "data.js"), `window.__ISON_DEMO__ = ${JSON.stringify(data)};\n`);
    console.log(`wrote ${join(outDir, "data.js")} (for demo/index.html; run \`npm run demo:build\` once to bundle the adapter)`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
