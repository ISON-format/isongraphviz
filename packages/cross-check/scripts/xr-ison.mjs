// scripts/xr-ison.mjs - NON-NORMATIVE demo script (design 15.1): ISON text -> IGS/1 scene -> IGL/1 layout -> render model -> the V5 SVG document, the display list, the
// Canvas stream and the GL plan -> the readouts of XR-1 -> `XR-1: agree` (or the differing paths) with the artifact sizes. Needs the built dists of display-list,
// renderer-svg and renderer-webgl (`npm run build` in each).
//
//   node scripts/xr-ison.mjs <file.ison> [--size WxH] [--layout fixed|force]
//
// What the line means (design 9.5): the SVG readout is independent of the list for what the readout contains; the list, Canvas and GL readouts are projections of
// one list, so their agreement shows that the executors follow the list, not that the list is right. Edge routes, label positions, colours and pixels are not compared.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compileScene, verifyScene } from "isongraph-visualize-scene-core";
import { computeFixedLayout, computeForceLayout } from "isongraph-visualize-layout-core";
import { buildRenderModel, initialState } from "isongraph-visualize-renderer-core";
import { buildDisplayList, compareReadouts, readoutFromList, readoutFromSvgReadout, serializeReadout, serializeDisplayList } from "isongraph-visualize-display-list";
import { readoutFromCanvasStream, recordCanvasCalls } from "isongraph-visualize-display-list/canvas2d";
import { readSvg, renderSvg } from "isongraph-visualize-renderer-svg";
import { planGl, readoutFromGl, serializePlan } from "isongraph-visualize-renderer-webgl";

export async function run(sourceBytes, { size = { width: 900, height: 600 }, layout = "fixed" } = {}) {
  const sceneBytes = (await compileScene(sourceBytes, "ison-v1")).sceneBytes;
  let layoutBytes;
  if (layout === "force") layoutBytes = (await computeForceLayout(sceneBytes, { width: 900, height: 600, iterations: 170, margin: 60, seed: 42 })).layoutBytes;
  else {
    const { scene } = await verifyScene(sceneBytes);
    const cols = Math.max(1, Math.ceil(Math.sqrt(scene.nodes.length)));
    layoutBytes = (await computeFixedLayout(sceneBytes, scene.nodes.map((n, i) => ({ ref: n.ref, x: 80 + (i % cols) * 140, y: 80 + Math.floor(i / cols) * 120 })))).layoutBytes;
  }
  const model = await buildRenderModel(sceneBytes, layoutBytes);
  const state = initialState(model, size);
  const list = buildDisplayList(model, state);
  const svgDoc = renderSvg(model, state);
  const stream = recordCanvasCalls(list);
  const plan = planGl(list);
  const readouts = [
    { renderer: "svg", readout: readoutFromSvgReadout(readSvg(svgDoc)) },
    { renderer: "canvas", readout: readoutFromCanvasStream(stream, list) },
    { renderer: "webgl", readout: readoutFromGl(plan) },
    { renderer: "list", readout: readoutFromList(list) },
  ];
  const bytes = readouts.map((r) => Buffer.from(serializeReadout(r.readout)).toString("utf8"));
  const identical = bytes.every((b) => b === bytes[0]);
  const cmp = compareReadouts(readouts);
  return { identical, cmp, sizes: { svg: new TextEncoder().encode(svgDoc).length, displayList: serializeDisplayList(list).length, canvasStream: stream.length, glPlan: serializePlan(plan).length, readout: bytes[0].length } };
}

function parseArgs(argv) {
  const a = { file: undefined, size: { width: 900, height: 600 }, layout: "fixed" };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--size") { const m = /^(\d+)x(\d+)$/.exec(argv[++i] ?? ""); if (!m) throw new Error("--size expects WxH"); a.size = { width: Number(m[1]), height: Number(m[2]) }; }
    else if (t === "--layout") { a.layout = argv[++i]; if (a.layout !== "fixed" && a.layout !== "force") throw new Error("--layout expects fixed or force"); }
    else if (t.startsWith("--")) throw new Error(`unknown option ${t}`);
    else if (a.file === undefined) a.file = t;
    else throw new Error("one input file only");
  }
  if (a.file === undefined) throw new Error("usage: node scripts/xr-ison.mjs <file.ison> [--size WxH] [--layout fixed|force]");
  return a;
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const r = await run(new Uint8Array(readFileSync(a.file)), { size: a.size, layout: a.layout });
  const s = r.sizes;
  console.log(`artifacts: svg ${s.svg} bytes, display list ${s.displayList} bytes, canvas stream ${s.canvasStream} bytes, gl plan ${s.glPlan} bytes, readout ${s.readout} bytes`);
  if (r.identical && r.cmp.agree) console.log("XR-1: agree");
  else { console.log(`XR-1: DIFFER ${JSON.stringify(r.cmp.differences ?? r.cmp)}`); process.exitCode = 1; }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
