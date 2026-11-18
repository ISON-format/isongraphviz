// scripts/smoke.mjs (Node 22 and 24; needs the built dist of this package and of display-list, and the frozen fixtures): renders O1/F01 and two more oracle
// examples to .dl and .calls files under demo/out/, checks them against the oracle's expected bytes, reads the list back with the strict reader and picks a
// loop with the drawn-route picker.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRenderModel, initialState } from "isongraph-visualize-renderer-core";
import { createPicker, parseDisplayList, serializeDisplayList } from "isongraph-visualize-display-list";
import { createCanvasRenderer, createCanvasSubject } from "../dist/index.js";

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ORACLES = join(PKG, "..", "..", "fixtures", "oracles-dl");
const read = (rel) => new Uint8Array(readFileSync(join(ORACLES, rel)));
const fail = (m) => { console.error(`SMOKE FAIL: ${m}`); process.exit(1); };
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const outDir = join(PKG, "demo", "out");
mkdirSync(outDir, { recursive: true });

const cases = [
  ["O1-F01 (rows G01, C01)", "../oracles/o1-basic.scene.json", "../oracles-igl/layouts/F01.layout.json", "dl/G01.dl", "calls/C01.calls", "smoke-O1-F01"],
  ["O4-F02 (rows G02, C04; undirected, self-loop)", "../oracles/o4-undirected.scene.json", "../oracles-igl/layouts/F02.layout.json", "dl/G02.dl", "calls/C04.calls", "smoke-O4-F02"],
  ["mixed20-F04 (rows G05, C07; parallel edges)", "../oracles-igl/scenes/mixed20.scene.json", "../oracles-igl/layouts/F04.layout.json", "dl/G05.dl", "calls/C07.calls", "smoke-mixed20-F04"],
];
for (const [name, scene, layout, dl, calls, out] of cases) {
  const model = await buildRenderModel(read(scene), read(layout));
  const state = initialState(model, { width: 900, height: 600 });
  const r = createCanvasRenderer();
  await r.initialize({ host: "headless", size: { width: 900, height: 600 }, reducedMotion: false });
  await r.loadScene(model, state);
  const listBytes = r.displayListBytes(), stream = r.canvasCalls();
  if (!same(listBytes, read(dl))) fail(`${name}: the list differs from the oracle bytes of ${dl}`);
  if (!same(stream, read(calls))) fail(`${name}: the stream differs from the oracle bytes of ${calls}`);
  if (!same(serializeDisplayList(parseDisplayList(listBytes)), listBytes)) fail(`${name}: the strict reader does not round-trip the list`);
  writeFileSync(join(outDir, `${out}.dl`), listBytes);
  writeFileSync(join(outDir, `${out}.calls`), stream);
  console.log(`ok ${name}: list ${listBytes.length} bytes, stream ${stream.length} bytes -> demo/out/${out}.{dl,calls}`);
  await r.dispose();
}

// the picker reaches a self-loop that the frozen hitTest cannot
const model = await buildRenderModel(read("../oracles/o4-undirected.scene.json"), read("../oracles-igl/layouts/F02.layout.json"));
const state = initialState(model, { width: 900, height: 600 });
const loop = createPicker(model, state).pick({ x: 867.928, y: 381.4 });
if (!loop || !("edge" in loop)) fail("pickDrawn did not find the self-loop");

// the subject: the manifest and a witness over the stream
const s = createCanvasSubject();
const r = await s.create({ host: "headless" });
await r.initialize({ host: "headless", size: { width: 900, height: 600 }, reducedMotion: false });
await r.loadScene(model, state);
const w = await s.witness(r);
if (w.backend !== "igr-cv/1" || w.elements.nodes.length !== model.nodes.length || w.texts.length !== 0) fail("the witness does not describe the stream");
console.log(`smoke ok on Node ${process.version}`);
