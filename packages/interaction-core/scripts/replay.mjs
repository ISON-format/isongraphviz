// scripts/replay.mjs - NON-NORMATIVE demo script. ISON text (or a scene and a layout file) -> IGS/1 scene (scene-core) -> IGL/1 layout (layout-core) -> render model
// (renderer-core) -> a transcript of input events replayed through the gesture machine and a headless renderer. Needs `npm run build` first (it imports dist/).
//
//   node scripts/replay.mjs <file.ison> [--events file.json] [--size WxH] [--layout fixed|force] [--out file] [--page]
//   node scripts/replay.mjs <scene.json> <layout.json> [--events file.json] [--size WxH] [--out file] [--page]
//
// --events names a JSON array of input events (igr-input/1; see fixtures/oracles-ia/inputs/I50.events.json); without it a built-in sequence runs: a click on the
// first node, a drag, one wheel notch, ArrowRight twice (the first lands on the first element, the second moves right), Space. Each step prints the outputs of `step`; every `intent` output is dispatched to a headless renderer
// (the closed loop) and the final state hash is printed. --page also writes demo/out/data.js for demo/index.html.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compileScene, verifyScene } from "isongraph-visualize-scene-core";
import { computeFixedLayout, computeForceLayout } from "isongraph-visualize-layout-core";
import { buildRenderModel, initialState, layoutToScreen, stateSha256 } from "isongraph-visualize-renderer-core";
import { createHeadlessRenderer } from "isongraph-visualize-renderer-core/headless";
import { createMachine, serializeMachine, serializeStep, step } from "../dist/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(HERE, "..");
const text = (b) => new TextDecoder().decode(b);

/** ISON text to a render model (FIXED integer grid, or the FORCE family with the corpus policy igl:F01). */
export async function pipeline(sourceBytes, { layout = "fixed" } = {}) {
  const compiled = await compileScene(sourceBytes, "ison-v1");
  const sceneBytes = compiled.sceneBytes;
  let layoutBytes;
  if (layout === "force") layoutBytes = (await computeForceLayout(sceneBytes, { width: 900, height: 600, iterations: 170, margin: 60, seed: 42 })).layoutBytes;
  else {
    const { scene } = await verifyScene(sceneBytes);
    const cols = Math.max(1, Math.ceil(Math.sqrt(scene.nodes.length)));
    layoutBytes = (await computeFixedLayout(sceneBytes, scene.nodes.map((n, i) => ({ ref: n.ref, x: 80 + (i % cols) * 140, y: 80 + Math.floor(i / cols) * 120 })))).layoutBytes;
  }
  return { sceneBytes, layoutBytes, model: await buildRenderModel(sceneBytes, layoutBytes) };
}

/** Replays events through the machine and a headless renderer; returns the transcript `{final_state, steps}` and the renderer's final state. */
export async function replay(model, events, size, config) {
  const renderer = createHeadlessRenderer();
  await renderer.initialize({ host: "headless", size, reducedMotion: false });
  await renderer.loadScene(model, initialState(model, size));
  let machine = createMachine();
  const steps = [];
  const intents = [];
  for (const event of events) {
    const r = step(machine, event, model, renderer.getState(), config);
    machine = r.machine;
    steps.push(JSON.parse(text(serializeStep(r))));
    for (const o of r.outputs) if (o.kind === "intent") { intents.push(o.intent); renderer.dispatch(o.intent); }
  }
  const state = renderer.getState();
  await renderer.dispose();
  return { transcript: { final_state: JSON.parse(text(serializeMachine(machine))), steps }, state, intents };
}

