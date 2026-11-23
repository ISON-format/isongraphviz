// scripts/demo-check.mjs (runs in `npm run check`; needs the built dists): the ia-demo pipeline for fixtures/oracles/o1-basic.source.ison gives the corpus scene
// and layout hashes (design 17.1: the SVG and tree bytes are those of A.10 and A.1), and the demo bundle verifies. Also (design 17.2, toggle SVG): the page wires the toggle button and the svg-native gate, and that gate passes on the demo model.
// Also the playground page (demo/playground.html, NON-NORMATIVE): its page bundle builds (esbuild, in memory), its sample compiles and lays out to a 9 to 30 node model with several types and relations,
// a moved node gives a NEW valid FIXED layout (the original layout bytes and hash unchanged) whose model renders and passes the accessibility gate, and the page data generator is deterministic.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compileScene } from "isongraph-visualize-scene-core";
import { renderSvg, readSvg } from "isongraph-visualize-renderer-svg";
import { runAccessibilityGate } from "isongraph-visualize-a11y-companion";
import { computeFixedLayout, computeForceLayout, verifyLayout } from "isongraph-visualize-layout-core";
import { buildRenderModel } from "isongraph-visualize-renderer-core";
import { build } from "esbuild";
import { playgroundData } from "./playground-data.mjs";
import { exportBundle, renderHeadless, verifyExportBundle } from "../dist/index.js";

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = join(PKG_ROOT, "..", "..");
const fail = (m) => { console.error(`DEMO CHECK FAIL: ${m}`); process.exit(1); };
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const source = new Uint8Array(readFileSync(join(REPO, "fixtures", "oracles", "o1-basic.source.ison")));
const scene = (await compileScene(source, "ison-v1")).sceneBytes;
const layout = (await computeForceLayout(scene, { width: 900, height: 600, iterations: 170, margin: 60, seed: 42 })).layoutBytes;
const r = await renderHeadless({ sceneBytes: scene, layoutBytes: layout, outputs: ["state", "svg", "tree"] });
if (r.model.sceneSha256 !== "e8a4357a01a4f47f46a18b8f1c22c15a9f8c26cb06ed6b31588cd5c11407a1dc") fail("scene hash");
if (r.model.layoutSha256 !== "2f37ccf2d351dc8e6b742b5b4d7fe87fc182226a2ba2cf02ffbf832af66b23db") fail("layout hash");
const O = join(REPO, "fixtures", "oracles-ia");
if (!same(r.files.get("svg"), new Uint8Array(readFileSync(join(O, "headless", "H02.bin")))) || !same(r.files.get("tree"), new Uint8Array(readFileSync(join(O, "headless", "H04.bin"))))) fail("svg or tree bytes differ from A.10 / A.1");
const b = await exportBundle(r.model, r.state, layout);
await verifyExportBundle(b.files, b.manifestBytes);
// design 17.2, the toggle SVG item: the page wires the button, and the svg-native gate composition the page runs (the names, tabindex values and root title and
// description of a readSvg result) passes on the demo model
const pageSource = readFileSync(join(PKG_ROOT, "demo", "page.mjs"), "utf8");
if (!/getElementById\("toggle"\)/.test(pageSource) || !/composition: "svg-native"/.test(pageSource)) fail("demo/page.mjs has no toggle button wiring or no svg-native gate composition");
const ro = readSvg(renderSvg(r.model, r.state));
const svgGate = runAccessibilityGate({ model: r.model, state: r.state, composition: "svg-native", svg: { root: { title: ro.title, desc: ro.desc }, items: [...ro.nodes, ...ro.edges].map((x) => ({ name: x.name, tabindex: Number(x.tabindex) })) }, tabStops: 1 });
if (svgGate.verdict !== "pass") fail(`the svg-native gate on the demo model: ${JSON.stringify(svgGate.checks.filter((c) => c.verdict === "fail"))}`);

