// scripts/ia-demo.mjs <file.ison> [--out dir] [--size WxH] [--events file.json] (design 17.1). NON-NORMATIVE. Compiles an ISON file and lays it out with the igl:F01
// policy (FORCE, as the other demos), renders headless (state, svg, tree), exports the bundle into a directory (scene.igs.json, layout.igl.json, state.igr.json,
// graph.svg, EXPORT.json), runs the accessibility gate on the tree with the default bindings, and optionally replays a transcript of input events (an array of
// events as in design 15.3 / Appendix A.4) through the machine, printing the intents. Imports no browser API. Needs `npm run build` first.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { compileScene } from "isongraph-visualize-scene-core";
import { computeForceLayout } from "isongraph-visualize-layout-core";
import { buildRenderModel } from "isongraph-visualize-renderer-core";
import { buildCompanionTree, runAccessibilityGate } from "isongraph-visualize-a11y-companion";
import { createMachine, step } from "isongraph-visualize-interaction-core";
import { exportBundle, renderHeadless } from "../dist/index.js";
import { writePlaygroundData } from "./playground-data.mjs";

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const VALUE_FLAGS = new Set(["--out", "--size", "--events"]);
const file = args.find((a, i) => !a.startsWith("--") && (i === 0 || !VALUE_FLAGS.has(args[i - 1])));
if (!file) { console.error("usage: ia-demo.mjs <file.ison> [--out dir] [--size WxH] [--events file.json] [--page]"); process.exit(2); }
const [w, h] = opt("--size", "900x600").split("x").map(Number);
const size = { width: w, height: h };
const out = opt("--out", "demo/out/ia-demo");

const source = new Uint8Array(readFileSync(file));
const scene = (await compileScene(source, "ison-v1")).sceneBytes;
const layout = (await computeForceLayout(scene, { width: 900, height: 600, iterations: 170, margin: 60, seed: 42 })).layoutBytes;
const r = await renderHeadless({ sceneBytes: scene, layoutBytes: layout, size, outputs: ["state", "svg", "tree"] });
const bundle = await exportBundle(r.model, r.state, layout);
mkdirSync(out, { recursive: true });
const names = { scene: "scene.igs.json", layout: "layout.igl.json", state: "state.igr.json", svg: "graph.svg" };
for (const [k, bytes] of bundle.files) writeFileSync(join(out, names[k]), bytes);
writeFileSync(join(out, "EXPORT.json"), bundle.manifestBytes);
const tree = buildCompanionTree(r.model, r.state);
const gate = runAccessibilityGate({ model: r.model, state: r.state, tree });
console.log(`scene_sha256  ${bundle.manifest.scene_sha256}\nlayout_sha256 ${bundle.manifest.layout_sha256}\nstate_sha256  ${bundle.manifest.state_sha256}`);
for (const a of bundle.manifest.artifacts) console.log(`${a.name.padEnd(7)} ${String(a.bytes).padStart(8)} bytes  ${names[a.name] ?? a.name}`);
console.log(`tree ${r.files.get("tree").length} bytes; gate verdict ${gate.verdict} (${gate.scope})`);
// --page: also writes demo/out/playground-data.js, the data of demo/playground.html, from the same source (the page's own copy of the compile and layout steps)
if (args.includes("--page")) {
  mkdirSync("demo/out", { recursive: true });
  await writePlaygroundData(file, "demo/out/playground-data.js", basename(file, ".ison"));
  console.log("wrote demo/out/playground-data.js (open demo/playground.html from a localhost server)");
}
const ev = opt("--events", undefined);
if (ev) {
  const model = await buildRenderModel(scene, layout);
  let m = createMachine();
  for (const e of JSON.parse(readFileSync(ev, "utf8"))) {
    const s = step(m, e, model, r.state);
    m = s.machine;
    for (const o of s.outputs) console.log(`${e.type}@${e.t} -> ${JSON.stringify(o)}`);
  }
}
