// scripts/smoke.mjs (Node 22 and 24; needs only the built dist and the frozen fixtures): renders O1/F01 and two more oracle examples to .svg files
// under demo/out/ and checks them against the oracle's expected bytes, reads them back with the strict reader and round-trips an id.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRenderModel, initialState } from "isongraph-visualize-renderer-core";
import { createSvgRenderer, decodeElementId, elementDomId, pickElement, readSvg, renderSvg } from "../dist/index.js";

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ORACLES = join(PKG, "..", "..", "fixtures", "oracles-svg");
const read = (rel) => new Uint8Array(readFileSync(join(ORACLES, rel)));
const fail = (m) => { console.error(`SMOKE FAIL: ${m}`); process.exit(1); };
const outDir = join(PKG, "demo", "out");
mkdirSync(outDir, { recursive: true });

const cases = [
  ["O1-F01 (row G01)", "../oracles/o1-basic.scene.json", "../oracles-igl/layouts/F01.layout.json", "svg/G01.svg", "smoke-O1-F01.svg"],
  ["O4-F02 (row G02, undirected, self-loop)", "../oracles/o4-undirected.scene.json", "../oracles-igl/layouts/F02.layout.json", "svg/G02.svg", "smoke-O4-F02.svg"],
  ["mixed20-F04 (row G05, parallel edges)", "../oracles-igl/scenes/mixed20.scene.json", "../oracles-igl/layouts/F04.layout.json", "svg/G05.svg", "smoke-mixed20-F04.svg"],
];
for (const [name, scene, layout, expected, out] of cases) {
  const model = await buildRenderModel(read(scene), read(layout));
  const state = initialState(model, { width: 900, height: 600 });
  const svg = renderSvg(model, state);
  if (svg !== readFileSync(join(ORACLES, expected), "utf8")) fail(`${name}: the document differs from the oracle bytes of ${expected}`);
  const ro = readSvg(svg);
  if (ro.nodes.length !== model.nodes.length || ro.edges.length !== model.edges.length) fail(`${name}: the reader disagrees with the model`);
  const first = { node: model.nodes[0].ref };
  const id = elementDomId("igr", first);
  if (JSON.stringify(decodeElementId("igr", id)) !== JSON.stringify(first) || JSON.stringify(pickElement(model, state, "igr", { targetId: id })) !== JSON.stringify(first)) fail(`${name}: the id round trip failed`);
  writeFileSync(join(outDir, out), new TextEncoder().encode(svg));
  console.log(`ok ${name}: ${svg.length} bytes -> demo/out/${out}`);
}

// the renderer object: the same document through svg()
const model = await buildRenderModel(read(cases[0][1]), read(cases[0][2]));
const r = createSvgRenderer();
await r.initialize({ host: "headless", size: { width: 900, height: 600 }, reducedMotion: false });
await r.loadScene(model);
r.dispatch({ type: "select", mode: "replace", targets: [{ node: model.nodes[0].ref }] });
if (!r.svg().includes("igr-selected")) fail("createSvgRenderer().svg() does not show the selection");
console.log(`smoke ok on Node ${process.version}`);
