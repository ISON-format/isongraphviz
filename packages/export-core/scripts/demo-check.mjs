// scripts/demo-check.mjs (runs in `npm run check`; needs the built dists): the ia-demo pipeline for fixtures/oracles/o1-basic.source.ison gives the corpus scene
// and layout hashes (design 17.1: the SVG and tree bytes are those of A.10 and A.1), and the demo bundle verifies.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compileScene } from "isongraph-visualize-scene-core";
import { computeForceLayout } from "isongraph-visualize-layout-core";
import { exportBundle, renderHeadless, verifyExportBundle } from "../dist/index.js";

const REPO = join(resolve(dirname(fileURLToPath(import.meta.url)), ".."), "..", "..");
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
console.log("demo check ok: the O1 source gives the corpus hashes, the SVG and tree bytes of A.10 and A.1, and a verifying bundle");
