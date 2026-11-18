// scripts/render-ison.mjs - NON-NORMATIVE demo script (design 15.1). ISON text -> IGS/1 scene (scene-core) -> IGL/1 layout (layout-core) -> render model
// (renderer-core) -> display list (display-list) -> Canvas call stream. Needs the built packages (`npm run build` here and in ../display-list).
//
//   node scripts/render-ison.mjs <file.ison> [--out file] [--size WxH] [--what dl|calls] [--layout fixed|force] [--demo]
//
// --what dl|calls writes only the display-list bytes or only the recorded stream (default: both, to demo/out/<name>.dl and demo/out/<name>.calls);
// --out names the file (with --what; without --what it is the stem). --layout fixed (default) places the nodes on a deterministic integer grid with
// layout-core's FIXED family; --layout force runs the FORCE family with the corpus policy igl:F01, which for fixtures/oracles/o1-basic.source.ison
// gives the bytes of rows dl:G01 (the list) and dl:C01 (the stream). --demo also writes demo/out/data.js (source, scene and layout bytes, base64)
// for demo/index.html.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compileScene, verifyScene } from "isongraph-visualize-scene-core";
import { computeFixedLayout, computeForceLayout } from "isongraph-visualize-layout-core";
import { buildRenderModel, initialState } from "isongraph-visualize-renderer-core";
import { buildDisplayList, serializeDisplayList } from "isongraph-visualize-display-list";
import { recordCanvasCalls } from "isongraph-visualize-display-list/canvas2d";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(HERE, "..");

/** The whole pipeline; returns every intermediate so that callers (smoke, demo-check, browser-smoke) can reuse them. */
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
  const list = buildDisplayList(model, state);
  return { sceneBytes, layoutBytes, model, state, list, listBytes: serializeDisplayList(list), calls: recordCanvasCalls(list), compiled };
}

function parseArgs(argv) {
  const a = { file: undefined, out: undefined, size: { width: 900, height: 600 }, what: undefined, layout: "fixed", demo: false };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--out") a.out = argv[++i];
    else if (t === "--size") { const m = /^(\d+)x(\d+)$/.exec(argv[++i] ?? ""); if (!m) throw new Error("--size expects WxH"); a.size = { width: Number(m[1]), height: Number(m[2]) }; }
    else if (t === "--what") { a.what = argv[++i]; if (a.what !== "dl" && a.what !== "calls") throw new Error("--what expects dl or calls"); }
    else if (t === "--layout") { a.layout = argv[++i]; if (a.layout !== "fixed" && a.layout !== "force") throw new Error("--layout expects fixed or force"); }
    else if (t === "--demo") a.demo = true;
    else if (t.startsWith("--")) throw new Error(`unknown option ${t}`);
    else if (a.file === undefined) a.file = t;
    else throw new Error("one input file only");
  }
  if (a.file === undefined) throw new Error("usage: node scripts/render-ison.mjs <file.ison> [--out file] [--size WxH] [--what dl|calls] [--layout fixed|force] [--demo]");
  return a;
}

const b64 = (bytes) => Buffer.from(bytes).toString("base64");

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const sourceBytes = new Uint8Array(readFileSync(a.file));
  const r = await pipeline(sourceBytes, { size: a.size, layout: a.layout });
  const outDir = join(PKG, "demo", "out");
  mkdirSync(outDir, { recursive: true });
  const name = basename(a.file, extname(a.file));
  const stem = a.out && !a.what ? resolve(a.out) : join(outDir, name);
  const writes = [];
  if (a.what !== "calls") writes.push([a.what && a.out ? resolve(a.out) : `${stem}.dl`, r.listBytes]);
  if (a.what !== "dl") writes.push([a.what && a.out ? resolve(a.out) : `${stem}.calls`, r.calls]);
  console.log(`artifact ${r.model.artifactSha256}`);
  console.log(`scene    ${r.model.sceneSha256}`);
  console.log(`layout   ${r.model.layoutSha256}`);
  for (const [file, bytes] of writes) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, bytes);
    console.log(`wrote ${file} (${bytes.length} bytes, ${r.model.nodes.length} nodes, ${r.model.edges.length} edges, layout ${a.layout})`);
  }
  if (a.demo) {
    const data = { name, size: a.size, layout: a.layout, source: new TextDecoder().decode(sourceBytes), sourceB64: b64(sourceBytes), sceneB64: b64(r.sceneBytes), layoutB64: b64(r.layoutBytes) };
    writeFileSync(join(outDir, "data.js"), `window.__ISON_DEMO__ = ${JSON.stringify(data)};\n`);
    console.log(`wrote ${join(outDir, "data.js")} (for demo/index.html; run \`npm run demo:build\` once to bundle the adapter)`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
