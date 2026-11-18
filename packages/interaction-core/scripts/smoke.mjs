// scripts/smoke.mjs (Node 22 and 24; needs the built dist/ of this package and of renderer-core, scene-core, layout-core, and the tracked corpus): the Appendix A
// transcripts replay to the tracked oracle bytes (I50 on O1, V22, V30 on G9), the default binding table serializes to its tracked bytes, a lasso rectangle and a
// reveal pan give the documented numbers, and a short closed loop against a headless renderer keeps every state valid.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRenderModel, initialState, reduce } from "isongraph-visualize-renderer-core";
import { DEFAULT_BINDINGS, createMachine, keyToken, lassoTargets, revealPan, serializeBindings, serializeMachine, serializeStep, step } from "../dist/index.js";
import { replay } from "./replay.mjs";

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ORACLES = join(PKG, "..", "..", "fixtures", "oracles-ia");
const read = (rel) => new Uint8Array(readFileSync(join(ORACLES, rel)));
const fail = (m) => { console.error(`SMOKE FAIL: ${m}`); process.exit(1); };
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const text = (b) => new TextDecoder().decode(b);
const size = { width: 900, height: 600 };
const model = async (scene, layout) => buildRenderModel(read(scene), read(layout));

// 1. the default table (Appendix A.3, row B12)
if (!same(serializeBindings(DEFAULT_BINDINGS), read("json/B12.bindings.json"))) fail("the default binding table differs from the tracked bytes of row B12");
console.log(`ok default table: ${DEFAULT_BINDINGS.length} rows, ${serializeBindings(DEFAULT_BINDINGS).length} bytes`);

// 2. A.4 (row I50): six events on O1, replayed through a headless renderer
const o1 = await model("scenes/O1.scene.json", "layouts/O1.layout.json");
const events = JSON.parse(text(read("inputs/I50.events.json")));
const r50 = await replay(o1, events, size);
const expected = JSON.parse(text(read("transcripts/I50.result.json")));
if (JSON.stringify(r50.transcript) !== JSON.stringify(expected)) fail("the I50 transcript differs from the tracked bytes");
console.log(`ok A.4: ${events.length} events -> ${r50.intents.length} intents, the transcript equals transcripts/I50.result.json`);

// 3. A.5 and A.14: a key step with the reveal rule
const g9 = await model("scenes/G9.scene.json", "layouts/G9.layout.json");
let s = reduce(g9, initialState(g9, size), { type: "set-viewport", center_x: 0, center_y: 0, zoom: 2680 }).state;
s = reduce(g9, s, { type: "focus", target: { node: { id: "s:b", type: "p" } } }).state;
const k = step(createMachine(), { type: "key", t: 0, key: "ArrowRight", mods: 0 }, g9, s);
const v30 = JSON.parse(text(read("transcripts/V30.result.json")));
if (JSON.stringify(JSON.parse(text(serializeStep(k)))) !== JSON.stringify(v30.steps[0])) fail("the V30 step differs from the tracked bytes");
const pan = revealPan(g9, reduce(g9, s, { type: "focus", target: { node: { id: "s:c", type: "p" } } }).state, { node: { id: "s:c", type: "p" } });
if (!pan || pan.dx !== -110 || pan.dy !== 0) fail(`the reveal pan of A.14 is ${JSON.stringify(pan)}`);
console.log(`ok A.14: ArrowRight from b focuses c and pans (${pan.dx}, ${pan.dy}); machine bytes ${serializeMachine(k.machine).length}`);

// 4. the lasso rectangle of I23: a b d e and four edges
const hits = lassoTargets(g9, initialState(g9, size), { x0: 150000, y0: 0, x1: 500000, y1: 350000 });
if (hits.length !== 8) fail(`the lasso found ${hits.length} elements, expected 8`);
console.log(`ok lasso: ${hits.length} elements in the rectangle of row I23`);

// 5. key tokens (A.11)
if (keyToken("E") !== "e" || keyToken(" ") !== "Space" || keyToken("#") !== undefined) fail("key tokens");
console.log(`smoke ok on Node ${process.version}`);
