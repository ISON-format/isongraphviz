// scripts/smoke.mjs (Node 22 and 24; needs the built dist of this package and of display-list, and the frozen fixtures): plans O1/F01 and two more oracle
// examples to .glplan files under demo/out/, checks them against the oracle's expected bytes, reads the plan back with the strict reader, runs one frame
// and the creation log against a counting fake context, checks the shader digest and the subject's witness. No GPU, no browser: a Node smoke.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRenderModel, initialState } from "isongraph-visualize-renderer-core";
import { readoutFromList, serializeReadout, buildDisplayList } from "isongraph-visualize-display-list";
import {
  SHADER_SET_SHA256, createGlResources, createWebglRenderer, createWebglSubject, executePlan, parseGlPlan, planGl, readoutFromGl, serializePlan, shaderSetBytes,
} from "../dist/index.js";

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ORACLES = join(PKG, "..", "..", "fixtures", "oracles-gl");
const read = (rel) => new Uint8Array(readFileSync(join(ORACLES, rel)));
const fail = (m) => { console.error(`SMOKE FAIL: ${m}`); process.exit(1); };
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const outDir = join(PKG, "demo", "out");
mkdirSync(outDir, { recursive: true });

if (createHash("sha256").update(shaderSetBytes()).digest("hex") !== SHADER_SET_SHA256) fail("shaderSetBytes() does not hash to SHADER_SET_SHA256");

const cases = [
  ["O1-F01 (row G01)", "../oracles/o1-basic.scene.json", "../oracles-igl/layouts/F01.layout.json", "plan/G01.glplan", "smoke-O1-F01"],
  ["O4-F02 (row G02; undirected, self-loop)", "../oracles/o4-undirected.scene.json", "../oracles-igl/layouts/F02.layout.json", "plan/G02.glplan", "smoke-O4-F02"],
  ["mixed20-F04 (row G05; parallel edges)", "../oracles-igl/scenes/mixed20.scene.json", "../oracles-igl/layouts/F04.layout.json", "plan/G05.glplan", "smoke-mixed20-F04"],
];
// a recording fake context: counts the calls of one creation and one frame (no GPU)
function fakeGl() {
  const calls = [];
  const names = new Proxy({}, { get: (_t, k) => (k === "isContextLost" ? () => false : k === "getExtension" ? () => null : k === "getShaderParameter" || k === "getProgramParameter" ? () => true : k === "getAttribLocation" ? () => 0 : k === "getShaderInfoLog" || k === "getProgramInfoLog" ? () => "" : (...a) => { calls.push([String(k), a.length]); return {}; }) });
  return { gl: names, calls };
}
for (const [name, scene, layout, planFile, out] of cases) {
  const model = await buildRenderModel(read(scene), read(layout));
  const state = initialState(model, { width: 900, height: 600 });
  const r = createWebglRenderer();
  await r.initialize({ host: "headless", size: { width: 900, height: 600 }, reducedMotion: false });
  await r.loadScene(model, state);
  const bytes = r.planBytes();
  if (!same(bytes, read(planFile))) fail(`${name}: the plan differs from the oracle bytes of ${planFile}`);
  if (!same(serializePlan(parseGlPlan(bytes)), bytes)) fail(`${name}: the strict reader does not round-trip the plan`);
  const list = buildDisplayList(model, state);
  if (!same(serializeReadout(readoutFromGl(parseGlPlan(bytes))), serializeReadout(readoutFromList(list)))) fail(`${name}: the readout of the plan differs from the list's`);
  if (!same(serializePlan(planGl(list)), bytes)) fail(`${name}: planGl(list) differs from the renderer's plan`);
  writeFileSync(join(outDir, `${out}.glplan`), bytes);
  const { gl, calls } = fakeGl();
  const res = createGlResources(gl);
  const created = calls.length;
  executePlan(gl, parseGlPlan(bytes), res, { widthPx: 900, heightPx: 600, ink: [34, 34, 34] });
  console.log(`ok ${name}: plan ${bytes.length} bytes, ${created} creation calls, ${calls.length - created} frame calls -> demo/out/${out}.glplan`);
  await r.dispose();
}

// the subject: the manifest and a witness over the plan
const model = await buildRenderModel(read("../oracles/o4-undirected.scene.json"), read("../oracles-igl/layouts/F02.layout.json"));
const state = initialState(model, { width: 900, height: 600 });
const s = createWebglSubject();
const r = await s.create({ host: "headless" });
await r.initialize({ host: "headless", size: { width: 900, height: 600 }, reducedMotion: false });
await r.loadScene(model, state);
const w = await s.witness(r);
if (w.backend !== "igr-gl/1" || w.elements.nodes.length !== model.nodes.length || w.texts.length !== 0) fail("the witness does not describe the plan");
if (s.manifest.capabilities["x-gl.executes"].status !== "unsupported") fail("a headless manifest must not claim that a GPU executes the plan");
console.log(`smoke ok on Node ${process.version}`);
