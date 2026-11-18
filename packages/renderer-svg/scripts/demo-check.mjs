// scripts/demo-check.mjs (design 17.4 (a), runs in `npm run check`; needs the built dist): the demo pipeline's output for the O1 source (FORCE layout,
// the igl:F01 policy) equals the bytes of oracle row O05, and the chain of 9.2 on the produced model gives the T02 expected results.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveSelection, selectionReference } from "isongraph-visualize-renderer-core";
import { decodeElementId, elementDomId, pickElement } from "../dist/index.js";
import { pipeline } from "../demo/render-ison.mjs";

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ORACLES = join(PKG, "..", "..", "fixtures", "oracles-svg");
const fail = (m) => { console.error(`DEMO CHECK FAIL: ${m}`); process.exit(1); };
const sortKeys = (v) => (Array.isArray(v) ? v.map(sortKeys) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v);
const same = (a, b) => JSON.stringify(sortKeys(a ?? null)) === JSON.stringify(sortKeys(b ?? null));

const source = new Uint8Array(readFileSync(join(ORACLES, "..", "oracles", "o1-basic.source.ison")));
const r = await pipeline(source, { layout: "force" });
const o05 = readFileSync(join(ORACLES, "svg", "O05.svg"), "utf8");
if (r.svg !== o05) fail("the demo output for the O1 source differs from the bytes of oracle row O05");

const chain = JSON.parse(readFileSync(join(ORACLES, "json", "T02.chain.json"), "utf8"));
for (const el of chain.elements) {
  const id = elementDomId("igr", el.element);
  if (id !== el.id) fail(`id of ${JSON.stringify(el.element)}`);
  if (!same(decodeElementId("igr", id), el.element)) fail("decode");
  if (!same(pickElement(r.model, r.state, "igr", { targetId: id }), el.by_id)) fail("pickElement by id");
  if (!same(selectionReference(r.model, el.element), el.objectRef)) fail("ObjectRef");
  if (!same(await resolveSelection(r.model, el.element, source), el.identity)) fail("resolveSelection identity");
}
for (const p of chain.pointer) if (!same(pickElement(r.model, r.state, "igr", { point: { x: p.x, y: p.y } }) ?? null, p.pick)) fail(`pointer ${p.x},${p.y}`);

// the FIXED path of the demo (default) also runs through
const f = await pipeline(source);
if (f.model.nodes.length !== 2 || !f.svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<svg ')) fail("the FIXED demo path");
console.log("demo check ok: output equals row O05; the T02 chain holds on the produced model");
