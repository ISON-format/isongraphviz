// scripts/smoke.mjs (Node 22 and 24; needs the built dist and the frozen fixtures): builds the display list of O1/F01 and of two more oracle examples,
// compares them with the oracle's expected bytes (rows G01, G02, G05), reads them back with the strict reader, writes the readout and the pick buffer and
// replays the list into the recording context.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRenderModel, initialState } from "isongraph-visualize-renderer-core";
import {
  backingSize, buildDisplayList, buildPickBuffer, parseDisplayList, readoutFromList, serializeDisplayList, serializePickBuffer, serializeReadout,
} from "isongraph-visualize-display-list";
import { readoutFromCanvasStream, recordCanvasCalls } from "isongraph-visualize-display-list/canvas2d";

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ORACLES = join(PKG, "..", "..", "fixtures", "oracles-dl");
const read = (rel) => new Uint8Array(readFileSync(join(ORACLES, rel)));
const fail = (m) => { console.error(`SMOKE FAIL: ${m}`); process.exit(1); };
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

const cases = [
  ["O1-F01 (row G01)", "../oracles/o1-basic.scene.json", "../oracles-igl/layouts/F01.layout.json", "dl/G01.dl", "pick/P01.pick", "xr/R01.xr.json"],
  ["O4-F02 (row G02)", "../oracles/o4-undirected.scene.json", "../oracles-igl/layouts/F02.layout.json", "dl/G02.dl"],
  ["mixed20-F04 (row G05)", "../oracles-igl/scenes/mixed20.scene.json", "../oracles-igl/layouts/F04.layout.json", "dl/G05.dl"],
];
for (const [name, scene, layout, dl, pick, xr] of cases) {
  const model = await buildRenderModel(read(scene), read(layout));
  const state = initialState(model, { width: 900, height: 600 });
  const list = buildDisplayList(model, state);
  const bytes = serializeDisplayList(list);
  if (!same(bytes, read(dl))) fail(`${name}: the list differs from the oracle bytes of ${dl}`);
  if (!same(serializeDisplayList(parseDisplayList(bytes)), bytes)) fail(`${name}: the strict reader does not round-trip the list`);
  if (pick && !same(serializePickBuffer(buildPickBuffer(list)), read(pick))) fail(`${name}: the pick buffer differs from ${pick}`);
  if (xr && !same(serializeReadout(readoutFromList(list)), read(xr))) fail(`${name}: the readout differs from ${xr}`);
  const stream = recordCanvasCalls(list);
  if (!same(serializeReadout(readoutFromCanvasStream(stream, list)), serializeReadout(readoutFromList(list)))) fail(`${name}: the stream readout differs from the list readout`);
  console.log(`ok ${name}: ${bytes.length} bytes, stream ${stream.length} bytes`);
}
const b = backingSize(900, 600, 1333);
if (b.e !== 1333 || b.bw !== 1200 || b.bh !== 800) fail("backingSize(900, 600, 1333)");
console.log(`smoke ok on Node ${process.version}`);