/** The built-in sequence: a click on the first node, a drag, one wheel notch, a key walk. */
export function defaultEvents(model, state) {
  const n = model.nodes[0];
  const p = n ? layoutToScreen(state.viewport, n) : { x: 100, y: 100 };
  const x = Math.round(p.x * 1000), y = Math.round(p.y * 1000);
  const addr = n ? { node: { id: n.ref.id, type: n.ref.type } } : undefined;
  const down = (t, id, px, py, target) => ({ type: "pointerdown", t, id, ptype: "mouse", button: 0, x: px, y: py, mods: 0, ...(target ? { target } : {}) });
  return [
    down(0, 0, x, y, addr), { type: "pointerup", t: 80, id: 0, x, y, mods: 0 },
    down(100, 0, 500000, 300000), { type: "pointermove", t: 110, id: 0, x: 520500, y: 300400, mods: 0 }, { type: "pointerup", t: 120, id: 0, x: 520500, y: 300400, mods: 0 },
    { type: "wheel", t: 200, x: 450000, y: 300000, dy: -100000, unit: 0, mods: 0 },
    { type: "key", t: 300, key: "ArrowRight", mods: 0 }, { type: "key", t: 310, key: "ArrowRight", mods: 0 }, { type: "key", t: 320, key: "Space", mods: 0 },
  ];
}

function parseArgs(argv) {
  const a = { files: [], events: undefined, out: undefined, size: { width: 900, height: 600 }, layout: "fixed", page: false };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--events") a.events = argv[++i];
    else if (t === "--out") a.out = argv[++i];
    else if (t === "--size") { const m = /^(\d+)x(\d+)$/.exec(argv[++i] ?? ""); if (!m) throw new Error("--size expects WxH"); a.size = { width: Number(m[1]), height: Number(m[2]) }; }
    else if (t === "--layout") { a.layout = argv[++i]; if (a.layout !== "fixed" && a.layout !== "force") throw new Error("--layout expects fixed or force"); }
    else if (t === "--page") a.page = true;
    else if (t.startsWith("--")) throw new Error(`unknown option ${t}`);
    else a.files.push(t);
  }
  if (a.files.length < 1 || a.files.length > 2) throw new Error("usage: node scripts/replay.mjs <file.ison> | <scene.json> <layout.json> [--events file.json] [--size WxH] [--layout fixed|force] [--out file] [--page]");
  return a;
}

const b64 = (bytes) => Buffer.from(bytes).toString("base64");

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const first = new Uint8Array(readFileSync(a.files[0]));
  let r;
  if (extname(a.files[0]) === ".ison") r = await pipeline(first, { layout: a.layout });
  else {
    if (a.files.length !== 2) throw new Error("a scene file needs a layout file");
    const layoutBytes = new Uint8Array(readFileSync(a.files[1]));
    r = { sceneBytes: first, layoutBytes, model: await buildRenderModel(first, layoutBytes) };
  }
  const { model } = r;
  const events = a.events ? JSON.parse(readFileSync(a.events, "utf8")) : defaultEvents(model, initialState(model, a.size));
  const out = await replay(model, events, a.size);
  console.log(`scene  ${model.sceneSha256}\nlayout ${model.layoutSha256}`);
  out.transcript.steps.forEach((s, i) => console.log(`step ${i} ${events[i].type}: handled ${s.handled}${s.wake_at === undefined ? "" : ` wake_at ${s.wake_at}`} outputs ${JSON.stringify(s.outputs)}`));
  console.log(`dispatched ${out.intents.length} intents; final state sha256 ${await stateSha256(model, out.state)}`);
  const name = basename(a.files[0], extname(a.files[0])).replace(/\.scene$/, "");
  const outDir = join(PKG, "demo", "out");
  mkdirSync(outDir, { recursive: true });
  const file = a.out ? resolve(a.out) : join(outDir, `${name}.replay.json`);
  writeFileSync(file, JSON.stringify(out.transcript) + "\n");
  console.log(`wrote ${file}`);
  if (a.page) {
    writeFileSync(join(outDir, "data.js"), `window.__IA_DEMO__ = ${JSON.stringify({ name, size: a.size, sceneB64: b64(r.sceneBytes), layoutB64: b64(r.layoutBytes) })};\n`);
    console.log(`wrote ${join(outDir, "data.js")} (for demo/index.html; run \`npm run demo:build\` once to bundle the binder)`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