// ---- the playground page
const pgHtml = readFileSync(join(PKG_ROOT, "demo", "playground.html"), "utf8");
if (!/<script src="out\/playground-data\.js">/.test(pgHtml) || !/<script src="out\/playground\.js">/.test(pgHtml)) fail("demo/playground.html does not load out/playground-data.js and out/playground.js");
const bundled = await build({ entryPoints: [join(PKG_ROOT, "demo", "playground.mjs")], bundle: true, write: false, format: "iife", platform: "browser", logLevel: "silent", target: "es2022", metafile: true }).catch((e) => fail(`demo/playground.mjs does not bundle: ${e.message}`));
const bundleText = bundled.outputFiles[0].text;
for (const needle of ["computeFixedLayout", "buildDisplayList", "bindInteraction", "createDomSvgRenderer", "createDomCanvasRenderer"]) if (!bundleText.includes(needle)) fail(`the playground bundle lacks ${needle}`);
const sample = join(PKG_ROOT, "demo", "playground-sample.ison");
const d1 = await playgroundData(sample), d2 = await playgroundData(sample);
if (JSON.stringify(d1) !== JSON.stringify(d2)) fail("the playground data generator is not deterministic");
const unb64 = (t) => new Uint8Array(Buffer.from(t, "base64"));
const pgScene = unb64(d1.sceneB64), pgLayout = unb64(d1.layoutB64);
const pgModel = await buildRenderModel(pgScene, pgLayout);
const rels = new Set(pgModel.edges.map((e) => e.ref.rel));
if (pgModel.nodes.length < 9 || pgModel.nodes.length > 30 || pgModel.categories.length < 3 || rels.size < 3) fail(`the playground sample is not a 9 to 30 node graph with 3 types and 3 relations (${pgModel.nodes.length} nodes, ${pgModel.categories.length} types, ${rels.size} relations)`);
// a moved node: a NEW valid FIXED layout; the original bytes and hash are as they were
const origSha = pgModel.layoutSha256, origCopy = Uint8Array.from(pgLayout);
const moved = await computeFixedLayout(pgScene, pgModel.nodes.map((n, i) => ({ ref: { id: n.ref.id, type: n.ref.type }, x: (n.x + (i === 0 ? 40_000 : 0)) / 1000, y: n.y / 1000 })));
if ((await verifyLayout(moved.layoutBytes)).layoutSha256 !== moved.layoutSha256 || moved.layoutSha256 === origSha || moved.layout.policy.family !== "FIXED") fail("a moved node did not give a new valid FIXED layout");
if (!same(pgLayout, origCopy) || (await verifyLayout(pgLayout)).layoutSha256 !== origSha) fail("the original playground layout changed");
const movedModel = await buildRenderModel(pgScene, moved.layoutBytes);
if (movedModel.nodes[0].x !== pgModel.nodes[0].x + 40_000 || movedModel.nodes.slice(1).some((n, i) => n.x !== pgModel.nodes[i + 1].x || n.y !== pgModel.nodes[i + 1].y)) fail("the moved layout did not move exactly the one node");
for (const [name, bytes] of [["original", pgLayout], ["moved", moved.layoutBytes]]) {
  const h = await renderHeadless({ sceneBytes: pgScene, layoutBytes: bytes, outputs: ["state", "svg", "tree"] });
  const ro2 = readSvg(new TextDecoder().decode(h.files.get("svg")));
  const g = runAccessibilityGate({ model: h.model, state: h.state, composition: "svg-native", svg: { root: { title: ro2.title, desc: ro2.desc }, items: [...ro2.nodes, ...ro2.edges].map((x) => ({ name: x.name, tabindex: Number(x.tabindex) })) }, tabStops: 1 });
  if (g.verdict !== "pass") fail(`the svg-native gate on the playground ${name} layout: ${JSON.stringify(g.checks.filter((c) => c.verdict === "fail"))}`);
}
console.log(`demo check ok (playground): the page bundles, the sample is ${pgModel.nodes.length} nodes / ${pgModel.edges.length} edges / ${pgModel.categories.length} types / ${rels.size} relations, a moved node gives a new valid FIXED layout and the original is unchanged`);
console.log("demo check ok: the O1 source gives the corpus hashes, the SVG and tree bytes of A.10 and A.1, a verifying bundle, and a passing svg-native gate on the demo model");
