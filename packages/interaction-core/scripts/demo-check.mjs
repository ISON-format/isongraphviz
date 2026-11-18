// scripts/demo-check.mjs (runs in `npm run check`; needs the built dists): the demo pipeline's model for the O1 source (FORCE layout, the igl:F01 policy) has the
// scene and layout hashes of the tracked corpus files O1, and the built-in event sequence of the demo replays without error through the machine and a headless
// renderer, ending in a state with the clicked node selected and the focus moved by the key.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { initialState } from "isongraph-visualize-renderer-core";
import { defaultEvents, pipeline, replay } from "./replay.mjs";

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = join(PKG, "..", "..");
const fail = (m) => { console.error(`DEMO CHECK FAIL: ${m}`); process.exit(1); };
const size = { width: 900, height: 600 };

const source = new Uint8Array(readFileSync(join(REPO, "fixtures", "oracles", "o1-basic.source.ison")));
const r = await pipeline(source, { layout: "force" });
if (r.model.sceneSha256 !== "e8a4357a01a4f47f46a18b8f1c22c15a9f8c26cb06ed6b31588cd5c11407a1dc") fail(`the scene hash is ${r.model.sceneSha256}`);
if (r.model.layoutSha256 !== "2f37ccf2d351dc8e6b742b5b4d7fe87fc182226a2ba2cf02ffbf832af66b23db") fail(`the layout hash is ${r.model.layoutSha256}`);

const events = defaultEvents(r.model, initialState(r.model, size));
const out = await replay(r.model, events, size);
if (out.transcript.steps.length !== events.length) fail("a step is missing");
if (out.state.selection.nodes.length === 0 && out.state.selection.edges.length === 0) fail("the click and the key left nothing selected");
if (out.state.focus === undefined) fail("ArrowRight did not focus anything");
// the FIXED path also runs
const f = await pipeline(source);
if (f.model.nodes.length !== 2) fail("the FIXED demo path");
console.log("demo check ok: the O1 source gives the corpus scene and layout hashes; the demo events replay (click, drag, wheel, key) into a valid state");
