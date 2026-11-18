// scripts/demo-check.mjs (design 15.3 (a), runs in `npm run check`; needs the built dists): the demo pipeline's output for the O1 source (FORCE layout, the
// igl:F01 policy) equals the bytes of rows dl:G01 (the list) and dl:C01 (the stream), and the chain of 5.3 on the produced model gives the P rows' results:
// a press on the KNOWS edge picks it, a press on a node centre picks the node and its identity resolves in the source.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveSelection, selectionReference } from "isongraph-visualize-renderer-core";
import { createPicker } from "isongraph-visualize-display-list";
import { pipeline } from "./render-ison.mjs";

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ORACLES = join(PKG, "..", "..", "fixtures", "oracles-dl");
const fail = (m) => { console.error(`DEMO CHECK FAIL: ${m}`); process.exit(1); };
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

const source = new Uint8Array(readFileSync(join(ORACLES, "..", "oracles", "o1-basic.source.ison")));
const r = await pipeline(source, { layout: "force" });
if (!same(r.listBytes, new Uint8Array(readFileSync(join(ORACLES, "dl", "G01.dl"))))) fail("the demo list for the O1 source differs from the bytes of row G01");
if (!same(r.calls, new Uint8Array(readFileSync(join(ORACLES, "calls", "C01.calls"))))) fail("the demo stream for the O1 source differs from the bytes of row C01");

const picker = createPicker(r.model, r.state);
const knows = { edge: { ord: "0", rel: "KNOWS", src: { id: "i:1", type: "person" }, tgt: { id: "s:ann", type: "person" } } };
const hit = picker.pick({ x: 500, y: 308 });
if (JSON.stringify(hit) !== JSON.stringify(knows)) fail("the press on the edge did not pick KNOWS");
if (picker.pick({ x: 500, y: 300 }) !== undefined) fail("a press 4 px beyond the tolerance picked something");
const node = picker.pick({ x: 32.072, y: 193.6 });
if (!node || !("node" in node) || node.node.id !== "i:1") fail("the press on the node centre did not pick i:1");
const ref = selectionReference(r.model, node);
const identity = await resolveSelection(r.model, node, source);
if (!ref || !identity) fail("the picked node does not resolve to the source");

// the FIXED path of the demo (default) also runs through
const f = await pipeline(source);
if (f.model.nodes.length !== 2 || f.listBytes.length === 0) fail("the FIXED demo path");
console.log("demo check ok: the list equals row G01, the stream row C01; the chain of 5.3 holds on the produced model");
